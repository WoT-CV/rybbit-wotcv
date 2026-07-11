import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(rootDir, "src");
const maxResults = Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] ?? 250);
const shouldFail = process.argv.includes("--fail");

const fileExtensions = new Set([".ts", ".tsx"]);
const skippedSegments = new Set(["node_modules", ".next", "dist", "build"]);
const ignoredValuePatterns = [
  /^[A-Z0-9_]+$/,
  /^[a-z0-9_-]+$/,
  /^[a-z]+:\/\/|^\/|^\?|^#|^\.|^\*|^@/,
  /^[\w.-]+@[\w.-]+$/,
  /^[\w.-]+\.[a-z]{2,}/i,
  /^[•·\s*.-]+$/,
  /^[0-9\s.,:%/+-]+$/,
  /^(Rybbit|WoT-CV|ClickHouse|PostgreSQL|Redis|Docker|GitHub|Discord|Twitter|Mapbox|Stripe|AppSumo|Google|Chrome|Safari|Firefox|Opera|Edge|Windows|Linux|Android|iOS|macOS|Mapbox|HTML|JSON|SQL|API|URL|IP|ASN|UA|LCP|CLS|INP|FCP|TTFB)$/i,
];

const patterns = [
  {
    kind: "jsx-text",
    regex: />\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</g,
    valueIndex: 1,
    extensions: new Set([".tsx"]),
  },
  {
    kind: "jsx-prop",
    regex: /\b(title|label|placeholder|description|message|tooltip|aria-label|alt)=["']([^"']*[A-Za-z][^"']*)["']/g,
    valueIndex: 2,
  },
  {
    kind: "object-prop",
    regex: /\b(title|label|placeholder|description|message|tooltip|ariaLabel|alt):\s*["']([^"']*[A-Za-z][^"']*)["']/g,
    valueIndex: 2,
  },
  {
    kind: "toast",
    regex: /\btoast\.(success|error|info|warning)\(["']([^"']*[A-Za-z][^"']*)["']/g,
    valueIndex: 2,
  },
  {
    kind: "error",
    regex: /\b(?:throw new Error|Error)\(["']([^"']*[A-Za-z][^"']*)["']/g,
    valueIndex: 1,
  },
];

function walk(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap(entry => {
    if (skippedSegments.has(entry)) return [];

    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) return walk(path);
    if (!stats.isFile()) return [];
    if (path.endsWith(".d.ts")) return [];

    const extension = path.slice(path.lastIndexOf("."));
    return fileExtensions.has(extension) ? [path] : [];
  });
}

function isIgnored(value) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) return true;
  if (!/[A-Za-z]{3,}/.test(normalized)) return true;
  if (normalized.includes("className")) return true;
  return ignoredValuePatterns.some(pattern => pattern.test(normalized));
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

const findings = [];

for (const file of walk(srcDir)) {
  const content = readFileSync(file, "utf8");
  const normalizedPath = relative(rootDir, file).replaceAll("\\", "/");
  const extension = file.slice(file.lastIndexOf("."));

  for (const pattern of patterns) {
    if (pattern.extensions && !pattern.extensions.has(extension)) continue;

    for (const match of content.matchAll(pattern.regex)) {
      const value = match[pattern.valueIndex] ?? "";
      if (isIgnored(value)) continue;

      findings.push({
        file: normalizedPath,
        line: lineNumber(content, match.index ?? 0),
        kind: pattern.kind,
        value: value.trim().replace(/\s+/g, " "),
      });
    }
  }
}

const visibleFindings = findings.slice(0, maxResults);

console.log(`Polish coverage audit: ${findings.length} potential hardcoded English strings`);
for (const finding of visibleFindings) {
  console.log(`${finding.file}:${finding.line} [${finding.kind}] ${finding.value}`);
}

if (findings.length > visibleFindings.length) {
  console.log(`... ${findings.length - visibleFindings.length} more. Use --limit=${findings.length} to show all.`);
}

if (shouldFail && findings.length > 0) {
  process.exitCode = 1;
}

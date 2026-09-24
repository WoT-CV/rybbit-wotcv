import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

// Baseline comparison does NOT suppress rules or make the full lint pass.
const root = fileURLToPath(new URL("../", import.meta.url));
const client = fileURLToPath(new URL("../client/", import.meta.url));
const baseline = "d6b623ec6cfeb52fb9953875feedaa6a4f93ce2c";
const { ESLint } = createRequire(new URL("../client/package.json", import.meta.url))("eslint");
const eslint = new ESLint({ cwd: client });
const results = await eslint.lintFiles(["."]);
let errors = 0,
  warnings = 0,
  baselineErrors = 0;
const changedErrorFiles = [],
  oldErrorFiles = [];
for (const result of results) {
  errors += result.errorCount;
  warnings += result.warningCount;
  if (!result.errorCount) continue;
  const path = relative(root, result.filePath).replaceAll("\\", "/");
  let original;
  try {
    original = execFileSync("git", ["show", `${baseline}:${path}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    changedErrorFiles.push(path);
    continue;
  }
  const current = await readFile(result.filePath, "utf8");
  if (original.replaceAll("\r\n", "\n") === current.replaceAll("\r\n", "\n")) {
    baselineErrors += result.errorCount;
    oldErrorFiles.push({ path, errors: result.errorCount });
  } else changedErrorFiles.push(path);
}
console.log(JSON.stringify({ baseline, errors, warnings, baselineErrors, changedErrorFiles, oldErrorFiles }, null, 2));
if (changedErrorFiles.length) process.exitCode = 1;

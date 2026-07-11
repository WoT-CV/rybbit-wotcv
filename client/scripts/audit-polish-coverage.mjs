import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const sourceCatalog = JSON.parse(readFileSync(join(rootDir, "messages", "en.json"), "utf8"));
const polishCatalog = JSON.parse(readFileSync(join(rootDir, "messages", "pl.json"), "utf8"));

const allowedIdenticalValues = new Set([
  "404",
  "Blog",
  "Core Web Vital",
  "CSV",
  "CTR",
  "Discord",
  "DNS",
  "GitHub",
  "Google",
  "Google Search Console",
  "Hacker News",
  "Host",
  "HTTP/HTTPS",
  "IP:",
  "JSON",
  "LinkedIn",
  "Medium",
  "Monitor",
  "Offline",
  "Operator",
  "Plan",
  "Port",
  "Pro",
  "Product Hunt",
  "React Native SDK",
  "Reddit",
  "Region",
  "Region:",
  "s",
  "Status",
  "Status:",
  "System",
  "Tablet",
  "Tag",
  "Test",
  "TLS",
  "Trend",
  "Twitter/X",
  "URL",
  "User Agent",
  "UTM",
  "Web Vital",
  "Web Vitals",
  "YouTube",
]);

const sortedKeys = values => Object.keys(values).sort((left, right) => left.localeCompare(right));
const placeholders = value => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();
const sameValues = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const sourceKeys = sortedKeys(sourceCatalog);
const polishKeys = new Set(Object.keys(polishCatalog));
const sourceKeySet = new Set(sourceKeys);

const missingKeys = sourceKeys.filter(key => !polishKeys.has(key));
const extraKeys = sortedKeys(polishCatalog).filter(key => !sourceKeySet.has(key));
const emptyValues = sourceKeys.filter(key => {
  const value = polishCatalog[key];
  return typeof value !== "string" || value.trim().length === 0;
});
const placeholderMismatches = sourceKeys.filter(key => {
  if (typeof polishCatalog[key] !== "string") return false;
  return !sameValues(placeholders(sourceCatalog[key]), placeholders(polishCatalog[key]));
});
const identicalValues = sourceKeys.filter(
  key => sourceCatalog[key] === polishCatalog[key] && !allowedIdenticalValues.has(sourceCatalog[key]),
);

const errors = [
  ["Brakujące klucze", missingKeys],
  ["Nadmiarowe klucze", extraKeys],
  ["Puste tłumaczenia", emptyValues],
  ["Niezgodne placeholdery", placeholderMismatches],
];

console.log(`Audyt tłumaczenia PL: ${sourceKeys.length} komunikatów`);
for (const [label, keys] of errors) {
  console.log(`${label}: ${keys.length}`);
  for (const key of keys) {
    console.log(`  ${key}: ${JSON.stringify(polishCatalog[key] ?? sourceCatalog[key])}`);
  }
}

console.log(`Identyczne wartości wymagające przeglądu: ${identicalValues.length}`);
for (const key of identicalValues) {
  console.log(`  ${key}: ${JSON.stringify(sourceCatalog[key])}`);
}

const hasErrors = errors.some(([, keys]) => keys.length > 0);
const strictIdentical = process.argv.includes("--strict-identical") && identicalValues.length > 0;

if (hasErrors || strictIdentical) {
  process.exitCode = 1;
} else {
  console.log("Katalog języka polskiego jest kompletny i spójny strukturalnie.");
}

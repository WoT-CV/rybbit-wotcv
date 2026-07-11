import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
const analyticsScriptDir = join(serverDir, "src", "analytics-script");

const run = (command, args, cwd = serverDir) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(process.execPath, [join(analyticsScriptDir, "build.js")], analyticsScriptDir);
run("git", [
  "diff",
  "--exit-code",
  "--",
  ":(top)server/public/script.js",
  ":(top)server/public/script-full.js",
]);

console.log("Generated analytics scripts are up to date.");

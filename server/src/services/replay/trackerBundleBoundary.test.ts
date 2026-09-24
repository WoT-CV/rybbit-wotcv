import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("tree-shakes UI-only shared contracts from the browser tracker", async () => {
  const source = fileURLToPath(new URL("../../analytics-script/index.ts", import.meta.url));
  const shared = fileURLToPath(new URL("../../../../shared/src/index.ts", import.meta.url));
  const bot = fileURLToPath(new URL("../../../../shared/src/botSignalContract.ts", import.meta.url));
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    metafile: true,
    format: "iife",
    target: "es2020",
    platform: "browser",
    minify: true,
    alias: { "@rybbit/shared": shared, "@rybbit/shared/dist/botSignalContract.js": bot },
  });
  const text = result.outputFiles[0].text;
  expect(text).toContain("CompressionStream");
  expect(text).not.toContain("mayRemoveCapturedFields");
  expect(text).not.toContain("REPLAY_COVERAGE_POLICY_VERSION");
  const bundled = Object.values(result.metafile.outputs).flatMap(output =>
    Object.entries(output.inputs)
      .filter(([, value]) => value.bytesInOutput > 0)
      .map(([path]) => path)
  );
  expect(
    bundled.filter(path => /shared\/dist|shared\/src\/replayCoverage|src\/(?:api|db|services)\//.test(path))
  ).toEqual([]);
  expect(bundled.filter(path => /node_modules/.test(path) && !path.includes("web-vitals"))).toEqual([]);
  expect(readFileSync(fileURLToPath(new URL("../../analytics-script/build.js", import.meta.url)), "utf8")).toContain(
    '"@rybbit/shared": resolve(__dirname, "../../../shared/src/index.ts")'
  );
});

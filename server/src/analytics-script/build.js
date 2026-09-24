import { build } from "esbuild";
import { existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure public directory exists
const publicDir = "../../public";
const sourceNotice =
  "/*! Modified WoT-CV fork of Rybbit | GNU AGPL-3.0 | Source: https://github.com/WoT-CV/rybbit-wotcv */";
if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

// The tracker shares the Bot Signal contract with the server through
// @rybbit/shared, which is published as CommonJS. Resolving it normally would
// bundle the module unshaken, so point esbuild at the TypeScript source and let
// it tree-shake down to the handful of values the browser actually uses. The
// Other browser contracts also resolve from ESM source so unused dashboard
// coverage/resolution code in the CommonJS barrel is not shipped to tracked pages.
const botSignalContractSource = resolve(__dirname, "../../../shared/src/botSignalContract.ts");
const bundleContractFromSource = {
  "@rybbit/shared/dist/botSignalContract.js": botSignalContractSource,
  "@rybbit/shared": resolve(__dirname, "../../../shared/src/index.ts"),
};

async function buildScript() {
  try {
    // Build the full version
    await build({
      entryPoints: ["./index.ts"],
      bundle: true,
      format: "iife",
      target: "es2020",
      outfile: "../../public/script-full.js",
      minify: false,
      sourcemap: false,
      platform: "browser",
      banner: { js: sourceNotice },
      alias: bundleContractFromSource,
    });

    console.log("✅ Built script-full.js");

    // Build the minified version
    await build({
      entryPoints: ["./index.ts"],
      bundle: true,
      format: "iife",
      target: "es2020",
      outfile: "../../public/script.js",
      minify: true,
      sourcemap: false,
      platform: "browser",
      banner: { js: sourceNotice },
      alias: bundleContractFromSource,
    });

    console.log("✅ Built script.js (minified)");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

buildScript();

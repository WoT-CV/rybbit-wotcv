import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps all client TypeScript imports independent of server source, including tests", () => {
  const clientRoot = fileURLToPath(new URL("../../", import.meta.url));
  const serverSource = resolve(clientRoot, "../server/src");
  const config = ts.readConfigFile(resolve(clientRoot, "tsconfig.json"), ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, clientRoot);
  expect(parsed.errors).toEqual([]);
  const cache = ts.createModuleResolutionCache(clientRoot, name => name, parsed.options);
  const violations: string[] = [];

  for (const file of parsed.fileNames) {
    const source = ts.sys.readFile(file);
    expect(source).toBeDefined();
    for (const imported of ts.preProcessFile(source!, true, true).importedFiles) {
      const resolved = ts.resolveModuleName(imported.fileName, file, parsed.options, ts.sys, cache).resolvedModule;
      // Also catch relative imports when server/src is absent in an isolated checkout.
      const target =
        resolved?.resolvedFileName ??
        (imported.fileName.startsWith(".") ? resolve(dirname(file), imported.fileName) : undefined);
      if (!target) continue;
      const fromServer = relative(serverSource, target);
      if (
        !isAbsolute(fromServer) &&
        fromServer !== ".." &&
        !fromServer.startsWith("../") &&
        !fromServer.startsWith("..\\")
      ) {
        violations.push(`${relative(clientRoot, file)} -> ${imported.fileName}`);
      }
    }
  }

  expect(violations, "Client Docker builds contain shared and client source, never server/src").toEqual([]);
});

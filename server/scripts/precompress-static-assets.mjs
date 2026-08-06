import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const assetNames = ["script.js", "rrweb.min.js", "web-vitals.iife.js"];

const precompressAsset = async assetName => {
  const assetPath = join(publicDirectory, assetName);
  const source = await readFile(assetPath);
  const [brotli, gzipped] = await Promise.all([
    brotliCompressAsync(source, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    gzipAsync(source, { level: 9 }),
  ]);

  await Promise.all([writeFile(`${assetPath}.br`, brotli), writeFile(`${assetPath}.gz`, gzipped)]);

  console.log(`Pre-compressed ${assetName}: ${source.length} B -> ${brotli.length} B br / ${gzipped.length} B gzip`);
};

await Promise.all(assetNames.map(precompressAsset));

import type { preParsingAsyncHookHandler } from "fastify";
import { Readable } from "node:stream";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const unzip = promisify(gunzip);
const uploadError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

/** Only mount on replay record. Both encoded and decoded bytes obey the existing route limit. */
export const decodeReplayUpload: preParsingAsyncHookHandler = async (request, _reply, payload) => {
  const encoding = request.headers["content-encoding"]?.trim().toLowerCase();
  if (encoding === undefined || encoding === "identity") return payload;
  if (encoding !== "gzip") throw uploadError(415, "Unsupported replay content encoding");
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
    throw uploadError(415, "Compressed replay requires application/json");
  }
  const limit = request.routeOptions.bodyLimit;
  const declared = request.headers["content-length"];
  if (declared !== undefined && Number(declared) > limit) throw uploadError(413, "Replay upload too large");
  const chunks: Buffer[] = [];
  let encodedBytes = 0;
  for await (const chunk of payload) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    encodedBytes += bytes.length;
    if (encodedBytes > limit) throw uploadError(413, "Replay upload too large");
    chunks.push(bytes);
  }
  if (declared !== undefined && Number(declared) !== encodedBytes) {
    throw uploadError(400, "Invalid replay content length");
  }
  let decoded: Buffer;
  try {
    const encoded = Buffer.concat(chunks, encodedBytes);
    chunks.length = 0;
    decoded = await unzip(encoded, { maxOutputLength: limit });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw uploadError(413, "Replay upload too large");
    }
    throw uploadError(400, "Invalid replay gzip");
  }
  // Fastify must compare Content-Length with encoded, not expanded, bytes.
  return Object.assign(Readable.from([decoded]), { receivedEncodedLength: encodedBytes });
};

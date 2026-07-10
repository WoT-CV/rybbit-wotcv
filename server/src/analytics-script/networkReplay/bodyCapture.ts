import type { CapturedBody, CapturedBodyKind } from "./types.js";
import { getUtf8ByteSize } from "./utils.js";

export interface BodyCaptureLimits {
  maxBodySizeBytes: number;
  bodyReadTimeoutMs: number;
}

interface FetchBodySource {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
}

interface TimedResult<T> {
  value?: T;
  error?: unknown;
  timedOut: boolean;
}

export function createUnavailableBody(kind: CapturedBodyKind, reason: string, contentType?: string): CapturedBody {
  return {
    kind,
    contentType: contentType || undefined,
    reason,
  };
}

export function captureRequestBody(request: Request, limits: BodyCaptureLimits): Promise<CapturedBody> {
  return captureFetchBody(request, limits);
}

export function captureResponseBody(response: Response, limits: BodyCaptureLimits): Promise<CapturedBody> {
  return captureFetchBody(response, limits);
}

async function captureFetchBody(source: FetchBodySource, limits: BodyCaptureLimits): Promise<CapturedBody> {
  const contentType = source.headers.get("content-type") || undefined;
  const contentLength = parseContentLength(source.headers.get("content-length"));

  if (contentLength !== undefined && contentLength > limits.maxBodySizeBytes) {
    return {
      kind: "too-large",
      contentType,
      sizeBytes: contentLength,
      truncated: true,
      reason: "Body exceeds the configured size limit",
    };
  }

  if (!source.body) {
    return {
      kind: "empty",
      contentType,
      sizeBytes: 0,
    };
  }

  if (!isTextContentType(contentType)) {
    return {
      kind: "binary-unavailable",
      contentType,
      sizeBytes: contentLength,
      reason: "Binary body capture is not supported",
    };
  }

  return readTextStream(source.body, contentType, limits);
}

export async function captureBodyValue(
  body: unknown,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  try {
    if (body === undefined || body === null) {
      return {
        kind: "empty",
        contentType,
        sizeBytes: 0,
      };
    }

    if (typeof body === "string") {
      return captureTextValue(body, getTextBodyKind(contentType), contentType, limits);
    }

    if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      return captureTextValue(body.toString(), "url-search-params", contentType, limits);
    }

    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return captureFormData(body, contentType, limits);
    }

    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return captureBlob(body, contentType, limits);
    }

    if (body instanceof ArrayBuffer) {
      return captureArrayBufferSize(body.byteLength, contentType, limits);
    }

    if (ArrayBuffer.isView(body)) {
      return captureArrayBufferSize(body.byteLength, contentType, limits);
    }

    if (typeof Document !== "undefined" && body instanceof Document) {
      const serializedDocument = new XMLSerializer().serializeToString(body);
      return captureTextValue(serializedDocument, "text", contentType, limits);
    }

    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return createUnavailableBody("stream-unavailable", "Direct stream body capture is not supported", contentType);
    }

    return createUnavailableBody("unreadable", "Unsupported body type", contentType);
  } catch (error) {
    return createUnavailableBody("unreadable", getErrorMessage(error), contentType);
  }
}

export async function captureXhrResponseBody(
  xhr: XMLHttpRequest,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  try {
    switch (xhr.responseType) {
      case "":
      case "text":
        return captureTextValue(xhr.responseText || "", getTextBodyKind(contentType), contentType, limits);
      case "json": {
        if (xhr.response === null || xhr.response === undefined) {
          return { kind: "empty", contentType, sizeBytes: 0 };
        }

        const serializedJson = JSON.stringify(xhr.response);
        return captureTextValue(serializedJson, "json", contentType, limits);
      }
      case "blob":
        return captureBodyValue(xhr.response, contentType, limits);
      case "arraybuffer":
        return captureBodyValue(xhr.response, contentType, limits);
      case "document":
        return captureBodyValue(xhr.response, contentType, limits);
      default:
        return createUnavailableBody("binary-unavailable", "Unsupported XMLHttpRequest response type", contentType);
    }
  } catch (error) {
    return createUnavailableBody("unreadable", getErrorMessage(error), contentType);
  }
}

async function readTextStream(
  stream: ReadableStream<Uint8Array>,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  const reader = stream.getReader();
  const readTask = consumeTextStream(reader, contentType, limits.maxBodySizeBytes);
  const timedResult = await resolveWithTimeout(readTask, limits.bodyReadTimeoutMs);

  if (timedResult.timedOut) {
    void reader.cancel().catch(() => undefined);
    return createUnavailableBody("timeout", "Body read timed out", contentType);
  }

  if (timedResult.error) {
    return createUnavailableBody("unreadable", getErrorMessage(timedResult.error), contentType);
  }

  return timedResult.value ?? createUnavailableBody("unreadable", "Body read failed", contentType);
}

async function consumeTextStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  contentType: string | undefined,
  maxBodySizeBytes: number
): Promise<CapturedBody> {
  if (typeof TextDecoder === "undefined") {
    void reader.cancel().catch(() => undefined);
    return createUnavailableBody("unreadable", "Text decoding is not supported by this browser", contentType);
  }

  const decoder = new TextDecoder();
  let sizeBytes = 0;
  let value = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      value += decoder.decode();
      if (sizeBytes === 0) {
        return {
          kind: "empty",
          contentType,
          sizeBytes: 0,
        };
      }

      return {
        kind: getTextBodyKind(contentType),
        value,
        contentType,
        sizeBytes,
      };
    }

    sizeBytes += chunk.value.byteLength;
    if (sizeBytes > maxBodySizeBytes) {
      void reader.cancel().catch(() => undefined);
      return {
        kind: "too-large",
        contentType,
        sizeBytes,
        truncated: true,
        reason: "Body exceeds the configured size limit",
      };
    }

    value += decoder.decode(chunk.value, { stream: true });
  }
}

async function captureBlob(
  blob: Blob,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  const resolvedContentType = blob.type || contentType;

  if (blob.size > limits.maxBodySizeBytes) {
    return {
      kind: "too-large",
      contentType: resolvedContentType,
      sizeBytes: blob.size,
      truncated: true,
      reason: "Body exceeds the configured size limit",
    };
  }

  if (!isTextContentType(resolvedContentType)) {
    return {
      kind: "blob-metadata",
      contentType: resolvedContentType,
      sizeBytes: blob.size,
    };
  }

  const timedResult = await resolveWithTimeout(readBlobText(blob), limits.bodyReadTimeoutMs);
  if (timedResult.timedOut) {
    return createUnavailableBody("timeout", "Blob read timed out", resolvedContentType);
  }

  if (timedResult.error || timedResult.value === undefined) {
    return createUnavailableBody("unreadable", getErrorMessage(timedResult.error), resolvedContentType);
  }

  return captureTextValue(timedResult.value, getTextBodyKind(resolvedContentType), resolvedContentType, limits);
}

async function captureFormData(
  formData: FormData,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): Promise<CapturedBody> {
  const entries: Array<{ name: string; value: string | { name?: string; size: number; type: string } }> = [];

  formData.forEach((value, name) => {
    if (typeof value === "string") {
      entries.push({ name, value });
      return;
    }

    entries.push({
      name,
      value: {
        name: "name" in value ? value.name : undefined,
        size: value.size,
        type: value.type,
      },
    });
  });

  return captureTextValue(JSON.stringify(entries), "form-data", contentType, limits);
}

function captureArrayBufferSize(
  sizeBytes: number,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): CapturedBody {
  if (sizeBytes > limits.maxBodySizeBytes) {
    return {
      kind: "too-large",
      contentType,
      sizeBytes,
      truncated: true,
      reason: "Body exceeds the configured size limit",
    };
  }

  return {
    kind: "array-buffer-metadata",
    contentType,
    sizeBytes,
  };
}

function captureTextValue(
  value: string,
  kind: CapturedBodyKind,
  contentType: string | undefined,
  limits: BodyCaptureLimits
): CapturedBody {
  const sizeBytes = getUtf8ByteSize(value);
  if (sizeBytes === 0) {
    return {
      kind: "empty",
      contentType,
      sizeBytes: 0,
    };
  }

  if (sizeBytes > limits.maxBodySizeBytes) {
    return {
      kind: "too-large",
      contentType,
      sizeBytes,
      truncated: true,
      reason: "Body exceeds the configured size limit",
    };
  }

  return {
    kind,
    value,
    contentType,
    sizeBytes,
  };
}

function getTextBodyKind(contentType?: string): CapturedBodyKind {
  const normalizedContentType = contentType?.toLowerCase() || "";
  if (normalizedContentType.includes("json")) {
    return "json";
  }

  if (normalizedContentType.includes("application/x-www-form-urlencoded")) {
    return "url-search-params";
  }

  if (normalizedContentType.includes("multipart/form-data")) {
    return "form-data";
  }

  return "text";
}

function isTextContentType(contentType?: string): boolean {
  if (!contentType) {
    return true;
  }

  const normalizedContentType = contentType.toLowerCase();
  return (
    normalizedContentType.startsWith("text/") ||
    normalizedContentType.includes("json") ||
    normalizedContentType.includes("xml") ||
    normalizedContentType.includes("javascript") ||
    normalizedContentType.includes("application/x-www-form-urlencoded") ||
    normalizedContentType.includes("graphql")
  );
}

function parseContentLength(contentLength: string | null): number | undefined {
  if (!contentLength) {
    return undefined;
  }

  const parsedContentLength = Number(contentLength);
  return Number.isFinite(parsedContentLength) && parsedContentLength >= 0 ? parsedContentLength : undefined;
}

async function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<TimedResult<T>> {
  let timeoutId: number | undefined;
  const settledPromise: Promise<TimedResult<T>> = promise
    .then(value => ({ value, timedOut: false }))
    .catch(error => ({ error, timedOut: false }));
  const timeoutPromise = new Promise<TimedResult<T>>(resolve => {
    timeoutId = window.setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  const result = await Promise.race([settledPromise, timeoutPromise]);
  if (timeoutId !== undefined) {
    window.clearTimeout(timeoutId);
  }
  return result;
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }

  if (typeof FileReader === "undefined") {
    return Promise.reject(new Error("Blob text reading is not supported by this browser"));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Blob text reading returned an unsupported result"));
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Blob text reading failed")));
    reader.addEventListener("abort", () => reject(new Error("Blob text reading was aborted")));
    reader.readAsText(blob);
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : error ? String(error) : "Unknown body capture error";
}

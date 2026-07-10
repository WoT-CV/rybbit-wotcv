import type { CapturedNetworkError } from "./types.js";

export function createRequestId(): string {
  try {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    return createFallbackRequestId();
  }

  return createFallbackRequestId();
}

function createFallbackRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getCurrentUrl(): string {
  try {
    return window.location.href;
  } catch {
    return "";
  }
}

export function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, getCurrentUrl() || undefined).href;
  } catch {
    return url;
  }
}

export function getFetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (typeof URL !== "undefined" && input instanceof URL) {
    return input.href;
  }

  return "url" in input ? input.url : input.href;
}

export function getErrorDetails(error: unknown): CapturedNetworkError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function getDurationMs(startedAt: number, completedAt: number): number {
  return Math.max(0, completedAt - startedAt);
}

export function getUtf8ByteSize(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    try {
      return new TextEncoder().encode(value).byteLength;
    } catch {
      return getUtf8ByteSizeWithoutEncoder(value);
    }
  }

  return getUtf8ByteSizeWithoutEncoder(value);
}

export function getJsonByteSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return 0;
    }

    return getUtf8ByteSize(serialized);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function getUtf8ByteSizeWithoutEncoder(value: string): number {
  let sizeBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      sizeBytes += 1;
    } else if (codeUnit <= 0x7ff) {
      sizeBytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        sizeBytes += 4;
        index += 1;
      } else {
        sizeBytes += 3;
      }
    } else {
      sizeBytes += 3;
    }
  }

  return sizeBytes;
}

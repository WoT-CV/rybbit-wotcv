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

export function getJsonByteSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return 0;
    }

    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(serialized).byteLength;
    }

    let sizeBytes = 0;
    for (const character of serialized) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint <= 0x7f) {
        sizeBytes += 1;
      } else if (codePoint <= 0x7ff) {
        sizeBytes += 2;
      } else if (codePoint <= 0xffff) {
        sizeBytes += 3;
      } else {
        sizeBytes += 4;
      }
    }

    return sizeBytes;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

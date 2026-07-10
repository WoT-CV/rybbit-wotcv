export function captureHeaders(headers?: HeadersInit | null): Record<string, string> {
  if (!headers) {
    return {};
  }

  try {
    const capturedHeaders: Record<string, string> = {};
    new Headers(headers).forEach((value, key) => {
      capturedHeaders[key] = value;
    });
    return capturedHeaders;
  } catch {
    return {};
  }
}

export function appendCapturedHeader(headers: Record<string, string>, name: string, value: string): void {
  const normalizedName = name.toLowerCase();
  headers[normalizedName] = headers[normalizedName] ? `${headers[normalizedName]}, ${value}` : value;
}

export function getCapturedHeader(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

export function parseXhrResponseHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const line of rawHeaders.trim().split(/[\r\n]+/)) {
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    appendCapturedHeader(headers, line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return headers;
}

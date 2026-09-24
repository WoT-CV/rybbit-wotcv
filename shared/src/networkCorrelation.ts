export function normalizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return /^[a-zA-Z0-9._-]{1,128}$/.test(id) ? id : undefined;
}

export function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) && !/^0+$/.test(id) ? id : undefined;
}

export function readResponseCorrelation(getHeader: (name: string) => string | null): { correlationId?: string } {
  try {
    return { correlationId: normalizeCorrelationId(getHeader("x-correlation-id")) };
  } catch {
    return {};
  }
}

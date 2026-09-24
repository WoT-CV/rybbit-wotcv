import { normalizeCorrelationId, normalizeTraceId, readResponseCorrelation } from "@rybbit/shared";
import { describe, expect, it } from "vitest";

describe("network correlation metadata", () => {
  it("extracts a bounded response ID without reading other headers or bodies", () => {
    const names: string[] = [];
    expect(
      readResponseCorrelation(name => {
        names.push(name);
        return "  abc-123._  ";
      })
    ).toEqual({ correlationId: "abc-123._" });
    expect(names).toEqual(["x-correlation-id"]);
  });
  it.each([null, undefined, 42, "", "a".repeat(129), "a b", 'a" | json', "<script>", "a\nb"])(
    "rejects malformed ID %j",
    value => {
      expect(normalizeCorrelationId(value)).toBeUndefined();
    }
  );
  it("does not interfere with requests when a header is unavailable", () => {
    expect(
      readResponseCorrelation(() => {
        throw new Error("opaque response");
      })
    ).toEqual({});
    expect(readResponseCorrelation(() => null).correlationId).toBeUndefined();
  });
  it("does not confuse arbitrary correlation/error IDs with real trace identifiers", () => {
    expect(normalizeTraceId("a".repeat(32))).toBe("a".repeat(32));
    expect(normalizeTraceId("0".repeat(32))).toBeUndefined();
    expect(normalizeTraceId("error-id")).toBeUndefined();
  });
});

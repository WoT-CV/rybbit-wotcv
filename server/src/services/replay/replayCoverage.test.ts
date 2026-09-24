import { describe, expect, it } from "vitest";
import { resolveReplayCoverage, type ReplayObservabilityProfile } from "@rybbit/shared";

const profile: ReplayObservabilityProfile = {
  requestOrigin: "https://api.wot-cv.com",
  grafanaUrl: "https://dashboard.wot-cv.com",
  orgId: 1,
  lokiDatasourceUid: "loki",
  serviceName: "be-prod",
  environment: "prod",
  timePaddingMs: 120000,
};
const request = {
  url: "https://api.wot-cv.com/web/api/wot-cv/players?x=1",
  method: "GET",
  initiatorType: "fetch",
  outcome: "success",
  correlationId: "example-correlation",
  status: 200,
};

describe("coverage v1 without a durable body archive", () => {
  it.each([
    "https://api.wot-cv.com.evil.test/x",
    "http://api.wot-cv.com/x",
    "https://api.wot-cv.com:444/x",
    "https://chat.wot-cv.com/x",
    "https://fonts.example/x",
  ])("does not inherit coverage for %s", url => {
    expect(resolveReplayCoverage({ ...request, url }, [profile]).reason).toBe("unconfigured_origin");
  });
  it.each([200, 401, 403, 500])("IDs/status %s are not evidence of storage", status => {
    const decision = resolveReplayCoverage(
      {
        ...request,
        status,
        outcome: status >= 400 ? "http_error" : "success",
        bodySaved: true,
        coverage: "verified",
        traceId: "1".repeat(32),
      },
      [profile]
    );
    expect(Object.values(decision.fields)).toEqual(Array(5).fill("unknown"));
    expect(decision.mayRemoveCapturedFields).toBe(false);
  });
  it.each(["aborted", "timeout", "network_error", "pending_on_unload"])(
    "preserves browser-only outcome %s",
    outcome => {
      expect(resolveReplayCoverage({ ...request, outcome }, [profile]).fields.requestBody).toBe("unavailable");
    }
  );
  it("does not mutate historical full bodies or trust an ambiguous/invalid origin", () => {
    const full = { ...request, responseBody: { kind: "json", value: "historical" } };
    const saved = JSON.stringify(full);
    resolveReplayCoverage(full, [profile]);
    expect(JSON.stringify(full)).toBe(saved);
    expect(resolveReplayCoverage(full, [profile, profile]).reason).toBe("unconfigured_origin");
    expect(resolveReplayCoverage({ ...full, url: "https://user:secret@api.wot-cv.com/x" }, [profile]).reason).toBe(
      "invalid_request"
    );
    expect(resolveReplayCoverage(null).mayRemoveCapturedFields).toBe(false);
  });
  it("requires a valid ID but never relaxes metadata privacy", () => {
    expect(resolveReplayCoverage({ ...request, correlationId: "bad\nid" }, [profile]).reason).toBe("missing_id");
    expect(resolveReplayCoverage({ ...request, captureMode: "metadata" }, [profile]).mayRemoveCapturedFields).toBe(
      false
    );
  });
});

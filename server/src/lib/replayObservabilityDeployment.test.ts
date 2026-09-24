import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("replay observability deployment defaults", () => {
  it.each(["docker-compose.yml", "docker-compose.cloud.yml"])(
    "%s preserves an unset value so the backend can choose its scoped defaults",
    filename => {
      const source = readFileSync(new URL(`../../../${filename}`, import.meta.url), "utf8");
      const assignments = source
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith("- WOTCV_REPLAY_OBSERVABILITY_PROFILES="));
      expect(assignments).toEqual(["- WOTCV_REPLAY_OBSERVABILITY_PROFILES=${WOTCV_REPLAY_OBSERVABILITY_PROFILES:-}"]);
    }
  );

  it("does not disable the built-in defaults when the example environment is copied", () => {
    const source = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    expect(source.match(/^WOTCV_REPLAY_OBSERVABILITY_PROFILES=.*$/gm)).toEqual([
      "WOTCV_REPLAY_OBSERVABILITY_PROFILES=",
    ]);
  });
});

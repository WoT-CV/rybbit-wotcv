import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { mapGrowthAccountingRows } from "./getGrowthAccounting.js";

describe("mapGrowthAccountingRows", () => {
  it("fills missing daily periods with zero values", () => {
    const result = mapGrowthAccountingRows(
      [{ period: "2026-07-10", new_users: 2, returning_users: 3, resurrecting_users: 1, dormant_users: 4 }],
      DateTime.fromISO("2026-07-10", { zone: "Europe/Warsaw" }),
      DateTime.fromISO("2026-07-11", { zone: "Europe/Warsaw" }),
      "day"
    );

    expect(result).toEqual([
      { period: "2026-07-10", newUsers: 2, returningUsers: 3, resurrectingUsers: 1, dormantUsers: 4 },
      { period: "2026-07-11", newUsers: 0, returningUsers: 0, resurrectingUsers: 0, dormantUsers: 0 },
    ]);
  });

  it("advances weekly without creating daily points", () => {
    const result = mapGrowthAccountingRows(
      [],
      DateTime.fromISO("2026-07-06", { zone: "Europe/Warsaw" }),
      DateTime.fromISO("2026-07-20", { zone: "Europe/Warsaw" }),
      "week"
    );
    expect(result.map(point => point.period)).toEqual(["2026-07-06", "2026-07-13", "2026-07-20"]);
  });
});

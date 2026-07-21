import { describe, expect, it } from "vitest";

import { getGrowthTooltipValues } from "./growthAccountingChartUtils";

describe("getGrowthTooltipValues", () => {
  it("returns every series for the hovered period and displays dormant users as a positive value", () => {
    expect(
      getGrowthTooltipValues({
        period: "2026-07-21",
        newUsers: 0,
        returningUsers: 2,
        resurrectingUsers: 0,
        dormantUsers: -19,
      })
    ).toEqual({
      newUsers: 0,
      returningUsers: 2,
      resurrectingUsers: 0,
      dormantUsers: 19,
    });
  });
});

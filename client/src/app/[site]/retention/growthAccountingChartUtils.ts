import type { GrowthAccountingPoint } from "@/api/analytics/endpoints";

export type GrowthTooltipValues = Omit<GrowthAccountingPoint, "period">;

export function getGrowthTooltipValues(point: GrowthAccountingPoint): GrowthTooltipValues {
  return {
    newUsers: Math.abs(point.newUsers),
    returningUsers: Math.abs(point.returningUsers),
    resurrectingUsers: Math.abs(point.resurrectingUsers),
    dormantUsers: Math.abs(point.dormantUsers),
  };
}

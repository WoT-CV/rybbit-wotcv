export type GrowthAccountingMode = "day" | "week";

export interface GrowthAccountingPoint {
  period: string;
  newUsers: number;
  returningUsers: number;
  resurrectingUsers: number;
  dormantUsers: number;
}

export interface GrowthAccountingResponse {
  data: GrowthAccountingPoint[];
  mode: GrowthAccountingMode;
  range: number;
}

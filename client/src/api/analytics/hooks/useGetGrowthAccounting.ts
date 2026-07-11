import { useQuery } from "@tanstack/react-query";

import { buildApiParams } from "../../utils";
import { getTimezone, useStore } from "../../../lib/store";
import { fetchGrowthAccounting, GrowthAccountingResponse, RetentionMode } from "../endpoints";

export function useGetGrowthAccounting(mode: RetentionMode = "day", range: number = 90) {
  const { site, timezone } = useStore();
  const resolvedTimeZone = getTimezone();

  return useQuery<GrowthAccountingResponse>({
    queryKey: ["growth-accounting", site, mode, range, timezone, resolvedTimeZone],
    queryFn: () => fetchGrowthAccounting(site, { mode, range, timeZone: resolvedTimeZone }),
    enabled: !!site,
  });
}

export function useDashboardGrowthAccounting(siteId: string | number | undefined, cardId: string, enabled = true) {
  const time = useStore(state => state.time);
  const bucket = useStore(state => state.bucket);
  const apiParams = buildApiParams(time);
  const mode: RetentionMode = bucket === "week" || bucket === "month" || bucket === "year" ? "week" : "day";
  const params = {
    mode,
    range: 365,
    timeZone: apiParams.timeZone,
    startDate: apiParams.startDate || undefined,
    endDate: apiParams.endDate || undefined,
    startDateTime: apiParams.startDateTime,
    endDateTime: apiParams.endDateTime,
    pastMinutesStart: apiParams.pastMinutesStart,
    pastMinutesEnd: apiParams.pastMinutesEnd,
  };

  return useQuery<GrowthAccountingResponse>({
    queryKey: ["dashboard-growth-accounting", siteId, cardId, params],
    queryFn: () => fetchGrowthAccounting(siteId!, params),
    enabled: enabled && !!siteId,
    retry: false,
  });
}

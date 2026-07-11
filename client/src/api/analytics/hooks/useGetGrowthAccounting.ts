import { useQuery } from "@tanstack/react-query";

import { getTimezone, useStore } from "../../../lib/store";
import { fetchGrowthAccounting, GrowthAccountingResponse, RetentionMode } from "../endpoints";

export function useGetGrowthAccounting(mode: RetentionMode = "week", range: number = 90) {
  const { site, timezone } = useStore();
  const resolvedTimeZone = getTimezone();

  return useQuery<GrowthAccountingResponse>({
    queryKey: ["growth-accounting", site, mode, range, timezone, resolvedTimeZone],
    queryFn: () => fetchGrowthAccounting(site, { mode, range, timeZone: resolvedTimeZone }),
    enabled: !!site,
  });
}

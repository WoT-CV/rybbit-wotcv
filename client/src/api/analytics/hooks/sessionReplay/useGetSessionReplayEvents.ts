import { GetSessionReplayEventsResponse } from "../../endpoints";
import { useAnalyticsQuery } from "../../useAnalyticsQuery";

export function useGetSessionReplayEvents(siteId: number, sessionId: string) {
  return useAnalyticsQuery<GetSessionReplayEventsResponse>({
    key: ["session-replay-events", sessionId],
    path: `session-replay/${sessionId}`,
    unwrap: false,
    site: siteId,
    useTime: false,
    useFilters: false,
    enabled: !!sessionId,
    // Keyed by session: never play the previous replay's events.
    placeholder: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
    // A replay can be tens of MB before rrweb constructs its DOM. Release
    // inactive recordings instead of retaining several of them on a phone.
    // Multiple active consumers (player/topbar/timeline) still share one query.
    props: { gcTime: 0, refetchOnWindowFocus: false },
  });
}

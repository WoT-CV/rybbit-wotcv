import { useQuery } from "@tanstack/react-query";

import { useStore } from "@/lib/store";
import { userStore } from "@/lib/userStore";

import { fetchReplayObservability } from "../endpoints/replayObservability";

export function useReplayObservability() {
  const siteId = useStore(state => state.site);
  const userId = userStore(state => state.user?.id);
  const query = useQuery({
    queryKey: ["replay-observability", siteId, userId],
    queryFn: () => fetchReplayObservability(siteId!),
    enabled: !!siteId && !!userId,
    staleTime: 60_000,
    retry: false,
  });
  return userId && siteId ? query.data?.profiles : undefined;
}

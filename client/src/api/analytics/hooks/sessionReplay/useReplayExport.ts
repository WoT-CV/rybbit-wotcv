import { useMutation, useQuery } from "@tanstack/react-query";

import {
  cancelReplayExport,
  createReplayExport,
  downloadReplayExport,
  fetchReplayExportStatus,
  type ReplayExportOptions,
} from "../../endpoints";

export function useCreateReplayExport() {
  return useMutation({
    mutationFn: ({ siteId, sessionId, options }: { siteId: number; sessionId: string; options: ReplayExportOptions }) =>
      createReplayExport(siteId, sessionId, options),
  });
}

export function useReplayExportStatus(siteId: number, sessionId: string, exportId: string | null) {
  return useQuery({
    queryKey: ["session-replay-export", siteId, sessionId, exportId],
    queryFn: () => fetchReplayExportStatus(siteId, sessionId, exportId!),
    enabled: Boolean(siteId && sessionId && exportId),
    refetchInterval: query => {
      const state = query.state.data?.state;
      return state && ["ready", "failed", "cancelled"].includes(state) ? false : 1000;
    },
  });
}

export function useDownloadReplayExport() {
  return useMutation({
    mutationFn: ({ siteId, sessionId, exportId }: { siteId: number; sessionId: string; exportId: string }) =>
      downloadReplayExport(siteId, sessionId, exportId),
  });
}

export function useCancelReplayExport() {
  return useMutation({
    mutationFn: ({ siteId, sessionId, exportId }: { siteId: number; sessionId: string; exportId: string }) =>
      cancelReplayExport(siteId, sessionId, exportId),
  });
}

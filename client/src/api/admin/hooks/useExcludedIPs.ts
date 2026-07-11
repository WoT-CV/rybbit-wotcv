import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { useExtracted } from "next-intl";
import {
  fetchExcludedIPs,
  updateExcludedIPs,
  UpdateExcludedIPsRequest,
  UpdateExcludedIPsResponse,
} from "../endpoints";

// Hook to fetch excluded IPs
export const useGetExcludedIPs = (siteId: number) => {
  return useQuery({
    queryKey: ["excludedIPs", siteId],
    queryFn: () => fetchExcludedIPs(siteId.toString()),
    enabled: !!siteId,
  });
};

// Hook to update excluded IPs
export const useUpdateExcludedIPs = () => {
  const t = useExtracted();
  const queryClient = useQueryClient();

  return useMutation<UpdateExcludedIPsResponse, Error, UpdateExcludedIPsRequest>({
    mutationFn: ({ siteId, excludedIPs }: UpdateExcludedIPsRequest) => updateExcludedIPs(siteId, excludedIPs),
    onSuccess: (_: UpdateExcludedIPsResponse, variables: UpdateExcludedIPsRequest) => {
      toast.success(t("Excluded IPs updated successfully"));
      // Invalidate and refetch excluded IPs data
      queryClient.invalidateQueries({
        queryKey: ["excludedIPs", variables.siteId],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t("Failed to update excluded IPs"));
    },
  });
};

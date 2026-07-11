import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { useExtracted } from "next-intl";
import {
  fetchExcludedPaths,
  updateExcludedPaths,
  fetchExcludedHostnames,
  updateExcludedHostnames,
  fetchExcludedUserAgents,
  updateExcludedUserAgents,
} from "../endpoints";

// Excluded paths
export const useGetExcludedPaths = (siteId: number) => {
  return useQuery({
    queryKey: ["excludedPaths", siteId],
    queryFn: () => fetchExcludedPaths(siteId.toString()),
    enabled: !!siteId,
  });
};

export const useUpdateExcludedPaths = () => {
  const t = useExtracted();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { siteId: number; excludedPaths: string[] }>({
    mutationFn: ({ siteId, excludedPaths }) => updateExcludedPaths(siteId, excludedPaths),
    onSuccess: (_, variables) => {
      toast.success(t("Excluded paths updated successfully"));
      queryClient.invalidateQueries({ queryKey: ["excludedPaths", variables.siteId] });
    },
    onError: error => {
      toast.error(error.message || t("Failed to update excluded paths"));
    },
  });
};

// Excluded hostnames
export const useGetExcludedHostnames = (siteId: number) => {
  return useQuery({
    queryKey: ["excludedHostnames", siteId],
    queryFn: () => fetchExcludedHostnames(siteId.toString()),
    enabled: !!siteId,
  });
};

export const useUpdateExcludedHostnames = () => {
  const t = useExtracted();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { siteId: number; excludedHostnames: string[] }>({
    mutationFn: ({ siteId, excludedHostnames }) => updateExcludedHostnames(siteId, excludedHostnames),
    onSuccess: (_, variables) => {
      toast.success(t("Excluded hostnames updated successfully"));
      queryClient.invalidateQueries({ queryKey: ["excludedHostnames", variables.siteId] });
    },
    onError: error => {
      toast.error(error.message || t("Failed to update excluded hostnames"));
    },
  });
};

// Excluded user agents
export const useGetExcludedUserAgents = (siteId: number) => {
  return useQuery({
    queryKey: ["excludedUserAgents", siteId],
    queryFn: () => fetchExcludedUserAgents(siteId.toString()),
    enabled: !!siteId,
  });
};

export const useUpdateExcludedUserAgents = () => {
  const t = useExtracted();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { siteId: number; excludedUserAgents: string[] }>({
    mutationFn: ({ siteId, excludedUserAgents }) => updateExcludedUserAgents(siteId, excludedUserAgents),
    onSuccess: (_, variables) => {
      toast.success(t("Excluded user agents updated successfully"));
      queryClient.invalidateQueries({ queryKey: ["excludedUserAgents", variables.siteId] });
    },
    onError: error => {
      toast.error(error.message || t("Failed to update excluded user agents"));
    },
  });
};

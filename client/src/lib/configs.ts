import { useQuery } from "@tanstack/react-query";
import { authedFetch } from "../api/utils";

export interface RuntimeCapabilities {
  googleSearchConsole: boolean;
  objectStorage: boolean;
  socialProviders: {
    github: boolean;
    google: boolean;
  };
  transactionalEmail: boolean;
  turnstile: boolean;
  weeklyReports: boolean;
}

interface Configs {
  capabilities: RuntimeCapabilities;
  disableSignup: boolean;
  mapboxToken: string;
  liteDashboard: boolean;
}

export function useConfigs() {
  const { data, isLoading, error } = useQuery<Configs>({
    queryKey: ["configs"],
    queryFn: () => authedFetch<Configs>("/config"),
  });

  return {
    configs: data,
    isLoading,
    error,
  };
}

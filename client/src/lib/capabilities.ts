import { DEPLOYMENT, IS_CLOUD } from "./const";

export type AnalyticsCapabilities = {
  botAnalytics: boolean;
  customDashboards: boolean;
  customQueries: boolean;
  pageAnalytics: boolean;
  performanceAnalytics: boolean;
};

type CapabilityEnvironment = {
  deployment?: string;
  isCloud: boolean;
};

export const resolveAnalyticsCapabilities = ({ deployment, isCloud }: CapabilityEnvironment): AnalyticsCapabilities => {
  const hasExtendedWebAnalytics = isCloud || deployment === "self-hosted";

  return {
    botAnalytics: hasExtendedWebAnalytics,
    customDashboards: !isCloud,
    customQueries: !isCloud,
    pageAnalytics: hasExtendedWebAnalytics,
    performanceAnalytics: hasExtendedWebAnalytics,
  };
};

export const ANALYTICS_CAPABILITIES = resolveAnalyticsCapabilities({
  deployment: DEPLOYMENT,
  isCloud: IS_CLOUD,
});

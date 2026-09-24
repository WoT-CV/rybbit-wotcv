export interface ReplayObservabilityProfile {
  requestOrigin: string;
  grafanaUrl: string;
  orgId: number;
  lokiDatasourceUid: string;
  tempoDatasourceUid?: string;
  serviceName: string;
  environment: string;
  timePaddingMs: number;
}

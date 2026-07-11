import type { CapturedNetworkRequest, NetworkOutcome } from "@rybbit/shared";

export type {
  CapturedBody,
  CapturedBodyKind,
  CapturedNetworkError,
  CapturedNetworkRequest,
  CapturedNetworkSizes,
  CapturedNetworkTiming,
  NetworkOutcome,
} from "@rybbit/shared";

export type CapturedNetworkRequestDraft = Omit<CapturedNetworkRequest, "outcome"> & {
  outcome?: NetworkOutcome;
};

export interface NetworkPluginPayload {
  version: 1;
  requests: CapturedNetworkRequest[];
}

export type NetworkRequestEmitter = (request: CapturedNetworkRequest) => void;

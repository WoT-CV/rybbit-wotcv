import type { CapturedNetworkRequest } from "@rybbit/shared";

export type {
  CapturedBody,
  CapturedBodyKind,
  CapturedNetworkError,
  CapturedNetworkRequest,
  CapturedNetworkSizes,
  CapturedNetworkTiming,
  NetworkOutcome,
} from "@rybbit/shared";

export interface ParsedNetworkRequest extends Omit<CapturedNetworkRequest, "durationMs"> {
  durationMs: number;
  startOffset: number;
  endOffset: number;
}

export interface ReplayEventLike {
  timestamp: number;
  type: string | number;
  data?: unknown;
}

export type NetworkStatusGroup = "all" | "errors" | "2xx" | "3xx" | "4xx" | "5xx";

export interface NetworkRequestFilters {
  query: string;
  host: string;
  method: string;
  statusGroup: NetworkStatusGroup;
  initiatorType: string;
  fetchXhrOnly: boolean;
  minDurationMs: number;
}

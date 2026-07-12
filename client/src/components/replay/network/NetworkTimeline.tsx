import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { Clock, Network } from "lucide-react";
import { useExtracted } from "next-intl";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useReplayStore } from "../replayStore";
import {
  filterNetworkRequests,
  formatNetworkOffset,
  getDefaultNetworkHost,
  getInitiatorLabel,
  getRequestHost,
} from "./networkEventUtils";
import { NetworkRequestDetails } from "./NetworkRequestDetails";
import { NetworkRequestRow } from "./NetworkRequestRow";
import type { NetworkStatusGroup, ParsedNetworkRequest } from "./types";

interface NetworkTimelineProps {
  requests: ParsedNetworkRequest[];
  onSeek: (offset: number) => void;
}

interface HostOption {
  host: string;
  count: number;
}

type NetworkTimelineRow =
  | {
      kind: "current-time-marker";
      offset: number;
    }
  | {
      kind: "request";
      request: ParsedNetworkRequest;
    };

export function NetworkTimeline({ requests, onSeek }: NetworkTimelineProps) {
  const t = useExtracted();
  const [query, setQuery] = useState("");
  const [host, setHost] = useState(() => getDefaultNetworkHost(requests));
  const [method, setMethod] = useState("all");
  const [statusGroup, setStatusGroup] = useState<NetworkStatusGroup>("all");
  const [initiatorType, setInitiatorType] = useState("all");
  const [fetchXhrOnly, setFetchXhrOnly] = useState(true);
  const [followCurrentTime, setFollowCurrentTime] = useState(true);
  const [minDurationMs, setMinDurationMs] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFollowedMarkerIndexRef = useRef<number | null>(null);
  const currentTime = useReplayStore(state => state.currentTime);

  const methods = useMemo(() => [...new Set(requests.map(request => request.method))].sort(), [requests]);
  const initiatorTypes = useMemo(() => [...new Set(requests.map(request => request.initiatorType))].sort(), [requests]);
  const hostOptions = useMemo<HostOption[]>(() => {
    const counts = requests.reduce<Map<string, number>>((accumulator, request) => {
      const requestHost = getRequestHost(request);
      accumulator.set(requestHost, (accumulator.get(requestHost) ?? 0) + 1);
      return accumulator;
    }, new Map());

    return [...counts.entries()]
      .map(([requestHost, count]) => ({ host: requestHost, count }))
      .sort((first, second) => second.count - first.count || first.host.localeCompare(second.host));
  }, [requests]);
  const filteredRequests = useMemo(
    () =>
      filterNetworkRequests(requests, {
        query,
        host,
        method,
        statusGroup,
        initiatorType,
        fetchXhrOnly,
        minDurationMs,
      }),
    [fetchXhrOnly, host, initiatorType, method, minDurationMs, query, requests, statusGroup]
  );
  const currentTimeMarkerIndex = useMemo(() => {
    const nextRequestIndex = filteredRequests.findIndex(request => request.startOffset > currentTime);
    return nextRequestIndex === -1 ? filteredRequests.length : nextRequestIndex;
  }, [currentTime, filteredRequests]);
  const timelineRows = useMemo<NetworkTimelineRow[]>(() => {
    const rows: NetworkTimelineRow[] = [];

    filteredRequests.forEach((request, index) => {
      if (index === currentTimeMarkerIndex) {
        rows.push({ kind: "current-time-marker", offset: currentTime });
      }

      rows.push({ kind: "request", request });
    });

    if (currentTimeMarkerIndex === filteredRequests.length) {
      rows.push({ kind: "current-time-marker", offset: currentTime });
    }

    return rows;
  }, [currentTime, currentTimeMarkerIndex, filteredRequests]);
  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value), []);
  const handleRequestSelect = useCallback(
    (request: ParsedNetworkRequest) => {
      onSeek(request.startOffset);
      setSelectedRequestId(request.requestId);
    },
    [onSeek]
  );
  const selectedRequest = useMemo(
    () => requests.find(request => request.requestId === selectedRequestId),
    [requests, selectedRequestId]
  );
  const handleDetailsBack = useCallback(() => setSelectedRequestId(null), []);
  const virtualizer = useVirtualizer({
    count: timelineRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 16,
  });
  const handleFollowCurrentTimeToggle = useCallback(() => {
    setFollowCurrentTime(value => !value);
  }, []);

  useEffect(() => {
    if (!followCurrentTime || filteredRequests.length === 0) {
      lastFollowedMarkerIndexRef.current = null;
      return;
    }

    if (lastFollowedMarkerIndexRef.current === currentTimeMarkerIndex) {
      return;
    }

    virtualizer.scrollToIndex(currentTimeMarkerIndex, { align: "center" });
    lastFollowedMarkerIndexRef.current = currentTimeMarkerIndex;
  }, [currentTimeMarkerIndex, filteredRequests.length, followCurrentTime, virtualizer]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {t("No network requests recorded.")}
      </div>
    );
  }

  if (selectedRequest) {
    return <NetworkRequestDetails request={selectedRequest} onBack={handleDetailsBack} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-neutral-100 p-2 dark:border-neutral-800">
        <Input
          isSearch
          inputSize="sm"
          value={query}
          onChange={handleQueryChange}
          placeholder={t("Search requests...")}
          aria-label={t("Search network requests")}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger size="sm" aria-label={t("Request method")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              <SelectItem value="all" size="sm">
                {t("All methods")}
              </SelectItem>
              {methods.map(value => (
                <SelectItem key={value} value={value} size="sm">
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusGroup} onValueChange={value => setStatusGroup(value as NetworkStatusGroup)}>
            <SelectTrigger size="sm" aria-label={t("Status group")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              <SelectItem value="all" size="sm">
                {t("All statuses")}
              </SelectItem>
              <SelectItem value="errors" size="sm">
                {t("Errors")}
              </SelectItem>
              {(["2xx", "3xx", "4xx", "5xx"] as const).map(value => (
                <SelectItem key={value} value={value} size="sm">
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={initiatorType} onValueChange={setInitiatorType}>
            <SelectTrigger size="sm" aria-label={t("Initiator type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              <SelectItem value="all" size="sm">
                {t("All initiators")}
              </SelectItem>
              {initiatorTypes.map(value => (
                <SelectItem key={value} value={value} size="sm">
                  {getInitiatorLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(minDurationMs)} onValueChange={value => setMinDurationMs(Number(value))}>
            <SelectTrigger size="sm" aria-label={t("Minimum duration")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              <SelectItem value="0" size="sm">
                {t("Any duration")}
              </SelectItem>
              <SelectItem value="100" size="sm">
                ≥ 100 ms
              </SelectItem>
              <SelectItem value="500" size="sm">
                ≥ 500 ms
              </SelectItem>
              <SelectItem value="1000" size="sm">
                ≥ 1 s
              </SelectItem>
              <SelectItem value="3000" size="sm">
                ≥ 3 s
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={host} onValueChange={setHost}>
            <SelectTrigger size="sm" className="col-span-2" aria-label={t("Target host")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent size="sm">
              <SelectItem value="all" size="sm">
                {t("All hosts")}
              </SelectItem>
              {hostOptions.map(option => (
                <SelectItem key={option.host} value={option.host} size="sm">
                  {option.host === "unknown" ? t("Unknown host") : option.host} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={fetchXhrOnly ? "secondary" : "outline"}
              aria-pressed={fetchXhrOnly}
              onClick={() => setFetchXhrOnly(value => !value)}
            >
              <Network aria-hidden="true" />
              {t("Fetch/XHR only")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant={followCurrentTime ? "secondary" : "outline"}
              aria-pressed={followCurrentTime}
              onClick={handleFollowCurrentTimeToggle}
            >
              <Clock aria-hidden="true" />
              {t("Follow time")}
            </Button>
          </div>
          <span className="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {t("{visible} of {total}", {
              visible: String(filteredRequests.length),
              total: String(requests.length),
            })}
          </span>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {t("No requests match these filters.")}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto rounded-b-lg">
          <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = timelineRows[virtualRow.index];

              if (row.kind === "current-time-marker") {
                return (
                  <CurrentTimeMarkerRow
                    key="current-time-marker"
                    virtualRow={virtualRow}
                    measure={virtualizer.measureElement}
                    label={t("Current time {time}", { time: formatNetworkOffset(row.offset) })}
                  />
                );
              }

              const request = row.request;
              return (
                <NetworkRequestRow
                  key={request.requestId}
                  request={request}
                  isActive={currentTime >= request.startOffset && currentTime <= request.endOffset}
                  virtualRow={virtualRow}
                  measure={virtualizer.measureElement}
                  onSelect={handleRequestSelect}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface CurrentTimeMarkerRowProps {
  virtualRow: VirtualItem;
  measure: (node: Element | null) => void;
  label: string;
}

function CurrentTimeMarkerRow({ virtualRow, measure, label }: CurrentTimeMarkerRowProps) {
  return (
    <div
      data-index={virtualRow.index}
      ref={measure}
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center gap-2 px-2 py-1.5 text-[10px]"
      style={{ top: `${virtualRow.start}px` }}
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-amber-400/70 dark:bg-amber-300/70" />
      <span className="rounded-full border border-amber-400/70 bg-amber-500/10 px-2 py-0.5 font-medium tabular-nums text-amber-700 shadow-sm dark:border-amber-300/70 dark:bg-amber-400/10 dark:text-amber-300">
        {label}
      </span>
      <span className="h-px flex-1 bg-amber-400/70 dark:bg-amber-300/70" />
    </div>
  );
}

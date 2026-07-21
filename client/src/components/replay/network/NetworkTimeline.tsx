import { useVirtualizer } from "@tanstack/react-virtual";
import { Network } from "lucide-react";
import { useExtracted } from "next-intl";
import { type ChangeEvent, type UIEvent, useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CurrentTimeMarker, CurrentTimeMarkerRow } from "../timeline/CurrentTimeMarker";
import { buildNetworkTimelineRows, insertCurrentTimeMarker } from "../timeline/replayTimeline";
import { TimelineFollowButton } from "../timeline/TimelineFollowButton";
import { useFollowTimelineMarker } from "../timeline/useFollowTimelineMarker";
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
  currentTime: number;
  followCurrentTime: boolean;
  highlightedKeys: ReadonlySet<string>;
  initialScrollOffset: number;
  resetKey: string;
  selectedRequest?: ParsedNetworkRequest;
  onDetailsBack: () => void;
  onFollowCurrentTimeToggle: () => void;
  onRequestSelect: (request: ParsedNetworkRequest) => void;
  onScrollOffsetChange: (offset: number) => void;
}

interface HostOption {
  host: string;
  count: number;
}

export function NetworkTimeline({
  requests,
  currentTime,
  followCurrentTime,
  highlightedKeys,
  initialScrollOffset,
  resetKey,
  selectedRequest,
  onDetailsBack,
  onFollowCurrentTimeToggle,
  onRequestSelect,
  onScrollOffsetChange,
}: NetworkTimelineProps) {
  const t = useExtracted();
  const [query, setQuery] = useState("");
  const [host, setHost] = useState(() => getDefaultNetworkHost(requests));
  const [method, setMethod] = useState("all");
  const [statusGroup, setStatusGroup] = useState<NetworkStatusGroup>("all");
  const [initiatorType, setInitiatorType] = useState("all");
  const [fetchXhrOnly, setFetchXhrOnly] = useState(true);
  const [minDurationMs, setMinDurationMs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  const requestRows = useMemo(() => buildNetworkTimelineRows(filteredRequests), [filteredRequests]);
  const timeline = useMemo(() => insertCurrentTimeMarker(requestRows, currentTime), [currentTime, requestRows]);
  const virtualizer = useVirtualizer({
    count: timeline.rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: index => timeline.rows[index]?.key ?? index,
    estimateSize: index => (timeline.rows[index]?.kind === "current-time-marker" ? 29 : 52),
    overscan: 16,
  });
  const scrollToMarker = useCallback(
    () => virtualizer.scrollToIndex(timeline.markerIndex, { align: "center" }),
    [timeline.markerIndex, virtualizer]
  );
  const filterResetKey = `${resetKey}:${query}:${host}:${method}:${statusGroup}:${initiatorType}:${fetchXhrOnly}:${minDurationMs}`;
  useFollowTimelineMarker({
    enabled: followCurrentTime && !selectedRequest && filteredRequests.length > 0,
    markerIndex: timeline.markerIndex,
    resetKey: filterResetKey,
    scrollToMarker,
  });

  const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value), []);
  const setScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (node) node.scrollTop = initialScrollOffset;
    },
    [initialScrollOffset]
  );
  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => onScrollOffsetChange(event.currentTarget.scrollTop),
    [onScrollOffsetChange]
  );
  const currentTimeLabel = t("Current time {time}", { time: formatNetworkOffset(currentTime) });

  if (selectedRequest) return <NetworkRequestDetails request={selectedRequest} onBack={onDetailsBack} />;

  if (requests.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <CurrentTimeMarker label={currentTimeLabel} />
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          {t("No network requests recorded.")}
        </div>
      </div>
    );
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
            <TimelineFollowButton enabled={followCurrentTime} onToggle={onFollowCurrentTimeToggle} />
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
        <div className="flex min-h-0 flex-1 flex-col">
          <CurrentTimeMarker label={currentTimeLabel} />
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
            {t("No requests match these filters.")}
          </div>
        </div>
      ) : (
        <div ref={setScrollElement} className="flex-1 overflow-auto rounded-b-lg" onScroll={handleScroll}>
          <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = timeline.rows[virtualRow.index];

              if (row.kind === "current-time-marker") {
                return (
                  <CurrentTimeMarkerRow
                    key={row.key}
                    virtualRow={virtualRow}
                    measure={virtualizer.measureElement}
                    label={currentTimeLabel}
                  />
                );
              }

              return (
                <NetworkRequestRow
                  key={row.key}
                  request={row.request}
                  isHighlighted={highlightedKeys.has(row.key)}
                  virtualRow={virtualRow}
                  measure={virtualizer.measureElement}
                  onSelect={onRequestSelect}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

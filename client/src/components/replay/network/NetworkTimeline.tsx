import { useVirtualizer } from "@tanstack/react-virtual";
import { Network } from "lucide-react";
import { useExtracted } from "next-intl";
import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useReplayStore } from "../replayStore";
import { filterNetworkRequests, getInitiatorLabel } from "./networkEventUtils";
import { NetworkRequestDetails } from "./NetworkRequestDetails";
import { NetworkRequestRow } from "./NetworkRequestRow";
import type { NetworkStatusGroup, ParsedNetworkRequest } from "./types";

interface NetworkTimelineProps {
  requests: ParsedNetworkRequest[];
  onSeek: (offset: number) => void;
}

export function NetworkTimeline({ requests, onSeek }: NetworkTimelineProps) {
  const t = useExtracted();
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [statusGroup, setStatusGroup] = useState<NetworkStatusGroup>("all");
  const [initiatorType, setInitiatorType] = useState("all");
  const [fetchXhrOnly, setFetchXhrOnly] = useState(false);
  const [minDurationMs, setMinDurationMs] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTime = useReplayStore(state => state.currentTime);

  const methods = useMemo(() => [...new Set(requests.map(request => request.method))].sort(), [requests]);
  const initiatorTypes = useMemo(() => [...new Set(requests.map(request => request.initiatorType))].sort(), [requests]);
  const filteredRequests = useMemo(
    () =>
      filterNetworkRequests(requests, {
        query,
        method,
        statusGroup,
        initiatorType,
        fetchXhrOnly,
        minDurationMs,
      }),
    [fetchXhrOnly, initiatorType, method, minDurationMs, query, requests, statusGroup]
  );
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
    count: filteredRequests.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 16,
  });

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
        </div>

        <div className="flex items-center justify-between gap-2">
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
              const request = filteredRequests[virtualRow.index];
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

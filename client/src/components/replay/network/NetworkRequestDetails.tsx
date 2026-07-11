import { ArrowLeft, Check, Copy } from "lucide-react";
import { useExtracted } from "next-intl";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BodyViewer } from "./BodyViewer";
import {
  formatNetworkDuration,
  formatTransferSize,
  getInitiatorLabel,
  getNetworkTransferSize,
  getNetworkStatusLabel,
  getResponseCorrelationId,
  getRequestDisplayUrl,
} from "./networkEventUtils";
import type { CapturedNetworkTiming, ParsedNetworkRequest } from "./types";

interface NetworkRequestDetailsProps {
  request: ParsedNetworkRequest;
  onBack: () => void;
}

export function NetworkRequestDetails({ request, onBack }: NetworkRequestDetailsProps) {
  const t = useExtracted();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-100 p-2 dark:border-neutral-800">
        <Button type="button" size="smIcon" variant="ghost" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          <span className="sr-only">{t("Back to network requests")}</span>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-neutral-100 px-1 py-0.5 text-[10px] font-medium dark:bg-neutral-800">
              {request.method}
            </span>
            <span className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
              {getRequestDisplayUrl(request)}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {getNetworkStatusLabel(request)} · {formatNetworkDuration(request.durationMs)}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col p-2 pt-1.5">
        <div className="shrink-0 overflow-x-auto pb-1">
          <TabsList className="h-7 w-max p-0.5">
            <DetailsTab value="overview">{t("Overview")}</DetailsTab>
            <DetailsTab value="timing">{t("Timing")}</DetailsTab>
            <DetailsTab value="request-headers">{t("Request headers")}</DetailsTab>
            <DetailsTab value="request-body">{t("Request body")}</DetailsTab>
            <DetailsTab value="response-headers">{t("Response headers")}</DetailsTab>
            <DetailsTab value="response-body">{t("Response body")}</DetailsTab>
            <DetailsTab value="raw">{t("Raw")}</DetailsTab>
          </TabsList>
        </div>

        <DetailsContent value="overview">
          <Overview request={request} />
        </DetailsContent>
        <DetailsContent value="timing">
          <Timing timing={request.timing} fallbackDuration={request.durationMs} />
        </DetailsContent>
        <DetailsContent value="request-headers">
          <Headers headers={request.requestHeaders} />
        </DetailsContent>
        <DetailsContent value="request-body">
          <BodyViewer body={request.requestBody} />
        </DetailsContent>
        <DetailsContent value="response-headers">
          <Headers headers={request.responseHeaders} />
        </DetailsContent>
        <DetailsContent value="response-body">
          <BodyViewer body={request.responseBody} />
        </DetailsContent>
        <DetailsContent value="raw">
          <RawRequest request={request} />
        </DetailsContent>
      </Tabs>
    </div>
  );
}

function DetailsTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger value={value} className="h-6 px-2 text-[10px] shadow-none data-[state=active]:shadow-none">
      {children}
    </TabsTrigger>
  );
}

function DetailsContent({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsContent value={value} className="mt-1 min-h-0 flex-1 overflow-auto pr-1">
      {children}
    </TabsContent>
  );
}

function Overview({ request }: { request: ParsedNetworkRequest }) {
  const t = useExtracted();
  const correlationId = getResponseCorrelationId(request);
  const transferSize = formatTransferSize(getNetworkTransferSize(request));
  const rows = [
    [t("URL"), request.url || "—"],
    [t("Method"), request.method],
    [t("Status"), `${getNetworkStatusLabel(request)}${request.statusText ? ` ${request.statusText}` : ""}`],
    [t("Outcome"), request.outcome],
    [t("Started at"), formatTimestamp(request.startedAt)],
    [t("Completed at"), request.completedAt === undefined ? "—" : formatTimestamp(request.completedAt)],
    [t("Duration"), formatNetworkDuration(request.durationMs)],
    [t("Initiator"), getInitiatorLabel(request.initiatorType)],
    [t("Current page URL"), request.currentUrl || "—"],
    [t("Request ID"), request.requestId],
    [t("Correlation ID"), correlationId ?? "—"],
    [t("Performance entry"), request.performanceEntryFound ? t("Available") : t("Not available")],
    [t("Transfer size"), transferSize ?? "—"],
  ];
  return <DetailRows rows={rows} />;
}

function Timing({ timing, fallbackDuration }: { timing: CapturedNetworkTiming | undefined; fallbackDuration: number }) {
  const t = useExtracted();
  const rows = [
    [t("Start"), durationBetween(timing?.startTime, timing?.fetchStart)],
    [t("DNS"), durationBetween(timing?.domainLookupStart, timing?.domainLookupEnd)],
    [t("Connect"), durationBetween(timing?.connectStart, timing?.connectEnd)],
    [t("TLS"), durationBetween(timing?.secureConnectionStart, timing?.connectEnd)],
    [t("Request"), durationBetween(timing?.connectEnd, timing?.requestStart)],
    [t("Waiting / TTFB"), durationBetween(timing?.requestStart, timing?.responseStart)],
    [t("Response"), durationBetween(timing?.responseStart, timing?.responseEnd)],
    [t("Total"), formatNetworkDuration(timing?.duration ?? fallbackDuration)],
  ];

  return (
    <div className="space-y-2">
      {!timing && <EmptyPanel>{t("Detailed Resource Timing data is unavailable.")}</EmptyPanel>}
      <DetailRows rows={rows} />
    </div>
  );
}

function Headers({ headers }: { headers: Record<string, string> }) {
  const t = useExtracted();
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return Object.entries(headers)
      .filter(([key, value]) => !normalizedQuery || `${key} ${value}`.toLowerCase().includes(normalizedQuery))
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey));
  }, [headers, query]);
  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value), []);
  const handleCopyAll = useCallback(
    () =>
      copyText(
        Object.entries(headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
      ),
    [headers]
  );

  if (Object.keys(headers).length === 0) return <EmptyPanel>{t("No headers captured.")}</EmptyPanel>;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          isSearch
          inputSize="sm"
          value={query}
          onChange={handleSearch}
          placeholder={t("Search headers...")}
          aria-label={t("Search headers")}
        />
        <Button type="button" size="smIcon" variant="outline" className="h-7 w-7" onClick={handleCopyAll}>
          <Copy aria-hidden="true" />
          <span className="sr-only">{t("Copy all headers")}</span>
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyPanel>{t("No headers match this search.")}</EmptyPanel>
      ) : (
        <div className="divide-y divide-neutral-100 rounded-md border border-neutral-150 dark:divide-neutral-800 dark:border-neutral-800">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[minmax(80px,0.7fr)_minmax(0,1.3fr)_24px] gap-2 p-2 text-[10px]">
              <span className="break-all font-medium text-neutral-700 dark:text-neutral-300">{key}</span>
              <span className="break-all font-mono text-neutral-600 dark:text-neutral-400">{value}</span>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 dark:focus-visible:ring-neutral-300"
                onClick={() => copyText(value)}
                aria-label={t("Copy header value")}
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RawRequest({ request }: { request: ParsedNetworkRequest }) {
  const t = useExtracted();
  const [copied, setCopied] = useState(false);
  const raw = useMemo(
    () =>
      JSON.stringify(
        Object.fromEntries(Object.entries(request).filter(([key]) => key !== "startOffset" && key !== "endOffset")),
        null,
        2
      ),
    [request]
  );
  const handleCopy = useCallback(async () => {
    await copyText(raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }, [raw]);

  return (
    <div className="relative rounded-md border border-neutral-150 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/60">
      <Button
        type="button"
        size="smIcon"
        variant="ghost"
        className="absolute right-1 top-1 z-10 h-6 w-6"
        onClick={handleCopy}
        aria-label={t("Copy raw request")}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all p-2 pr-8 font-mono text-[10px] leading-relaxed text-neutral-800 dark:text-neutral-200">
        {raw}
      </pre>
    </div>
  );
}

function DetailRows({ rows }: { rows: string[][] }) {
  return (
    <div className="divide-y divide-neutral-100 rounded-md border border-neutral-150 dark:divide-neutral-800 dark:border-neutral-800">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 p-2 text-[10px]">
          <span className="font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
          <span className="break-all font-mono text-neutral-800 dark:text-neutral-200">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-200 p-3 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      {children}
    </div>
  );
}

function durationBetween(start: number | undefined, end: number | undefined): string {
  if (start === undefined || end === undefined || end < start) return "—";
  return formatNetworkDuration(end - start);
}

function formatTimestamp(timestamp: number): string {
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return String(timestamp);
  }
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    return;
  }
}

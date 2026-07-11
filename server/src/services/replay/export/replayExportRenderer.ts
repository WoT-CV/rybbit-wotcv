import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import JSZip from "jszip";
import puppeteer, { type Browser, type Page } from "puppeteer";

import { createServiceLogger } from "../../../lib/logger/logger.js";
import { SessionReplayQueryService } from "../sessionReplayQueryService.js";
import type { ReplayExportJobData, ReplayExportResult } from "./replayExportTypes.js";

const REPLAY_WIDTH = 1280;
const REPLAY_HEIGHT = 720;
const EVIDENCE_WIDTH = 1920;
const EVIDENCE_HEIGHT = 1080;
const ACTIVE_PRE_ROLL_MS = 500;
const ACTIVE_POST_ROLL_MS = 1000;
const SENSITIVE_NAME_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key|credential)/i;
const NETWORK_PLUGIN_NAME = "rrweb/network@1";
const EXPORT_FILE_NAMES = {
  video: "01-powtorka.webm",
  screenshot: "02-zrzut-diagnostyczny.png",
  githubReport: "03-raport-do-zgloszenia-github.md",
  networkLog: "04-logi-sieciowe.txt",
  networkHar: "05-logi-sieciowe.har",
  networkCsv: "06-logi-sieciowe.csv",
  metadata: "07-metadane.json",
  readme: "README.md",
} as const;

interface ExportNetworkRequest {
  requestId: string;
  currentUrl: string;
  url: string;
  method: string;
  initiatorType: string;
  startedAt: number;
  completedAt?: number;
  durationMs: number;
  status?: number;
  statusText?: string;
  outcome: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  sizes?: Record<string, number>;
  startOffset: number;
  endOffset: number;
}

interface PlaybackWindow {
  start: number;
  end: number;
}

export class ReplayExportRenderer {
  private logger = createServiceLogger("replay-export-renderer");

  async render(
    jobData: ReplayExportJobData,
    outputDirectory: string,
    onProgress: (progress: number) => Promise<void>,
    isCancelled: () => Promise<boolean>
  ): Promise<ReplayExportResult> {
    const workDirectory = await mkdtemp(join(tmpdir(), "rybbit-replay-export-"));
    let browser: Browser | null = null;

    try {
      await onProgress(5);
      const replayData = await new SessionReplayQueryService().getSessionReplayEvents(
        jobData.siteId,
        jobData.sessionId
      );
      const { events, metadata } = replayData;
      const firstTimestamp = events[0]?.timestamp ?? 0;
      const totalDuration = Math.max(0, (events.at(-1)?.timestamp ?? firstTimestamp) - firstTimestamp);
      const options = normalizeOptions(jobData.options, totalDuration);
      const requests = jobData.options.includeNetwork
        ? parseNetworkRequests(events, firstTimestamp)
            .filter(request => request.startOffset <= options.endMs && request.endOffset >= options.startMs)
            .map(request => sanitizeNetworkRequest(request, options.includeBodies))
        : [];

      if (await isCancelled()) {
        throw new ReplayExportCancelledError();
      }

      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });

      const replayPage = await createReplayPage(browser, events);
      const framePath = join(workDirectory, "replay-frame.png");
      await pauseReplayAt(replayPage, options.captureMs);
      await replayPage.screenshot({ path: framePath, type: "png" });
      await onProgress(20);

      const videoPath = join(workDirectory, "replay.webm");
      await recordReplayRange(replayPage, events, options, videoPath, isCancelled);
      await onProgress(70);

      const frame = await readFile(framePath);
      const evidencePath = join(workDirectory, EXPORT_FILE_NAMES.screenshot);
      const evidencePage = await browser.newPage();
      await evidencePage.setViewport({ width: EVIDENCE_WIDTH, height: EVIDENCE_HEIGHT, deviceScaleFactor: 1 });
      await evidencePage.setContent(
        buildEvidenceHtml({
          frameBase64: frame.toString("base64"),
          metadata,
          options,
          requests,
          sessionId: jobData.sessionId,
        }),
        { waitUntil: "networkidle0" }
      );
      await evidencePage.screenshot({ path: evidencePath, type: "png" });
      await evidencePage.close();
      await onProgress(82);

      if (await isCancelled()) {
        throw new ReplayExportCancelledError();
      }

      const generatedAt = new Date().toISOString();
      const exportMetadata = getExportMetadata(metadata);
      const zip = new JSZip();
      zip.file(EXPORT_FILE_NAMES.video, await readFile(videoPath));
      zip.file(EXPORT_FILE_NAMES.screenshot, await readFile(evidencePath));
      zip.file(
        EXPORT_FILE_NAMES.githubReport,
        buildGithubIssueReport({
          generatedAt,
          metadata: exportMetadata,
          options,
          requests,
          sessionId: jobData.sessionId,
          siteId: jobData.siteId,
        })
      );

      if (options.includeNetwork) {
        zip.file(EXPORT_FILE_NAMES.networkLog, buildNetworkTextLog(requests));
        zip.file(EXPORT_FILE_NAMES.networkHar, JSON.stringify(buildHar(requests), null, 2));
        zip.file(EXPORT_FILE_NAMES.networkCsv, buildNetworkCsv(requests));
      }

      zip.file(
        EXPORT_FILE_NAMES.metadata,
        JSON.stringify(
          {
            schemaVersion: 2,
            sessionId: jobData.sessionId,
            siteId: jobData.siteId,
            generatedAt,
            range: options,
            metadata: exportMetadata,
            networkRequestCount: requests.length,
            files: getIncludedFileNames(options.includeNetwork),
          },
          null,
          2
        )
      );
      zip.file(EXPORT_FILE_NAMES.readme, buildPackageReadme(options.includeNetwork));

      const filename = `rybbit-github-report-${safeFilename(jobData.sessionId)}-${Math.floor(options.startMs)}-${Math.floor(options.endMs)}.zip`;
      const filePath = join(outputDirectory, `${Date.now()}-${filename}`);
      await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      const fileStats = await stat(filePath);
      await onProgress(100);

      return {
        filePath,
        filename,
        sizeBytes: fileStats.size,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    } catch (error) {
      if (!(error instanceof ReplayExportCancelledError)) {
        this.logger.error({ error, sessionId: jobData.sessionId }, "Replay export rendering failed");
      }
      throw error;
    } finally {
      await browser?.close().catch(() => undefined);
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}

export class ReplayExportCancelledError extends Error {
  constructor() {
    super("Replay export cancelled");
    this.name = "ReplayExportCancelledError";
  }
}

async function createReplayPage(browser: Browser, events: any[]): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: REPLAY_WIDTH, height: REPLAY_HEIGHT, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><head><style>html,body,#replay{width:100%;height:100%;margin:0;overflow:hidden;background:#000}iframe{border:0}</style></head><body><div id="replay"></div></body></html>`
  );
  await page.addScriptTag({ path: join(process.cwd(), "public", "rrweb.min.js") });
  await page.evaluate(replayEvents => {
    const replayWindow = window as any;
    if (typeof replayWindow.rrweb?.Replayer !== "function") {
      throw new Error("rrweb Replayer is unavailable in the export renderer");
    }
    replayWindow.__replayer = new replayWindow.rrweb.Replayer(replayEvents, {
      root: document.getElementById("replay"),
      mouseTail: false,
      showWarning: false,
      showDebug: false,
    });
  }, events);
  await new Promise(resolve => setTimeout(resolve, 250));
  return page;
}

async function pauseReplayAt(page: Page, offset: number) {
  await page.evaluate(replayOffset => (window as any).__replayer.pause(replayOffset), offset);
  await new Promise(resolve => setTimeout(resolve, 250));
}

async function recordReplayRange(
  page: Page,
  events: any[],
  options: ReturnType<typeof normalizeOptions>,
  videoPath: string,
  isCancelled: () => Promise<boolean>
) {
  await pauseReplayAt(page, options.startMs);
  const recorder = await page.screencast({
    path: videoPath as `${string}.webm`,
    fps: 24,
    quality: 34,
    ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  });

  try {
    const windows = options.skipInactivity
      ? getActivePlaybackWindows(events, options.startMs, options.endMs)
      : [{ start: options.startMs, end: options.endMs }];
    const playbackWindows = windows.length > 0 ? windows : [{ start: options.startMs, end: options.endMs }];

    for (const playbackWindow of playbackWindows) {
      if (await isCancelled()) {
        throw new ReplayExportCancelledError();
      }

      await page.evaluate(
        ({ offset, speed }) => {
          const replayer = (window as any).__replayer;
          replayer.setConfig({ speed });
          replayer.play(offset);
        },
        { offset: playbackWindow.start, speed: options.playbackSpeed }
      );
      await new Promise(resolve =>
        setTimeout(resolve, Math.max(50, (playbackWindow.end - playbackWindow.start) / options.playbackSpeed))
      );
      await page.evaluate(offset => (window as any).__replayer.pause(offset), playbackWindow.end);
    }
  } finally {
    await recorder.stop();
  }
}

function getActivePlaybackWindows(events: any[], startMs: number, endMs: number): PlaybackWindow[] {
  const firstTimestamp = events[0]?.timestamp;
  if (!Number.isFinite(firstTimestamp)) return [];

  const activeOffsets = events
    .filter(isActiveEvent)
    .map(event => event.timestamp - firstTimestamp)
    .filter(offset => offset >= startMs - ACTIVE_POST_ROLL_MS && offset <= endMs + ACTIVE_PRE_ROLL_MS)
    .map(offset => ({
      start: Math.max(startMs, offset - ACTIVE_PRE_ROLL_MS),
      end: Math.min(endMs, offset + ACTIVE_POST_ROLL_MS),
    }))
    .sort((first, second) => first.start - second.start);

  return activeOffsets.reduce<PlaybackWindow[]>((merged, window) => {
    const current = merged.at(-1);
    if (!current || window.start > current.end) {
      merged.push({ ...window });
    } else {
      current.end = Math.max(current.end, window.end);
    }
    return merged;
  }, []);
}

function isActiveEvent(event: any): boolean {
  const type = Number(event?.type);
  const source = Number(event?.data?.source);
  return type === 2 || type === 4 || (type === 3 && [1, 2, 3, 4, 5, 6, 7, 12].includes(source));
}

function normalizeOptions(options: ReplayExportJobData["options"], totalDuration: number) {
  const startMs = Math.max(0, Math.min(totalDuration, options.startMs));
  const endMs = Math.max(startMs + 1, Math.min(totalDuration, options.endMs));
  return {
    ...options,
    startMs,
    endMs,
    captureMs: Math.max(startMs, Math.min(endMs, options.captureMs)),
  };
}

function parseNetworkRequests(events: any[], firstTimestamp: number): ExportNetworkRequest[] {
  const seen = new Set<string>();
  const requests: ExportNetworkRequest[] = [];

  events.forEach(event => {
    if (Number(event?.type) !== 6 || event?.data?.plugin !== NETWORK_PLUGIN_NAME) return;
    const payloadRequests = event?.data?.payload?.requests;
    if (!Array.isArray(payloadRequests)) return;

    payloadRequests.forEach((request: any, index: number) => {
      const startedAt = finiteNumber(request?.startedAt) ?? event.timestamp;
      const requestId = stringValue(request?.requestId) || `${event.timestamp}-${index}`;
      if (seen.has(requestId)) return;
      seen.add(requestId);
      const completedAt = finiteNumber(request?.completedAt);
      const startOffset = Math.max(0, startedAt - firstTimestamp);
      const endOffset = Math.max(startOffset, (completedAt ?? startedAt) - firstTimestamp);
      requests.push({
        requestId,
        currentUrl: stringValue(request?.currentUrl),
        url: stringValue(request?.url),
        method: stringValue(request?.method, "GET").toUpperCase(),
        initiatorType: stringValue(request?.initiatorType, "other"),
        startedAt,
        completedAt,
        durationMs: finiteNumber(request?.durationMs) ?? Math.max(0, (completedAt ?? startedAt) - startedAt),
        status: finiteNumber(request?.status),
        statusText: optionalString(request?.statusText),
        outcome: stringValue(request?.outcome, "success"),
        requestHeaders: stringRecord(request?.requestHeaders),
        responseHeaders: stringRecord(request?.responseHeaders),
        requestBody: recordValue(request?.requestBody),
        responseBody: recordValue(request?.responseBody),
        sizes: numberRecord(request?.sizes),
        startOffset,
        endOffset,
      });
    });
  });

  return requests.sort((first, second) => first.startedAt - second.startedAt);
}

function sanitizeNetworkRequest(request: ExportNetworkRequest, includeBodies: boolean): ExportNetworkRequest {
  return {
    ...request,
    currentUrl: redactUrl(request.currentUrl),
    url: redactUrl(request.url),
    requestHeaders: redactHeaders(request.requestHeaders),
    responseHeaders: redactHeaders(request.responseHeaders),
    requestBody: sanitizeBody(request.requestBody, includeBodies),
    responseBody: sanitizeBody(request.responseBody, includeBodies),
  };
}

function getExportMetadata(metadata: any) {
  const allowedFields = [
    "session_id",
    "user_id",
    "identified_user_id",
    "start_time",
    "end_time",
    "duration_ms",
    "page_url",
    "browser",
    "browser_version",
    "operating_system",
    "operating_system_version",
    "device_type",
    "screen_width",
    "screen_height",
    "country",
    "region",
    "city",
  ];

  return Object.fromEntries(
    allowedFields.flatMap(field => (metadata?.[field] === undefined ? [] : [[field, metadata[field]]]))
  );
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_NAME_PATTERN.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function redactHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, SENSITIVE_NAME_PATTERN.test(key) ? "[redacted]" : value])
  );
}

function sanitizeBody(body: Record<string, unknown> | undefined, includeBody: boolean) {
  if (!body) return undefined;
  const { value, ...metadata } = body;
  if (!includeBody) return { ...metadata, value: "[redacted]" };

  return {
    ...metadata,
    value: sanitizeBodyValue(value, String(body.contentType ?? "")),
  };
}

function sanitizeBodyValue(value: unknown, contentType: string): unknown {
  if (typeof value !== "string") return redactSensitiveFields(value);

  if (contentType.includes("json") || /^\s*[\[{]/.test(value)) {
    try {
      return JSON.stringify(redactSensitiveFields(JSON.parse(value)), null, 2);
    } catch {
      return redactSensitiveText(value);
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(value);
    for (const key of params.keys()) {
      if (SENSITIVE_NAME_PATTERN.test(key)) params.set(key, "[redacted]");
    }
    return params.toString();
  }

  return redactSensitiveText(value);
}

function redactSensitiveFields(value: unknown, key = ""): unknown {
  if (key && SENSITIVE_NAME_PATTERN.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map(entry => redactSensitiveFields(entry));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSensitiveFields(entryValue, entryKey)])
  );
}

function redactSensitiveText(value: string) {
  return value.replace(
    /((?:authorization|cookie|token|secret|password|api[-_]?key|credential)\s*[=:]\s*)([^&\s,;]+)/gi,
    "$1[redacted]"
  );
}

function buildEvidenceHtml({
  frameBase64,
  metadata,
  options,
  requests,
  sessionId,
}: {
  frameBase64: string;
  metadata: any;
  options: ReturnType<typeof normalizeOptions>;
  requests: ExportNetworkRequest[];
  sessionId: string;
}) {
  const visibleRequests = [...requests]
    .sort((first, second) => requestPriority(second) - requestPriority(first) || first.startedAt - second.startedAt)
    .slice(0, 8);
  const rows = visibleRequests
    .map(request => {
      const correlationId = findHeader(request.responseHeaders, "x-correlation-id") || "—";
      return `<tr><td>${escapeHtml(formatOffset(request.startOffset))}</td><td><strong>${escapeHtml(request.method)}</strong></td><td class="url">${escapeHtml(request.url)}</td><td class="status ${statusClass(request.status)}">${escapeHtml(String(request.status ?? "—"))}</td><td>${escapeHtml(`${Math.round(request.durationMs)} ms`)}</td><td>${escapeHtml(formatBytes(request.sizes?.transferSize))}</td><td class="correlation">${escapeHtml(correlationId)}</td></tr>`;
    })
    .join("");
  const overflow =
    requests.length > visibleRequests.length
      ? `<div class="more">+${requests.length - visibleRequests.length} dodatkowych żądań w pełnych logach</div>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#0b0b0d;color:#f5f5f5;font-family:Inter,Arial,sans-serif;width:${EVIDENCE_WIDTH}px;height:${EVIDENCE_HEIGHT}px;padding:30px}
    header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px}.title{font-size:28px;font-weight:700}.meta{max-width:1450px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;color:#a3a3a3;margin-top:8px}.range{font-size:18px;font-weight:600;color:#34d399}
    .frame{height:540px;background:#000;border:1px solid #303036;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden}.frame img{width:100%;height:100%;object-fit:contain}
    .logs{margin-top:18px;background:#151518;border:1px solid #303036;border-radius:12px;overflow:hidden}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #2a2a2f;text-align:left;white-space:nowrap}th{background:#202024;color:#bdbdc7;font-weight:600}.url{max-width:720px;overflow:hidden;text-overflow:ellipsis}.correlation{max-width:260px;overflow:hidden;text-overflow:ellipsis}.status.ok{color:#34d399}.status.error{color:#fb7185}.more{padding:10px;text-align:center;color:#fbbf24;background:#201b10;font-size:13px}
  </style></head><body><header><div><div class="title">Raport diagnostyczny powtórki</div><div class="meta">Sesja: ${escapeHtml(sessionId)} · Użytkownik: ${escapeHtml(metadata?.identified_user_id || metadata?.user_id || "—")} · ${escapeHtml(metadata?.page_url ?? "")}</div></div><div class="range">${escapeHtml(formatOffset(options.startMs))} – ${escapeHtml(formatOffset(options.endMs))}</div></header><div class="frame"><img src="data:image/png;base64,${frameBase64}"></div><div class="logs"><table><thead><tr><th>Czas</th><th>Metoda</th><th>URL</th><th>Status</th><th>Czas trwania</th><th>Transfer</th><th>Correlation ID</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Brak żądań sieciowych w wybranym zakresie</td></tr>`}</tbody></table>${overflow}</div></body></html>`;
}

function buildGithubIssueReport({
  generatedAt,
  metadata,
  options,
  requests,
  sessionId,
  siteId,
}: {
  generatedAt: string;
  metadata: Record<string, unknown>;
  options: ReturnType<typeof normalizeOptions>;
  requests: ExportNetworkRequest[];
  sessionId: string;
  siteId: number;
}) {
  const networkSummary = summarizeNetworkRequests(requests);
  const highlightedRequests = [...requests]
    .sort((first, second) => requestPriority(second) - requestPriority(first) || first.startedAt - second.startedAt)
    .slice(0, 25);
  const requestRows = highlightedRequests
    .map(request => {
      const correlationId = findHeader(request.responseHeaders, "x-correlation-id") || "—";
      return `| ${formatOffset(request.startOffset)} | ${escapeMarkdownTable(request.method)} | ${request.status ?? "—"} | ${Math.round(request.durationMs)} ms | ${formatBytes(request.sizes?.transferSize)} | ${escapeMarkdownTable(formatRequestTarget(request.url))} | ${escapeMarkdownTable(correlationId)} |`;
    })
    .join("\n");
  const correlationIds = [
    ...new Set(requests.map(request => findHeader(request.responseHeaders, "x-correlation-id")).filter(Boolean)),
  ];
  const attachments = getIncludedFileNames(options.includeNetwork)
    .filter(filename => filename !== EXPORT_FILE_NAMES.githubReport && filename !== EXPORT_FILE_NAMES.readme)
    .map(filename => `- \`${filename}\``)
    .join("\n");

  return `# [Błąd] Krótki opis problemu

## Opis problemu
<!-- Opisz, co nie działa i jaki jest wpływ problemu. -->

## Kroki do odtworzenia
1. <!-- Pierwszy krok -->
2. <!-- Drugi krok -->
3. <!-- Trzeci krok -->

## Oczekiwany rezultat
<!-- Co powinno się wydarzyć? -->

## Rzeczywisty rezultat
<!-- Co wydarzyło się zamiast tego? -->

## Załączniki
${attachments}

## Dane diagnostyczne

| Pole | Wartość |
| --- | --- |
| Data wygenerowania | ${escapeMarkdownTable(generatedAt)} |
| ID witryny | ${siteId} |
| ID sesji | ${escapeMarkdownTable(sessionId)} |
| ID użytkownika | ${escapeMarkdownTable(metadata.identified_user_id || metadata.user_id || "—")} |
| Strona | ${escapeMarkdownTable(metadata.page_url || "—")} |
| Zakres powtórki | ${formatOffset(options.startMs)} – ${formatOffset(options.endMs)} |
| Przeglądarka | ${escapeMarkdownTable(joinMetadataValues(metadata.browser, metadata.browser_version))} |
| System operacyjny | ${escapeMarkdownTable(joinMetadataValues(metadata.operating_system, metadata.operating_system_version))} |
| Urządzenie | ${escapeMarkdownTable(metadata.device_type || "—")} |
| Rozdzielczość | ${escapeMarkdownTable(formatScreenSize(metadata.screen_width, metadata.screen_height))} |
| Lokalizacja | ${escapeMarkdownTable(joinMetadataValues(metadata.city, metadata.region, metadata.country))} |

## Podsumowanie żądań sieciowych

| Wszystkie | Sukces | Błędy 4xx | Błędy 5xx | Brak statusu | Transfer |
| ---: | ---: | ---: | ---: | ---: | ---: |
| ${networkSummary.total} | ${networkSummary.success} | ${networkSummary.clientErrors} | ${networkSummary.serverErrors} | ${networkSummary.unknown} | ${formatBytes(networkSummary.transferBytes)} |

${correlationIds.length > 0 ? `**Correlation ID:** ${correlationIds.map(value => `\`${escapeMarkdownInlineCode(value)}\``).join(", ")}` : "**Correlation ID:** brak"}

## Najważniejsze żądania sieciowe

${requests.length > highlightedRequests.length ? `Poniżej pokazano ${highlightedRequests.length} z ${requests.length} żądań. Pełne dane znajdują się w załącznikach sieciowych.` : `Liczba żądań: ${requests.length}.`}

| Czas | Metoda | Status | Czas trwania | Transfer | Adres | Correlation ID |
| --- | --- | ---: | ---: | ---: | --- | --- |
${requestRows || "| — | — | — | — | — | Brak żądań w wybranym zakresie | — |"}

## Informacje dodatkowe
<!-- Dodaj komunikaty błędów, obserwacje lub inne informacje pomocne przy analizie. -->
`;
}

function buildNetworkTextLog(requests: ExportNetworkRequest[]) {
  if (requests.length === 0) return "Brak żądań sieciowych w wybranym zakresie.\n";

  return requests
    .map((request, index) => {
      const correlationId = findHeader(request.responseHeaders, "x-correlation-id") || "—";
      return `${"=".repeat(100)}
ŻĄDANIE ${index + 1} Z ${requests.length}
${"=".repeat(100)}
Czas: ${formatOffset(request.startOffset)}
Metoda: ${request.method}
URL: ${request.url}
Strona źródłowa: ${request.currentUrl || "—"}
Status: ${request.status ?? "—"} ${request.statusText ?? ""}
Wynik: ${request.outcome}
Czas trwania: ${Math.round(request.durationMs)} ms
Transfer: ${formatBytes(request.sizes?.transferSize)}
Correlation ID: ${correlationId}
ID żądania: ${request.requestId}
Inicjator: ${request.initiatorType}

NAGŁÓWKI ŻĄDANIA
${formatHeadersForText(request.requestHeaders)}

TREŚĆ ŻĄDANIA
${formatBodyForText(request.requestBody)}

NAGŁÓWKI ODPOWIEDZI
${formatHeadersForText(request.responseHeaders)}

TREŚĆ ODPOWIEDZI
${formatBodyForText(request.responseBody)}
`;
    })
    .join("\n");
}

function buildPackageReadme(includeNetwork: boolean) {
  return `# Eksport diagnostyczny WoT-CV Rybbit

Paczka została przygotowana do utworzenia zgłoszenia GitHub.

## Najszybszy sposób użycia

1. Otwórz plik \`${EXPORT_FILE_NAMES.githubReport}\`.
2. Skopiuj jego treść do nowego zgłoszenia GitHub.
3. Uzupełnij sekcje opisujące problem, kroki oraz oczekiwany rezultat.
4. Dołącz pliki \`${EXPORT_FILE_NAMES.video}\` i \`${EXPORT_FILE_NAMES.screenshot}\`.
${includeNetwork ? `5. W razie potrzeby dołącz \`${EXPORT_FILE_NAMES.networkLog}\` lub cały plik ZIP.` : "5. W razie potrzeby dołącz cały plik ZIP."}

## Zawartość paczki

${getIncludedFileNames(includeNetwork)
  .map(filename => `- \`${filename}\` – ${getFileDescription(filename)}`)
  .join("\n")}

> Dane uwierzytelniające i typowe pola zawierające tokeny, hasła lub sekrety są automatycznie maskowane.
`;
}

function getIncludedFileNames(includeNetwork: boolean) {
  return [
    EXPORT_FILE_NAMES.video,
    EXPORT_FILE_NAMES.screenshot,
    EXPORT_FILE_NAMES.githubReport,
    ...(includeNetwork
      ? [EXPORT_FILE_NAMES.networkLog, EXPORT_FILE_NAMES.networkHar, EXPORT_FILE_NAMES.networkCsv]
      : []),
    EXPORT_FILE_NAMES.metadata,
    EXPORT_FILE_NAMES.readme,
  ];
}

function getFileDescription(filename: string) {
  const descriptions: Record<string, string> = {
    [EXPORT_FILE_NAMES.video]: "film przedstawiający wybrany zakres powtórki",
    [EXPORT_FILE_NAMES.screenshot]: "czytelny zrzut ekranu z podsumowaniem żądań",
    [EXPORT_FILE_NAMES.githubReport]: "gotowa treść zgłoszenia GitHub do skopiowania",
    [EXPORT_FILE_NAMES.networkLog]: "pełny, czytelny dziennik żądań i odpowiedzi",
    [EXPORT_FILE_NAMES.networkHar]: "dane sieciowe do importu w narzędziach deweloperskich",
    [EXPORT_FILE_NAMES.networkCsv]: "tabela żądań do analizy w arkuszu kalkulacyjnym",
    [EXPORT_FILE_NAMES.metadata]: "metadane techniczne eksportu",
    [EXPORT_FILE_NAMES.readme]: "instrukcja użycia paczki",
  };
  return descriptions[filename] ?? "plik diagnostyczny";
}

function summarizeNetworkRequests(requests: ExportNetworkRequest[]) {
  return requests.reduce(
    (summary, request) => {
      const status = request.status ?? 0;
      summary.total += 1;
      summary.transferBytes += request.sizes?.transferSize ?? 0;
      if (status >= 200 && status < 400) summary.success += 1;
      else if (status >= 400 && status < 500) summary.clientErrors += 1;
      else if (status >= 500) summary.serverErrors += 1;
      else summary.unknown += 1;
      return summary;
    },
    { total: 0, success: 0, clientErrors: 0, serverErrors: 0, unknown: 0, transferBytes: 0 }
  );
}

function requestPriority(request: ExportNetworkRequest) {
  const status = request.status ?? 0;
  if (status >= 500) return 4;
  if (status >= 400) return 3;
  if (status < 200) return 2;
  return 1;
}

function formatRequestTarget(value: string) {
  try {
    const url = new URL(value);
    return truncateText(`${url.host}${url.pathname}${url.search}`, 160);
  } catch {
    return truncateText(value, 160);
  }
}

function formatHeadersForText(headers: Record<string, string>) {
  const entries = Object.entries(headers).sort(([first], [second]) => first.localeCompare(second));
  if (entries.length === 0) return "(brak)";
  return entries.map(([name, value]) => `${name}: ${value}`).join("\n");
}

function formatBodyForText(body?: Record<string, unknown>) {
  if (!body) return "(brak)";
  const { value, ...metadata } = body;
  const metadataText = Object.entries(metadata)
    .map(([name, entryValue]) => `${name}: ${String(entryValue ?? "")}`)
    .join("\n");
  const bodyText = typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  return `${metadataText || "metadane: brak"}\n\n${truncateText(bodyText, 100_000)}`;
}

function joinMetadataValues(...values: unknown[]) {
  const parts = values.map(value => String(value ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function formatScreenSize(width: unknown, height: unknown) {
  return width && height ? `${String(width)} × ${String(height)}` : "—";
}

function escapeMarkdownTable(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function escapeMarkdownInlineCode(value: unknown) {
  return String(value ?? "").replace(/`/g, "'");
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength)}\n...[skrócono ${value.length - maxLength} znaków]`;
}

function buildHar(requests: ExportNetworkRequest[]) {
  return {
    log: {
      version: "1.2",
      creator: { name: "WoT-CV Rybbit", version: "1" },
      entries: requests.map(request => ({
        startedDateTime: new Date(request.startedAt).toISOString(),
        time: request.durationMs,
        request: {
          method: request.method,
          url: request.url,
          httpVersion: "HTTP/1.1",
          headers: Object.entries(request.requestHeaders).map(([name, value]) => ({ name, value })),
          queryString: safeQueryString(request.url),
          cookies: [],
          headersSize: -1,
          bodySize: bodySize(request.requestBody),
          postData: request.requestBody?.value
            ? { mimeType: String(request.requestBody.contentType ?? ""), text: String(request.requestBody.value) }
            : undefined,
        },
        response: {
          status: request.status ?? 0,
          statusText: request.statusText ?? "",
          httpVersion: "HTTP/1.1",
          headers: Object.entries(request.responseHeaders).map(([name, value]) => ({ name, value })),
          cookies: [],
          content: {
            size: bodySize(request.responseBody),
            mimeType: String(request.responseBody?.contentType ?? ""),
            text: request.responseBody?.value ? String(request.responseBody.value) : undefined,
          },
          redirectURL: "",
          headersSize: -1,
          bodySize: bodySize(request.responseBody),
        },
        cache: {},
        timings: { send: 0, wait: request.durationMs, receive: 0 },
      })),
    },
  };
}

function buildNetworkCsv(requests: ExportNetworkRequest[]) {
  const headers = ["time", "method", "url", "status", "duration_ms", "transfer_bytes", "outcome", "correlation_id"];
  const rows = requests.map(request => [
    formatOffset(request.startOffset),
    request.method,
    request.url,
    request.status ?? "",
    request.durationMs,
    request.sizes?.transferSize ?? "",
    request.outcome,
    findHeader(request.responseHeaders, "x-correlation-id"),
  ]);
  return [headers, ...rows].map(row => row.map(csvValue).join(",")).join("\n");
}

function safeQueryString(value: string) {
  try {
    return [...new URL(value).searchParams.entries()].map(([name, entryValue]) => ({ name, value: entryValue }));
  } catch {
    return [];
  }
}

function bodySize(body?: Record<string, unknown>) {
  return finiteNumber(body?.sizeBytes) ?? (typeof body?.value === "string" ? Buffer.byteLength(body.value) : 0);
}

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function findHeader(headers: Record<string, string>, target: string) {
  const match = Object.entries(headers).find(([name]) => name.toLowerCase() === target.toLowerCase());
  return match?.[1] ?? "";
}

function statusClass(status?: number) {
  if (status === undefined) return "";
  return status >= 400 ? "error" : "ok";
}

function formatOffset(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}.${String(Math.floor(milliseconds % 1000)).padStart(3, "0")}`;
}

function formatBytes(value?: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!
  );
}

function safeFilename(value: string) {
  return basename(value)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
  const record = recordValue(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, String(entry)]));
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const entries = Object.entries(record).filter(
    (entry): entry is [string, number] => finiteNumber(entry[1]) !== undefined
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

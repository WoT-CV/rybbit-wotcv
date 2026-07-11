import { getRecordNetworkPlugin, type NetworkReplayRecordPlugin } from "./networkReplay/networkPlugin.js";
import { getJsonByteSize } from "./networkReplay/utils.js";
import { ScriptConfig, SessionReplayBatch, SessionReplayEvent, SessionReplayTransportError } from "./types.js";

const SAMPLE_STORAGE_KEY = "rybbit-replay-sampled";
const ACTIVITY_CAPTURE_VERSION = 2;

/**
 * Determines if this session should have replay enabled based on sample rate.
 * Uses sessionStorage to persist the decision for the entire browser session.
 */
function shouldSampleSession(sampleRate: number): boolean {
  // 100% = always record, 0% = never record
  if (sampleRate >= 100) return true;
  if (sampleRate <= 0) return false;

  // Check if we already made a decision for this session
  try {
    const existingDecision = sessionStorage.getItem(SAMPLE_STORAGE_KEY);
    if (existingDecision !== null) {
      return existingDecision === "1";
    }

    // Make new sampling decision
    const sampled = Math.random() * 100 < sampleRate;
    sessionStorage.setItem(SAMPLE_STORAGE_KEY, sampled ? "1" : "0");

    return sampled;
  } catch {
    // sessionStorage not available, default to sampling
    return Math.random() * 100 < sampleRate;
  }
}

// rrweb types (simplified for our use case)
declare global {
  interface Window {
    rrweb?: {
      record: (options: {
        emit: (event: any) => void;
        checkoutEveryNms?: number;
        checkoutEveryNth?: number;
        blockClass?: string | RegExp;
        blockSelector?: string;
        ignoreClass?: string | RegExp;
        ignoreSelector?: string;
        maskTextClass?: string | RegExp;
        maskTextSelector?: string;
        maskAllInputs?: boolean;
        maskInputOptions?: Record<string, boolean>;
        slimDOMOptions?: Record<string, boolean> | boolean;
        sampling?: Record<string, any>;
        recordCanvas?: boolean;
        collectFonts?: boolean;
        plugins?: NetworkReplayRecordPlugin[];
      }) => () => void;
    };
  }
}

export class SessionReplayRecorder {
  private config: ScriptConfig;
  private isRecording: boolean = false;
  private stopRecordingFn?: () => void;
  private userId: string;
  private eventBuffer: SessionReplayEvent[] = [];
  private eventBufferSizeBytes: number = 0;
  private pendingBatches: SessionReplayEvent[][] = [];
  private isSendingBatches: boolean = false;
  private batchTimer?: number;
  private sendBatch: (batch: SessionReplayBatch) => Promise<void>;

  constructor(config: ScriptConfig, userId: string, sendBatch: (batch: SessionReplayBatch) => Promise<void>) {
    this.config = config;
    this.userId = userId;
    this.sendBatch = sendBatch;
  }

  async initialize(): Promise<void> {
    if (!this.config.enableSessionReplay) {
      return;
    }

    // Check sample rate if specified
    const sampleRate = this.config.sessionReplaySampleRate;
    if (sampleRate !== undefined && !shouldSampleSession(sampleRate)) {
      return;
    }

    // Load rrweb if not already loaded
    if (!window.rrweb) {
      await this.loadRrweb();
    }

    if (window.rrweb) {
      this.startRecording();
    }
  }

  private async loadRrweb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      // Load from same origin to avoid CDN blocking
      script.src = `${this.config.analyticsHost}/replay.js`;
      script.async = false;
      script.onload = () => {
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load rrweb"));
      document.head.appendChild(script);
    });
  }

  public startRecording(): void {
    if (this.isRecording || !window.rrweb || !this.config.enableSessionReplay) {
      return;
    }

    try {
      // Default slimDOMOptions (can be overridden via config)
      const defaultSlimDOMOptions = {
        script: false,
        comment: true,
        headFavicon: true,
        headWhitespace: true,
        headMetaDescKeywords: true,
        headMetaSocial: true,
        headMetaRobots: true,
        headMetaHttpEquiv: true,
        headMetaAuthorship: true,
        headMetaVerification: true,
      };

      const recordingOptions: any = {
        emit: (event: any) => {
          this.addEvent({
            type: event.type,
            data: event.data,
            timestamp: event.timestamp || Date.now(),
          });
        },
        recordCanvas: false, // Always disabled to save disk space
        checkoutEveryNms: 60000, // Checkout every 60 seconds
        checkoutEveryNth: 500, // Checkout every 500 events
        // Use config values with fallbacks to defaults
        blockClass: this.config.sessionReplayBlockClass ?? "rr-block",
        blockSelector: this.config.sessionReplayBlockSelector ?? null,
        ignoreClass: this.config.sessionReplayIgnoreClass ?? "rr-ignore",
        ignoreSelector: this.config.sessionReplayIgnoreSelector ?? null,
        maskTextClass: this.config.sessionReplayMaskTextClass ?? "rr-mask",
        maskAllInputs: this.config.sessionReplayMaskAllInputs ?? true,
        maskInputOptions: this.config.sessionReplayMaskInputOptions ?? { password: true, email: true },
        collectFonts: this.config.sessionReplayCollectFonts ?? true,
        slimDOMOptions: this.config.sessionReplaySlimDOMOptions ?? defaultSlimDOMOptions,
        plugins: this.config.networkReplay?.enabled
          ? [getRecordNetworkPlugin(this.config.networkReplay, this.config.analyticsHost)]
          : [],
      };

      // Add custom text masking selectors if configured
      if (this.config.sessionReplayMaskTextSelectors && this.config.sessionReplayMaskTextSelectors.length > 0) {
        recordingOptions.maskTextSelector = this.config.sessionReplayMaskTextSelectors.join(", ");
      }

      if (this.config.sessionReplaySampling !== undefined) {
        recordingOptions.sampling = this.config.sessionReplaySampling;
      }

      this.stopRecordingFn = window.rrweb.record(recordingOptions);

      this.addEvent({
        type: 5,
        data: {
          tag: "wotcv/replay-config",
          payload: {
            activityCaptureVersion: ACTIVITY_CAPTURE_VERSION,
            sampling: this.config.sessionReplaySampling ?? null,
          },
        },
        timestamp: Date.now(),
      });

      this.isRecording = true;
      this.setupBatchTimer();
    } catch (error) {
      // Recording failed silently
    }
  }

  public stopRecording(): void {
    if (!this.isRecording) {
      return;
    }

    if (this.stopRecordingFn) {
      this.stopRecordingFn();
    }

    this.isRecording = false;
    this.clearBatchTimer();

    // Send any remaining events
    if (this.eventBuffer.length > 0) {
      this.flushEvents();
    }
  }

  public isActive(): boolean {
    return this.isRecording;
  }

  private addEvent(event: SessionReplayEvent): void {
    const eventSizeBytes = getJsonByteSize(event);
    const maxBatchSizeBytes = this.config.networkReplay?.maxReplayBatchSizeBytes ?? 7_000_000;

    if (this.eventBuffer.length > 0 && this.eventBufferSizeBytes + eventSizeBytes > maxBatchSizeBytes) {
      this.flushEvents();
    }

    this.eventBuffer.push(event);
    this.eventBufferSizeBytes += eventSizeBytes;

    if (eventSizeBytes >= maxBatchSizeBytes || this.eventBuffer.length >= this.config.sessionReplayBatchSize) {
      this.flushEvents();
    }
  }

  private setupBatchTimer(): void {
    this.clearBatchTimer();
    this.batchTimer = window.setInterval(() => {
      if (this.eventBuffer.length > 0) {
        this.flushEvents();
      }
    }, this.config.sessionReplayBatchInterval);
  }

  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = undefined;
    }
  }

  private flushEvents(): void {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = this.eventBuffer;
    this.eventBuffer = [];
    this.eventBufferSizeBytes = 0;
    this.pendingBatches.push(events);
    void this.processPendingBatches();
  }

  private async processPendingBatches(): Promise<void> {
    if (this.isSendingBatches) {
      return;
    }

    this.isSendingBatches = true;

    try {
      while (this.pendingBatches.length > 0) {
        const events = this.pendingBatches.shift();
        if (!events) {
          continue;
        }

        const unsentEvents = await this.sendEventsWithPayloadFallback(events);
        if (unsentEvents) {
          const queuedEvents = this.pendingBatches.flat();
          this.pendingBatches = [];
          this.prependEvents([...unsentEvents, ...queuedEvents]);
          console.warn(`[SessionReplay] ${unsentEvents.length + queuedEvents.length} events queued for retry`);
          break;
        }
      }
    } finally {
      this.isSendingBatches = false;
    }
  }

  private async sendEventsWithPayloadFallback(events: SessionReplayEvent[]): Promise<SessionReplayEvent[] | undefined> {
    try {
      await this.sendBatch(this.createBatch(events));
      return undefined;
    } catch (error) {
      if (!this.isPayloadTooLargeError(error)) {
        return events;
      }

      if (events.length === 1) {
        const event = events[0];
        console.warn(
          `[SessionReplay] Dropped event type ${String(event.type)} at ${event.timestamp} after HTTP 413 (${getJsonByteSize(event)} bytes)`
        );
        return undefined;
      }

      const splitIndex = Math.ceil(events.length / 2);
      const firstBatch = events.slice(0, splitIndex);
      const secondBatch = events.slice(splitIndex);
      const unsentFirstBatch = await this.sendEventsWithPayloadFallback(firstBatch);

      if (unsentFirstBatch) {
        return [...unsentFirstBatch, ...secondBatch];
      }

      return this.sendEventsWithPayloadFallback(secondBatch);
    }
  }

  private createBatch(events: SessionReplayEvent[]): SessionReplayBatch {
    return {
      userId: this.userId,
      events,
      metadata: {
        pageUrl: window.location.href,
        viewportWidth: screen.width,
        viewportHeight: screen.height,
        language: navigator.language,
      },
    };
  }

  private isPayloadTooLargeError(error: unknown): boolean {
    if (error instanceof SessionReplayTransportError) {
      return error.status === 413;
    }

    return typeof error === "object" && error !== null && "status" in error && error.status === 413;
  }

  private prependEvents(events: SessionReplayEvent[]): void {
    this.eventBuffer = [...events, ...this.eventBuffer];
    this.eventBufferSizeBytes = this.eventBuffer.reduce((sizeBytes, event) => sizeBytes + getJsonByteSize(event), 0);
  }

  // Update user ID when it changes
  public updateUserId(userId: string): void {
    this.userId = userId;
  }

  // Handle page navigation for SPAs
  public onPageChange(): void {
    if (this.isRecording) {
      // Flush current events before page change
      this.flushEvents();
    }
  }

  // Cleanup on page unload
  public cleanup(): void {
    this.stopRecording();
  }
}

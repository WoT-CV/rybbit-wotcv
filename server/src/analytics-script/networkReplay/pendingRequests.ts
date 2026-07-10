import { createUnavailableBody } from "./bodyCapture.js";
import type {
  CapturedBody,
  CapturedNetworkRequest,
  CapturedNetworkRequestDraft,
  CapturedNetworkSizes,
  CapturedNetworkTiming,
  NetworkRequestEmitter,
} from "./types.js";
import { getDurationMs } from "./utils.js";

interface PendingRequestState {
  request: CapturedNetworkRequestDraft;
  requestBodyTask?: Promise<void>;
  responseBodyTask?: Promise<void>;
  completionTask?: Promise<void>;
  networkCompleted: boolean;
  finishScheduled: boolean;
  emitted: boolean;
}

export class PendingRequests {
  private readonly requests = new Map<string, PendingRequestState>();

  constructor(private readonly emit: NetworkRequestEmitter) {}

  register(request: CapturedNetworkRequestDraft, requestBody?: Promise<CapturedBody>): void {
    const state: PendingRequestState = {
      request,
      networkCompleted: false,
      finishScheduled: false,
      emitted: false,
    };

    if (requestBody) {
      state.requestBodyTask = this.attachBodyTask(state, "requestBody", requestBody);
    }

    this.requests.set(request.requestId, state);
  }

  complete(
    requestId: string,
    updates: Pick<
      CapturedNetworkRequest,
      "completedAt" | "durationMs" | "error" | "outcome" | "responseHeaders" | "status" | "statusText"
    >,
    responseBody?: Promise<CapturedBody>,
    completionTask?: Promise<void>
  ): void {
    const state = this.requests.get(requestId);
    if (!state || state.emitted || state.networkCompleted) {
      return;
    }

    Object.assign(state.request, updates);
    state.networkCompleted = true;

    if (responseBody) {
      state.responseBodyTask = this.attachBodyTask(state, "responseBody", responseBody);
    }

    if (completionTask) {
      state.completionTask = completionTask.catch(() => undefined);
    }

    this.scheduleCompletedEmission(state);
  }

  addPerformance(requestId: string, timing: CapturedNetworkTiming, sizes: CapturedNetworkSizes | undefined): void {
    const state = this.requests.get(requestId);
    if (!state || state.emitted) {
      return;
    }

    state.request.timing = timing;
    state.request.sizes = sizes;
    state.request.performanceEntryFound = true;
  }

  finalizePendingOnUnload(): void {
    const completedAt = Date.now();

    for (const state of this.requests.values()) {
      if (state.emitted) {
        continue;
      }

      if (!state.networkCompleted) {
        state.request.completedAt = completedAt;
        state.request.durationMs = getDurationMs(state.request.startedAt, completedAt);
        state.request.outcome = "pending_on_unload";
      }

      if (state.requestBodyTask && !state.request.requestBody) {
        state.request.requestBody = createUnavailableBody(
          "unreadable",
          "Recorder stopped before request body capture completed"
        );
      }

      if (state.responseBodyTask && !state.request.responseBody) {
        state.request.responseBody = createUnavailableBody(
          "unreadable",
          "Recorder stopped before response body capture completed"
        );
      }

      if (state.requestBodyTask || state.responseBodyTask) {
        state.request.bodyCaptureCompletedAt = completedAt;
      }

      this.emitState(state);
    }
  }

  private attachBodyTask(
    state: PendingRequestState,
    field: "requestBody" | "responseBody",
    bodyPromise: Promise<CapturedBody>
  ): Promise<void> {
    return bodyPromise.then(
      body => {
        if (!state.emitted) {
          state.request[field] = body;
        }
      },
      error => {
        if (!state.emitted) {
          state.request[field] = createUnavailableBody(
            "unreadable",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    );
  }

  private scheduleCompletedEmission(state: PendingRequestState): void {
    if (state.finishScheduled) {
      return;
    }

    state.finishScheduled = true;
    const completionTasks = [state.requestBodyTask, state.responseBodyTask, state.completionTask].filter(
      (task): task is Promise<void> => task !== undefined
    );

    void Promise.all(completionTasks).then(() => {
      if (!state.emitted) {
        if (state.requestBodyTask || state.responseBodyTask) {
          state.request.bodyCaptureCompletedAt = Date.now();
        }
        this.emitState(state);
      }
    });
  }

  private emitState(state: PendingRequestState): void {
    if (state.emitted || !state.request.outcome) {
      return;
    }

    state.emitted = true;
    this.requests.delete(state.request.requestId);

    try {
      this.emit(state.request as CapturedNetworkRequest);
    } catch {
      return;
    }
  }
}

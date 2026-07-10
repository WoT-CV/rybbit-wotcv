import { createUnavailableBody } from "./bodyCapture.js";
import type {
  CapturedBody,
  CapturedNetworkRequest,
  CapturedNetworkRequestDraft,
  NetworkRequestEmitter,
} from "./types.js";
import { getDurationMs } from "./utils.js";

interface PendingRequestState {
  request: CapturedNetworkRequestDraft;
  requestBodyTask?: Promise<void>;
  responseBodyTask?: Promise<void>;
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
    responseBody?: Promise<CapturedBody>
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

    this.scheduleCompletedEmission(state);
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
    const bodyTasks = [state.requestBodyTask, state.responseBodyTask].filter(
      (task): task is Promise<void> => task !== undefined
    );

    void Promise.all(bodyTasks).then(() => {
      if (!state.emitted) {
        if (bodyTasks.length > 0) {
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

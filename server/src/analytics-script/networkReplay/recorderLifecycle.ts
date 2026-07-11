export class RecorderLifecycle {
  private cleanups: Array<() => void> = [];
  private stopped = false;

  add(cleanup: () => void): void {
    if (this.stopped) {
      runCleanup(cleanup);
      return;
    }
    this.cleanups.push(cleanup);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    for (const cleanup of this.cleanups.reverse()) {
      runCleanup(cleanup);
    }
    this.cleanups = [];
  }
}

function runCleanup(cleanup: () => void): void {
  try {
    cleanup();
  } catch {
    // A failed observer cleanup must not prevent restoring the remaining browser APIs.
  }
}

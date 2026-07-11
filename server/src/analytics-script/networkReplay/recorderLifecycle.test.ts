import { describe, expect, it, vi } from "vitest";

import { RecorderLifecycle } from "./recorderLifecycle.js";

describe("RecorderLifecycle", () => {
  it("runs cleanups once in reverse registration order", () => {
    const calls: string[] = [];
    const lifecycle = new RecorderLifecycle();
    lifecycle.add(() => calls.push("fetch"));
    lifecycle.add(() => calls.push("xhr"));

    lifecycle.stop();
    lifecycle.stop();

    expect(calls).toEqual(["xhr", "fetch"]);
  });

  it("continues cleanup after one observer throws", () => {
    const successfulCleanup = vi.fn();
    const lifecycle = new RecorderLifecycle();
    lifecycle.add(successfulCleanup);
    lifecycle.add(() => {
      throw new Error("cleanup failed");
    });

    lifecycle.stop();

    expect(successfulCleanup).toHaveBeenCalledOnce();
  });

  it("immediately cleans resources registered after stop", () => {
    const cleanup = vi.fn();
    const lifecycle = new RecorderLifecycle();
    lifecycle.stop();
    lifecycle.add(cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

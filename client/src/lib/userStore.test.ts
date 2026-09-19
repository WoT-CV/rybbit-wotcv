import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ authClient: { getSession: mocks.getSession } }));

beforeEach(() => {
  vi.resetModules();
  mocks.getSession.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("browser session store", () => {
  it("does not fetch or resolve a user while rendering on the server", async () => {
    const { userStore } = await import("./userStore");
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(userStore.getState()).toMatchObject({ user: null, isPending: true });
  });

  it("loads the browser session", async () => {
    vi.stubGlobal("window", {});
    const user = { id: "test-owner", email: "owner@example.com" };
    mocks.getSession.mockResolvedValue({ data: { user } });
    const { userStore } = await import("./userStore");
    await vi.waitFor(() => expect(userStore.getState()).toMatchObject({ user, isPending: false }));
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it.each(["signed-out", "unavailable"])("fails closed when the session is %s", async state => {
    vi.stubGlobal("window", {});
    if (state === "unavailable") mocks.getSession.mockRejectedValue(new Error("Network unavailable"));
    else mocks.getSession.mockResolvedValue({ data: null });
    const { userStore } = await import("./userStore");
    await vi.waitFor(() => expect(userStore.getState()).toMatchObject({ user: null, isPending: false }));
  });
});

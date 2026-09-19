import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configs: { capabilities: { unclaimedSites: true }, disableSignup: false },
  loading: false,
  error: null as Error | null,
  params: new URLSearchParams(),
  create: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next-intl", () => ({ useExtracted: () => (message: string) => message }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => state.params,
}));
vi.mock("@/lib/configs", () => ({
  useConfigs: () => ({
    configs: state.loading ? undefined : state.configs,
    isLoading: state.loading,
    error: state.error,
  }),
}));
vi.mock("@/api/admin/endpoints", () => ({ createUnclaimedSite: state.create }));
vi.mock("@/hooks/useSetPageTitle", () => ({ useSetPageTitle: vi.fn() }));
vi.mock("@/components/RybbitLogo", () => ({ RybbitTextLogo: () => <span>Rybbit</span> }));
import TryPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  state.configs = { capabilities: { unclaimedSites: true }, disableSignup: false };
  state.loading = false;
  state.error = null;
  state.params = new URLSearchParams();
  state.create.mockResolvedValue({ siteId: 7, privateLinkKey: "aaaaaaaaaaaa" });
});
afterEach(cleanup);

describe("anonymous onboarding capability", () => {
  it.each(["capability", "signup"])("does not auto-create when %s is disabled", async disabled => {
    state.params = new URLSearchParams("domain=example.com");
    if (disabled === "capability") state.configs.capabilities.unclaimedSites = false;
    else state.configs.disableSignup = true;
    render(<TryPage />);
    await screen.findByText("Anonymous site creation is disabled");
    expect(screen.queryByRole("button", { name: "Add my site" })).toBeNull();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("fails closed when runtime configuration cannot be loaded", async () => {
    state.error = new Error("Configuration unavailable");
    // A previous successful response may still be cached while refetch fails.
    state.params = new URLSearchParams("domain=example.com");
    render(<TryPage />);
    await screen.findByText("Configuration unavailable");
    expect(state.create).not.toHaveBeenCalled();
  });

  it("waits for explicit opt-in and creates only once from the landing URL", async () => {
    state.params = new URLSearchParams("domain=example.com");
    state.loading = true;
    const view = render(<TryPage />);
    expect(state.create).not.toHaveBeenCalled();
    state.loading = false;
    view.rerender(<TryPage />);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/7/aaaaaaaaaaaa"));
    view.rerender(<TryPage />);
    expect(state.create).toHaveBeenCalledExactlyOnceWith("example.com");
  });

  it("allows manual creation only with a valid domain and explicit opt-in", async () => {
    render(<TryPage />);
    const submit = screen.getByRole("button", { name: "Add my site" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Website Domain"), { target: { value: "Example.com" } });
    fireEvent.click(submit);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/7/aaaaaaaaaaaa"));
    expect(state.create).toHaveBeenCalledExactlyOnceWith("example.com");
  });
});

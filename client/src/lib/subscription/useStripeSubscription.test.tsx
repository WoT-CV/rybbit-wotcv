import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cloud: false,
  org: { id: "test-org" } as { id: string } | null,
  query: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/const", () => ({
  get IS_CLOUD() {
    return state.cloud;
  },
}));
vi.mock("@/lib/auth", () => ({ authClient: { useActiveOrganization: () => ({ data: state.org }) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: state.query }));
vi.mock("../../api/utils", () => ({ authedFetch: state.fetch }));

import { useStripeSubscription } from "./useStripeSubscription";

describe("subscription query capability", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it.each([
    { cloud: false, org: { id: "test-org" }, enabled: false },
    { cloud: true, org: null, enabled: false },
    { cloud: true, org: { id: "test-org" }, enabled: true },
  ])("enables billing only with cloud and organization: $enabled", ({ cloud, org, enabled }) => {
    state.cloud = cloud;
    state.org = org;
    renderHook(useStripeSubscription);
    expect(state.query).toHaveBeenCalledWith(expect.objectContaining({ enabled }));
    expect(state.fetch).not.toHaveBeenCalled();
  });
});

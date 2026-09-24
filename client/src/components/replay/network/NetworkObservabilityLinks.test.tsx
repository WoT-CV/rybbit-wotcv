import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplayObservabilityProfile } from "@rybbit/shared";

const state = vi.hoisted(() => ({ profiles: undefined as ReplayObservabilityProfile[] | undefined }));
vi.mock("@/api/admin/hooks/useReplayObservability", () => ({ useReplayObservability: () => state.profiles }));
vi.mock("next-intl", () => ({ useExtracted: () => (message: string) => message }));

import { NetworkObservabilityLinks } from "./NetworkObservabilityLinks";
import { parseNetworkEvents } from "./parseNetworkEvents";

const request = parseNetworkEvents([
  {
    type: 6,
    timestamp: 1700000000100,
    data: {
      plugin: "rrweb/network@1",
      payload: {
        version: 1,
        requests: [
          {
            schemaVersion: 1,
            requestId: "r",
            url: "https://api.example.com/a",
            startedAt: 1700000000000,
            correlationId: "c",
          },
        ],
      },
    },
  },
])[0];

beforeEach(() => {
  state.profiles = [
    {
      requestOrigin: "https://api.example.com",
      grafanaUrl: "https://logs.example.com",
      orgId: 1,
      lokiDatasourceUid: "loki",
      serviceName: "api",
      environment: "prod",
      timePaddingMs: 120000,
    },
  ];
});
afterEach(cleanup);

describe("request observability actions", () => {
  it("does not close an ancestor replay panel or claim body coverage", () => {
    const close = vi.fn();
    render(
      <div onClick={close} onPointerDown={close}>
        <NetworkObservabilityLinks request={request} />
      </div>
    );
    const link = screen.getByRole("link", { name: "Open logs in Grafana" });
    fireEvent.pointerDown(link);
    fireEvent.click(link);
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "These links search logs and traces; they do not confirm that bodies, headers or URL parameters were saved."
      )
    ).toBeTruthy();
  });
  it("opens a protected external destination with no opener or referrer", () => {
    render(<NetworkObservabilityLinks request={request} />);
    const link = screen.getByRole("link", { name: "Open logs in Grafana" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/logs\.example\.com\/explore\?/);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });
  it("renders no action when the protected profile was not supplied", () => {
    state.profiles = undefined;
    const { container } = render(<NetworkObservabilityLinks request={request} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("does not link requests without an identifier", () => {
    render(<NetworkObservabilityLinks request={{ ...request, correlationId: undefined }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("renders a trace-only request without an empty logs link", () => {
    state.profiles![0].tempoDatasourceUid = "tempo";
    render(<NetworkObservabilityLinks request={{ ...request, correlationId: undefined, traceId: "a".repeat(32) }} />);
    expect(screen.queryByRole("link", { name: "Open logs in Grafana" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open trace in Grafana" }).getAttribute("rel")).toBe("noopener noreferrer");
  });
});

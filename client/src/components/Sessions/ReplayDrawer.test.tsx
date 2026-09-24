import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReplayStore } from "@/components/replay/replayStore";

const mocks = vi.hoisted(() => ({
  translateHook: vi.fn(() => (text: string) => text),
  wide: false,
  observe: vi.fn(),
  resize: () => {},
}));
vi.mock("next-intl", () => ({ useExtracted: mocks.translateHook }));
vi.mock("@/components/replay/player/ReplayPlayer", () => ({
  ReplayPlayer: ({ width }: { width: number }) => <div data-width={width}>Replay player</div>,
}));
vi.mock("@/components/replay/ReplayBreadcrumbs", () => ({ ReplayBreadcrumbs: () => <div>Replay timeline</div> }));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => (open ? <div>{children}</div> : null),
  DrawerContent: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  DrawerTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DrawerClose: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { ReplayDrawer } from "./ReplayDrawer";

describe("ReplayDrawer mobile and store isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.wide = false;
    mocks.translateHook.mockClear();
    mocks.observe.mockClear();
    useReplayStore.setState(useReplayStore.getInitialState());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          mocks.resize = callback;
        }
        observe = mocks.observe;
        disconnect() {}
      }
    );
    vi.stubGlobal("matchMedia", () => ({ matches: mocks.wide }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 390, height: 700 } as DOMRect);
  });

  it("observes the mounted player container and remeasures after the desktop sidebar takes space", () => {
    mocks.wide = true;
    render(<ReplayDrawer open sessionId="test" onOpenChange={() => {}} />);
    const container = screen.getByText("Replay player").parentElement;
    expect(mocks.observe).toHaveBeenCalledWith(container);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 1064, height: 859 } as DOMRect);
    act(() => mocks.resize());
    expect(screen.getByText("Replay player").getAttribute("data-width")).toBe("1064");
    expect(screen.getByText("Replay timeline")).toBeTruthy();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not mount a CSS-hidden timeline on phones and protects interactive content from drawer dragging", () => {
    render(<ReplayDrawer open sessionId="test" onOpenChange={() => {}} />);
    act(() => vi.advanceTimersByTime(100));
    expect(screen.queryByText("Replay timeline")).toBeNull();
    expect(screen.getByText("Replay player").closest("[data-vaul-no-drag]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    mocks.wide = true;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(screen.getByText("Replay timeline")).toBeTruthy();
    mocks.wide = false;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(screen.queryByText("Replay timeline")).toBeNull();
  });

  it("does not re-render every closed session drawer on playback clock ticks", () => {
    render(
      <>
        {Array.from({ length: 100 }, (_, index) => (
          <ReplayDrawer key={index} open={false} sessionId={String(index)} onOpenChange={() => {}} />
        ))}
      </>
    );
    expect(mocks.translateHook).toHaveBeenCalledTimes(100);
    act(() => {
      for (let currentTime = 0; currentTime < 1000; currentTime += 16) useReplayStore.setState({ currentTime });
    });
    expect(mocks.translateHook).toHaveBeenCalledTimes(100);
  });
});

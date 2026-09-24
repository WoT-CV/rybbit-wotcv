import React from "react";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useHydrated } from "./useHydrated";

function HydrationProbe() {
  return <button disabled={!useHydrated()}>Ready</button>;
}

describe("useHydrated", () => {
  it("uses the server snapshot for hydration before enabling browser-only state", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<HydrationProbe />);
    expect(container.querySelector("button")?.disabled).toBe(true);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <HydrationProbe />, { onRecoverableError });
    });
    expect(container.querySelector("button")?.disabled).toBe(false);
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});

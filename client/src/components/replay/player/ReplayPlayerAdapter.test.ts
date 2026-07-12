import { beforeEach, describe, expect, it, vi } from "vitest";

const rrwebPlayerMock = vi.hoisted(() => ({
  constructorOptions: [] as Array<{
    props: { skipInactive?: boolean };
  }>,
  destroyReplayer: vi.fn(),
  destroySvelte: vi.fn(),
  pause: vi.fn(),
}));

vi.mock("rrweb-player", () => ({
  default: class RrwebPlayerMock {
    constructor(options: { props: { skipInactive?: boolean } }) {
      rrwebPlayerMock.constructorOptions.push(options);
    }

    play() {}

    pause() {
      rrwebPlayerMock.pause();
    }

    goto() {}

    setSpeed() {}

    triggerResize() {}

    getMetaData() {
      return { totalTime: 0 };
    }

    getReplayer() {
      return { destroy: rrwebPlayerMock.destroyReplayer };
    }

    addEventListener() {}

    $set() {}

    $destroy() {
      rrwebPlayerMock.destroySvelte();
    }
  },
}));

import { ReplayPlayerAdapter } from "./ReplayPlayerAdapter";

describe("ReplayPlayerAdapter", () => {
  beforeEach(() => {
    rrwebPlayerMock.constructorOptions.length = 0;
    rrwebPlayerMock.destroyReplayer.mockClear();
    rrwebPlayerMock.destroySvelte.mockClear();
    rrwebPlayerMock.pause.mockClear();
  });

  it("disables the native rrweb inactivity acceleration", () => {
    createAdapter();

    expect(rrwebPlayerMock.constructorOptions[0]?.props.skipInactive).toBe(false);
  });

  it("releases the replayer and Svelte component exactly once", () => {
    const replaceChildren = vi.fn();
    const adapter = createAdapter(replaceChildren);

    adapter.destroy();
    adapter.destroy();

    expect(rrwebPlayerMock.pause).toHaveBeenCalledOnce();
    expect(rrwebPlayerMock.destroyReplayer).toHaveBeenCalledOnce();
    expect(rrwebPlayerMock.destroySvelte).toHaveBeenCalledOnce();
    expect(replaceChildren).toHaveBeenCalledOnce();
  });
});

function createAdapter(replaceChildren = vi.fn()) {
  return new ReplayPlayerAdapter({
    target: { replaceChildren } as unknown as HTMLElement,
    events: [],
    width: 390,
    height: 844,
  });
}

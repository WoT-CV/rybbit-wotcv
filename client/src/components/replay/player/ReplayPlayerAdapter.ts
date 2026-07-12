import type { eventWithTime, playerMetaData } from "@rrweb/types";
import rrwebPlayer from "rrweb-player";

import type { ReplayEventLike } from "../network/types";

type RrwebPlayerInstance = InstanceType<typeof rrwebPlayer>;

interface ReplayPlayerAdapterOptions {
  target: HTMLElement;
  events: ReplayEventLike[];
  width: number;
  height: number;
}

export class ReplayPlayerAdapter {
  private active = true;
  private readonly player: RrwebPlayerInstance;
  private readonly target: HTMLElement;

  constructor({ target, events, width, height }: ReplayPlayerAdapterOptions) {
    this.target = target;
    this.player = new rrwebPlayer({
      target,
      props: {
        events: events as unknown as eventWithTime[],
        width,
        height,
        autoPlay: false,
        skipInactive: false,
        showController: false,
      },
    });
  }

  play(): void {
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  seek(offset: number): void {
    this.player.goto(offset);
  }

  setSpeed(speed: number): void {
    this.player.setSpeed(speed);
  }

  resize(width: number, height: number): void {
    const resizablePlayer = this.player as unknown as { $set: (props: { width: number; height: number }) => void };
    resizablePlayer.$set({ width, height });
    this.player.triggerResize();
  }

  getDuration(): number {
    return this.player.getMetaData().totalTime ?? 0;
  }

  getIsPlaying(): boolean {
    return Boolean((this.player.getMetaData() as playerMetaData & { isPlaying?: boolean }).isPlaying);
  }

  onCurrentTime(handler: (time: number) => void): void {
    this.subscribe("ui-update-current-time", handler);
  }

  onPlayingChange(handler: (playing: boolean) => void): void {
    this.subscribe("ui-update-player-state", payload => handler(payload === "playing"));
  }

  onDuration(handler: (duration: number) => void): void {
    this.subscribe("ui-update-duration", handler);
  }

  destroy(): void {
    if (!this.active) return;
    this.active = false;
    this.pause();
    this.player.getReplayer().destroy();
    (this.player as unknown as { $destroy: () => void }).$destroy();
    this.target.replaceChildren();
  }

  private subscribe<T>(eventName: string, handler: (payload: T) => void): void {
    this.player.addEventListener(eventName, event => {
      if (!this.active || !isPayloadEvent<T>(event)) return;
      handler(event.payload);
    });
  }
}

function isPayloadEvent<T>(value: unknown): value is { payload: T } {
  return typeof value === "object" && value !== null && "payload" in value;
}

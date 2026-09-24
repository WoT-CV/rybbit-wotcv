"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

// Browser-only stores (auth, timezone) can settle before a streamed subtree
// hydrates. Keep its first render identical to the server, without an effect.
export function useHydrated() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

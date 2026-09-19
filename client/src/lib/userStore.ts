import { User } from "better-auth";
import { create } from "zustand";
import { authClient } from "./auth";

export const userStore = create<{
  user: User | null;
  isPending: boolean;
  setSession: (user: User) => void;
  setIsPending: (isPending: boolean) => void;
}>(set => ({
  user: null,
  isPending: true,
  setSession: user => set({ user }),
  setIsPending: isPending => set({ isPending }),
}));

// This store belongs to the browser. Importing it during a Next.js build or
// server render must not fetch a cookie-less session or mutate shared state.
if (typeof window !== "undefined") {
  void authClient
    .getSession()
    .then(({ data: session }) => {
      userStore.setState({ user: session?.user ?? null, isPending: false });
    })
    .catch(() => {
      // A network failure must not leave the authentication guard pending.
      userStore.setState({ user: null, isPending: false });
    });
}

import Link from "next/link";

const inlineLinkClassName =
  "font-medium text-emerald-700 dark:text-emerald-400 underline underline-offset-2 decoration-emerald-700/30 dark:decoration-emerald-400/30 hover:decoration-current transition-colors";

export function BuiltByRybbit() {
  return (
    <div className="mt-16 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/60 dark:bg-neutral-900/40 p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
          🐸
        </span>
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white mb-2">Built by Rybbit</h2>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            This free tool is made by the team behind{" "}
            <Link href="/" className={inlineLinkClassName}>
              Rybbit
            </Link>
            , the open-source, cookieless{" "}
            <Link href="/compare/google-analytics" className={inlineLinkClassName}>
              Google Analytics alternative
            </Link>
            . It tracks sessions, funnels, user journeys, and errors — with{" "}
            <Link href="/features/session-replay" className={inlineLinkClassName}>
              session replay
            </Link>{" "}
            included — and you can self-host it or use the cloud free tier.
          </p>
        </div>
      </div>
    </div>
  );
}

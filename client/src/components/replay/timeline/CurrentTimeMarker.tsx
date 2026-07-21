import type { VirtualItem } from "@tanstack/react-virtual";

interface CurrentTimeMarkerProps {
  label: string;
}

interface CurrentTimeMarkerRowProps extends CurrentTimeMarkerProps {
  virtualRow: VirtualItem;
  measure: (node: Element | null) => void;
}

export function CurrentTimeMarker({ label }: CurrentTimeMarkerProps) {
  return (
    <div className="pointer-events-none flex items-center gap-2 px-2 py-1.5 text-[10px]" aria-hidden="true">
      <MarkerContent label={label} />
    </div>
  );
}

export function CurrentTimeMarkerRow({ virtualRow, measure, label }: CurrentTimeMarkerRowProps) {
  return (
    <div
      data-index={virtualRow.index}
      ref={measure}
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center gap-2 px-2 py-1.5 text-[10px]"
      style={{ top: `${virtualRow.start}px` }}
      aria-hidden="true"
    >
      <MarkerContent label={label} />
    </div>
  );
}

function MarkerContent({ label }: CurrentTimeMarkerProps) {
  return (
    <>
      <span className="h-px flex-1 bg-amber-400/70 dark:bg-amber-300/70" />
      <span className="rounded-full border border-amber-400/70 bg-amber-500/10 px-2 py-0.5 font-medium tabular-nums text-amber-700 dark:border-amber-300/70 dark:bg-amber-400/10 dark:text-amber-300">
        {label}
      </span>
      <span className="h-px flex-1 bg-amber-400/70 dark:bg-amber-300/70" />
    </>
  );
}

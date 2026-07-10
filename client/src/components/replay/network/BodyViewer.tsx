import { Check, Copy } from "lucide-react";
import { useExtracted } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import { formatTransferSize } from "./networkEventUtils";
import type { CapturedBody } from "./types";

interface BodyViewerProps {
  body: CapturedBody | undefined;
}

export function BodyViewer({ body }: BodyViewerProps) {
  const t = useExtracted();
  const [copied, setCopied] = useState(false);
  const formattedValue = useMemo(() => formatBodyValue(body), [body]);
  const handleCopy = useCallback(async () => {
    if (!body?.value) return;

    try {
      await navigator.clipboard.writeText(body.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      return;
    }
  }, [body]);

  if (!body) {
    return <EmptyValue>{t("No body captured.")}</EmptyValue>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{body.kind}</span>
        {body.contentType && <span className="break-all">{body.contentType}</span>}
        {body.sizeBytes !== undefined && <span>{formatTransferSize(body.sizeBytes)}</span>}
        {body.truncated && <span className="text-yellow-600 dark:text-yellow-400">{t("Truncated")}</span>}
      </div>

      {body.reason && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2 text-[11px] text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">
          {body.reason}
        </div>
      )}

      {formattedValue === undefined ? (
        <EmptyValue>{t("Body content is unavailable.")}</EmptyValue>
      ) : (
        <div className="relative rounded-md border border-neutral-150 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/60">
          <Button
            type="button"
            size="smIcon"
            variant="ghost"
            className="absolute right-1 top-1 z-10 h-6 w-6"
            onClick={handleCopy}
            aria-label={t("Copy body")}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </Button>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all p-2 pr-8 font-mono text-[10px] leading-relaxed text-neutral-800 dark:text-neutral-200">
            {formattedValue}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatBodyValue(body: CapturedBody | undefined): string | undefined {
  if (!body?.value) return undefined;

  const contentType = body.contentType?.toLowerCase() ?? "";
  if (body.kind !== "json" && !contentType.includes("json")) return body.value;

  try {
    return JSON.stringify(JSON.parse(body.value), null, 2);
  } catch {
    return body.value;
  }
}

function EmptyValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-200 p-3 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      {children}
    </div>
  );
}

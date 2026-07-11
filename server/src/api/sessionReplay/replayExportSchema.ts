import { MAX_REPLAY_EXPORT_DURATION_MS } from "@rybbit/shared";
import { z } from "zod";

export const replayExportRangeSchema = z
  .object({
    startMs: z.number().finite().min(0),
    endMs: z.number().finite().positive(),
  })
  .strict()
  .refine(value => value.endMs > value.startMs, { message: "Export end must be after export start" })
  .refine(value => value.endMs - value.startMs <= MAX_REPLAY_EXPORT_DURATION_MS, {
    message: "Replay export range cannot exceed 2 minutes",
  });

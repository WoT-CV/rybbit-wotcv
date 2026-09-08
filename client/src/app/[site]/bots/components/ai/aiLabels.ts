import type { BotPurpose } from "../../../../../api/analytics/endpoints";
import type { useExtracted } from "next-intl";

/** Colors for the two halves of AI traffic, used by the chart and the legend. */
export const AI_AGENT_COLOR = "hsl(var(--dataviz))";
export const AI_CRAWLER_COLOR = "hsl(var(--amber-400))";

const PURPOSE_DESCRIPTIONS: Record<string, string> = {
  ai_training: "Collecting pages to train a model. Does not send readers back.",
  ai_search: "Indexing pages so an assistant can cite them. Can send readers back.",
  ai_agent: "Someone asked an assistant to open this page, just now.",
};

/**
 * Rows written before bot identity shipped carry an empty purpose. Saying so is
 * more honest than folding them into a real category.
 */
export function formatBotPurpose(value: string, t: ReturnType<typeof useExtracted>) {
  const labels: Record<string, string> = {
    ai_training: t("AI training crawler"),
    ai_search: t("AI answer engine"),
    ai_agent: t("AI agent"),
    search: t("Search engine"),
    social_preview: t("Link preview"),
    seo: t("SEO crawler"),
    monitoring: t("Monitoring"),
    security: t("Security scanner"),
    scripted: t("Scripted client"),
    headless: t("Headless browser"),
  };
  return labels[value] ?? (value || t("Unclassified"));
}

export function describeBotPurpose(value: string) {
  return PURPOSE_DESCRIPTIONS[value as BotPurpose];
}

export const AI_PURPOSE_ORDER: BotPurpose[] = ["ai_agent", "ai_search", "ai_training"];

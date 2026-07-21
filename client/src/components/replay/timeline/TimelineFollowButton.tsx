import { Clock } from "lucide-react";
import { useExtracted } from "next-intl";

import { Button } from "@/components/ui/button";

interface TimelineFollowButtonProps {
  enabled: boolean;
  onToggle: () => void;
}

export function TimelineFollowButton({ enabled, onToggle }: TimelineFollowButtonProps) {
  const t = useExtracted();

  return (
    <Button
      type="button"
      size="xs"
      variant={enabled ? "secondary" : "outline"}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <Clock aria-hidden="true" />
      {t("Follow time")}
    </Button>
  );
}

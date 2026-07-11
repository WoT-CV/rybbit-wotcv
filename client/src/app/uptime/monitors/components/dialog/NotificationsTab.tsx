import React from "react";
import { useExtracted } from "next-intl";

export function NotificationsTab() {
  const t = useExtracted();

  return <div className="text-neutral-500 text-sm">{t("Notification settings will be available in a future update.")}</div>;
}

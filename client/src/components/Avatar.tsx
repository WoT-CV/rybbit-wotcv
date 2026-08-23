"use client";

import { DateTime } from "luxon";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { useDateTimeFormat } from "../hooks/useDateTimeFormat";
import { getTimezone } from "../lib/store";
import { isSafeAvatarUrl } from "../lib/userIdentity";
import { FrogAvatar } from "./FrogAvatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export interface AvatarProps {
  id: string;
  size?: number;
  lastActiveTime?: DateTime;
  imageUrl?: string;
  alt?: string;
}

export function Avatar({ id, size = 20, lastActiveTime, imageUrl, alt }: AvatarProps) {
  const t = useExtracted();
  const { formatRelative } = useDateTimeFormat();
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const safeImageUrl = isSafeAvatarUrl(imageUrl) ? imageUrl : undefined;
  const showRemoteImage = safeImageUrl !== undefined && failedImageUrl !== safeImageUrl;
  const timeSinceEnd = lastActiveTime ? -lastActiveTime.setZone(getTimezone()).diffNow().toMillis() / 1000 : 0;
  const online = lastActiveTime ? timeSinceEnd < 300 : false;

  return (
    <div className="relative">
      {showRemoteImage ? (
        <img
          src={safeImageUrl}
          alt={alt || ""}
          className="rounded-full object-cover bg-neutral-200 dark:bg-neutral-800"
          style={{ width: size, height: size }}
          onError={() => setFailedImageUrl(safeImageUrl)}
        />
      ) : (
        <FrogAvatar id={id} size={size} />
      )}
      {online && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="absolute -bottom-1 -right-1 bg-green-500 rounded-full border border-2 border-white dark:border-neutral-900"
              style={{ width: size / 1.7, height: size / 1.7 }}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("Active {time}", { time: lastActiveTime ? formatRelative(lastActiveTime) : "" })}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

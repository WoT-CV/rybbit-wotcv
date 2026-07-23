"use client";

import { useEffect, useRef, useState } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ReplayPlayer } from "@/components/replay/player/ReplayPlayer";
import { ReplayBreadcrumbs } from "@/components/replay/ReplayBreadcrumbs";
import { useReplayStore } from "@/components/replay/replayStore";

interface ReplayDrawerProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preservePlaybackState?: boolean;
}

export function ReplayDrawer({ sessionId, open, onOpenChange, preservePlaybackState = false }: ReplayDrawerProps) {
  const { selectSession, resetPlayerState } = useReplayStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (open && sessionId && !preservePlaybackState) {
      selectSession(sessionId, true);
    }
  }, [open, preservePlaybackState, selectSession, sessionId]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (wasOpen && !open && !preservePlaybackState) {
      resetPlayerState();
    }
  }, [open, preservePlaybackState, resetPlayerState]);

  // Measure container dimensions using getBoundingClientRect for more reliable sizing
  useEffect(() => {
    if (!open) return;

    const measureDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    // Measure after a short delay to ensure drawer animation has completed
    const timeoutId = setTimeout(measureDimensions, 100);

    // Also set up resize observer for window resizes
    const resizeObserver = new ResizeObserver(() => {
      measureDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener("resize", measureDimensions);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureDimensions);
    };
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[90vh] overflow-hidden">
        <VisuallyHidden>
          <DrawerTitle>Session Replay</DrawerTitle>
        </VisuallyHidden>
        <div className="flex min-h-0 flex-1 gap-2 p-2">
          {/* Player */}
          <div ref={containerRef} className="relative min-h-0 flex-1">
            {dimensions.width > 0 && dimensions.height > 0 && (
              <ReplayPlayer width={dimensions.width} height={dimensions.height} isDrawer={true} />
            )}
          </div>

          {/* Timeline sidebar */}
          <div className="hidden h-full min-h-0 w-[clamp(360px,22vw,460px)] shrink-0 lg:block">
            <ReplayBreadcrumbs />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

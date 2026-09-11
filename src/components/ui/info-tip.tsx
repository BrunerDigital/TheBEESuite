"use client";

import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoTipProps = {
  children: ReactNode;
  label?: string;
  className?: string;
  contentClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

export function InfoTip({
  children,
  label = "More information",
  className,
  contentClassName,
  side = "bottom",
  align = "end",
}: InfoTipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        data-info-tip-trigger
        aria-label={label}
        className={cn(
          "inline-grid min-h-11 min-w-11 shrink-0 cursor-pointer touch-manipulation place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
          className,
        )}
      >
        <Info className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} align={align} sideOffset={6} collisionPadding={12} collisionAvoidance={{ side: "shift", align: "shift" }} className="z-50">
          <Popover.Popup data-slot="popover-content" data-info-tip-content className={cn(
            "max-h-(--available-height) w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border bg-popover p-3 text-left text-xs leading-5 text-popover-foreground shadow-md outline-none [overflow-wrap:anywhere]",
            contentClassName,
          )}>
            <div className="mb-1 flex items-start gap-2">
              <Popover.Title className="min-w-0 flex-1 font-medium text-foreground">{label}</Popover.Title>
              <Popover.Close aria-label="Close information" className="grid min-h-11 min-w-11 shrink-0 touch-manipulation place-items-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" aria-hidden="true" />
              </Popover.Close>
            </div>
            <div className="text-muted-foreground">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

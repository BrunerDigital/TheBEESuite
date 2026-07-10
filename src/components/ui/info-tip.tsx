import type { ReactNode } from "react";
import { Info } from "lucide-react";
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
  align = "end",
}: InfoTipProps) {
  return (
    <details className="group relative inline-flex">
      <summary
        aria-label={label}
        title={label}
        className={cn(
          "inline-grid size-6 cursor-pointer list-none place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden",
          className,
        )}
      >
        <Info className="size-3.5" />
      </summary>
      <div
        role="note"
        className={cn(
          "absolute top-[calc(100%+0.35rem)] z-50 w-72 rounded-lg border bg-popover p-3 text-left text-xs leading-5 text-popover-foreground shadow-2xl shadow-black/20 ring-1 ring-foreground/10",
          align === "start" ? "left-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "right-0",
          contentClassName,
        )}
      >
        <div className="mb-1 font-medium text-foreground">{label}</div>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </details>
  );
}

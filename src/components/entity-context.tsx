import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ContextBadgeProps = {
  label: string;
  value: ReactNode;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
};

export function initialsFromName(name: string | null | undefined) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "BS";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function ContextBadge({ label, value, variant = "outline", className }: ContextBadgeProps) {
  return (
    <Badge variant={variant} className={cn("h-auto min-h-6 max-w-full justify-start rounded-lg py-1", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </Badge>
  );
}

export function SummaryMetric({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-background/45 p-3", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate text-sm font-semibold">{value}</div>
      {detail ? <div className="mt-1 min-w-0 truncate text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function EntityHeader({
  eyebrow,
  title,
  subtitle,
  initials,
  status,
  children,
  actions,
  sticky = false,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  initials?: string;
  status?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card/90 p-4 shadow-sm backdrop-blur",
        sticky && "sticky top-20 z-[5]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          {initials ? (
            <div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</div>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">{title}</h2>
            {subtitle ? <div className="mt-1 min-w-0 text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {status}
          {actions}
        </div>
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

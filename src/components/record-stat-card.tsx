import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <Card size={compact ? "sm" : "default"} className={`border border-border bg-card shadow-none${compact ? " gap-1" : ""}`}>
      <CardHeader className="gap-1 pb-1 pt-1">
        <CardDescription className={compact ? "text-xs font-medium" : "text-sm font-medium"}>{label}</CardDescription>
        <CardTitle as="div" className="text-2xl font-semibold tabular-nums tracking-tight">{value}</CardTitle>
      </CardHeader>
      {detail ? (
        <CardContent className="pt-1">
          <p className="text-sm leading-5 text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

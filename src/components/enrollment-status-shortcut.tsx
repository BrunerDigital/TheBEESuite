import Link from "next/link";
import { ArrowRight, ClipboardList, Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { enrollmentStatusHref } from "@/lib/enrollment-status-navigation";
import { cn } from "@/lib/utils";

export function EnrollmentStatusShortcut({
  centerId,
  className,
}: {
  centerId?: string | null;
  className?: string;
}) {
  return (
    <Card
      id="enrollment-status-shortcut"
      className={cn(
        "border-border bg-card shadow-none",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg border bg-muted/40 text-primary">
            <ClipboardList className="size-6" aria-hidden="true" />
          </div>
          <div>
            <Badge variant="outline" className="mb-2">
              Frequently used school view
            </Badge>
            <h2 className="text-xl font-semibold tracking-tight">Enrollment Status Summary</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Open the current school roster grouped by classroom and age. Search the live view, then export CSV or PDF, or print the report for daily operations.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ClipboardList className="size-3.5" aria-hidden="true" />School-scoped roster</span>
              <span className="inline-flex items-center gap-1.5"><Download className="size-3.5" aria-hidden="true" />CSV and PDF</span>
              <span className="inline-flex items-center gap-1.5"><Printer className="size-3.5" aria-hidden="true" />Print-ready</span>
            </div>
          </div>
        </div>
        <Button className="w-full shrink-0 sm:w-auto" nativeButton={false} render={<Link href={enrollmentStatusHref(centerId)} />}>
          View enrollment status
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
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
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 text-primary">
            <ClipboardList className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Enrollment Status Summary</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Current roster by classroom and age, with CSV, PDF and print options.
            </p>

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

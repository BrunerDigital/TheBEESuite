import type { ReactNode } from "react";
import { BrandIcon } from "@/components/brand-logo";

export function PageState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-foreground sm:px-6">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <BrandIcon className="size-11 shrink-0 rounded-xl" priority />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">The BEE Suite</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
      </section>
    </main>
  );
}

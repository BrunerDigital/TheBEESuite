import { ArrowDown, Eye, PencilLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceSectionDestination = {
  href: string;
  label: string;
  description?: string;
};

type WorkspaceSectionDirectoryProps = {
  id: string;
  title?: string;
  description: string;
  reviewDestinations?: WorkspaceSectionDestination[];
  actionDestinations?: WorkspaceSectionDestination[];
  className?: string;
};

export function WorkspaceSectionDirectory({
  id,
  title = "Choose what you need",
  description,
  reviewDestinations = [],
  actionDestinations = [],
  className,
}: WorkspaceSectionDirectoryProps) {
  const titleId = `${id}-title`;

  return (
    <nav
      id={id}
      aria-labelledby={titleId}
      className={cn("scroll-mt-28 rounded-2xl border bg-card/70 p-4 shadow-sm sm:p-5", className)}
    >
      <div className="max-w-3xl">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        {reviewDestinations.length ? (
          <section aria-labelledby={`${id}-review-title`}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Eye className="size-4 text-primary" aria-hidden="true" />
              <h3 id={`${id}-review-title`}>Review information</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {reviewDestinations.map((destination) => (
                <a
                  key={destination.href}
                  href={destination.href}
                  className="group flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border bg-background/55 px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{destination.label}</span>
                    {destination.description ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{destination.description}</span> : null}
                  </span>
                  <ArrowDown className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {actionDestinations.length ? (
          <section aria-labelledby={`${id}-action-title`}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <PencilLine className="size-4 text-primary" aria-hidden="true" />
              <h3 id={`${id}-action-title`}>Add or update</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {actionDestinations.map((destination, index) => (
                <a
                  key={destination.href}
                  href={destination.href}
                  title={destination.description}
                  className={buttonVariants({ variant: index === 0 ? "default" : "outline", className: "min-h-11 w-full justify-between whitespace-normal text-left sm:w-auto" })}
                >
                  {destination.label}
                  <ArrowDown data-icon="inline-end" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </nav>
  );
}

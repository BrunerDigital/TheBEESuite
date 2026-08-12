import { BrandIcon } from "@/components/brand-logo";

export default function Loading() {
  return (
    <div className="bee-route-loader" role="status" aria-live="polite" aria-label="Loading The BEE Suite">
      <div className="bee-route-loader__content">
        <div className="bee-route-loader__flight" aria-hidden="true">
          <div className="bee-route-loader__orbit">
            <div className="bee-route-loader__bee">
              <BrandIcon className="size-12 rounded-xl sm:size-14" priority />
            </div>
          </div>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-primary">The BEE Suite</p>
          <p className="text-lg font-semibold tracking-tight sm:text-xl">Preparing your workspace</p>
          <p className="text-sm text-muted-foreground">Loading the next view…</p>
        </div>

        <div className="bee-route-loader__progress" aria-hidden="true">
          <span />
        </div>
      </div>
      <span className="sr-only">Loading your next BEE Suite screen.</span>
    </div>
  );
}

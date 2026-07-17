import { BrandIcon } from "@/components/brand-logo";

export default function Loading() {
  return (
    <div className="bee-route-loader" role="status" aria-live="polite" aria-label="Loading The BEE Suite">
      <div className="bee-route-loader__glow" aria-hidden="true" />
      <div className="bee-route-loader__content">
        <div className="bee-route-loader__flight" aria-hidden="true">
          <div className="bee-route-loader__orbit">
            <span className="bee-route-loader__trail bee-route-loader__trail--one" />
            <span className="bee-route-loader__trail bee-route-loader__trail--two" />
            <div className="bee-route-loader__bee">
              <BrandIcon className="size-16 rounded-[1.15rem] shadow-2xl shadow-amber-400/20 sm:size-20" priority />
            </div>
          </div>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">The BEE Suite</p>
          <p className="text-lg font-semibold tracking-tight text-white sm:text-xl">Preparing your workspace</p>
          <p className="text-sm text-zinc-400">Bringing your next view into focus…</p>
        </div>

        <div className="bee-route-loader__progress" aria-hidden="true">
          <span />
        </div>
      </div>
      <span className="sr-only">Loading your next BEE Suite screen.</span>
    </div>
  );
}

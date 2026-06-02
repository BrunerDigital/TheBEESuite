import Image from "next/image";
import Link from "next/link";
import { BEE_SUITE_BRANDING, type WorkspaceBranding } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";

const markSizes: Record<BrandSize, string> = {
  sm: "size-9 rounded-xl",
  md: "size-11 rounded-xl",
  lg: "size-14 rounded-2xl",
};

const kidCityLogoSizes: Record<BrandSize, string> = {
  sm: "h-10 max-w-[9.5rem]",
  md: "h-12 max-w-[12rem]",
  lg: "h-16 max-w-[16rem]",
};

export function BrandIcon({
  branding = BEE_SUITE_BRANDING,
  className,
  priority = false,
}: {
  branding?: WorkspaceBranding;
  className?: string;
  priority?: boolean;
}) {
  const isKidCity = branding.kind === "kid-city-usa";

  return (
    <span className={cn("relative block overflow-hidden bg-black/5", isKidCity ? "rounded-xl bg-white" : "rounded-xl", className)}>
      <Image
        src={branding.markSrc}
        alt={branding.logoAlt}
        width={branding.markWidth}
        height={branding.markHeight}
        className={cn("size-full object-contain", isKidCity && "p-1")}
        priority={priority}
      />
    </span>
  );
}

export function BrandLogo({
  branding = BEE_SUITE_BRANDING,
  href,
  compact = false,
  size = "md",
  className,
  imageClassName,
  textClassName,
  priority = false,
}: {
  branding?: WorkspaceBranding;
  href?: string;
  compact?: boolean;
  size?: BrandSize;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  priority?: boolean;
}) {
  const isKidCity = branding.kind === "kid-city-usa";
  const content = isKidCity ? (
    <span className="flex min-w-0 items-center">
      <Image
        src={branding.logoSrc}
        alt={branding.logoAlt}
        width={branding.logoWidth}
        height={branding.logoHeight}
        className={cn("w-auto object-contain", kidCityLogoSizes[size], imageClassName)}
        priority={priority}
      />
    </span>
  ) : (
    <>
      <BrandIcon branding={branding} className={cn(markSizes[size], imageClassName)} priority={priority} />
      <span className={cn("min-w-0", textClassName)}>
        <span className="block text-base font-semibold leading-none tracking-normal text-amber-300">
          {branding.name}
        </span>
        {!compact ? <span className="mt-1 block text-[0.68rem] text-zinc-400">{branding.tagline}</span> : null}
      </span>
    </>
  );

  const logo = (
    <span className={cn("flex min-w-0 items-center gap-3", className)} aria-label={branding.logoAlt}>
      {content}
    </span>
  );

  if (!href) return logo;

  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-3", className)} aria-label={`${branding.name} home`}>
      {content}
    </Link>
  );
}

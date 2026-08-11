"use client";

import Image from "next/image";
import {
  DEFAULT_PROFILE_PHOTO_URL,
  KID_CITY_PROFILE_PHOTO_URL,
  MISS_HONEYS_PROFILE_PHOTO_URL,
} from "@/lib/profile-photo";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  preferInitialsForDefault?: boolean;
};

const sizeClasses = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
};

const imageSizes = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const initialsClasses = {
  sm: "text-[0.65rem]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-xl",
};

const defaultProfilePhotoUrls = new Set([
  DEFAULT_PROFILE_PHOTO_URL,
  KID_CITY_PROFILE_PHOTO_URL,
  MISS_HONEYS_PROFILE_PHOTO_URL,
]);

function initialsForName(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "U";
}

export function UserAvatar({ name, src, size = "md", className, preferInitialsForDefault = false }: UserAvatarProps) {
  const imageSize = imageSizes[size];
  const showInitials = preferInitialsForDefault && (!src || defaultProfilePhotoUrls.has(src));

  return (
    <span
      aria-label={showInitials ? `${name || "User"} account` : undefined}
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full border bg-muted shadow-sm",
        sizeClasses[size],
        className,
      )}
    >
      {showInitials ? (
        <span
          aria-hidden="true"
          className={cn("grid size-full place-items-center bg-primary/15 font-semibold tracking-wide text-foreground", initialsClasses[size])}
        >
          {initialsForName(name)}
        </span>
      ) : (
        <Image
          src={src || DEFAULT_PROFILE_PHOTO_URL}
          alt={`${name || "User"} profile photo`}
          width={imageSize}
          height={imageSize}
          className="size-full object-cover"
          unoptimized
        />
      )}
    </span>
  );
}

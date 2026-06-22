"use client";

import Image from "next/image";
import { DEFAULT_PROFILE_PHOTO_URL } from "@/lib/profile-photo";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
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

export function UserAvatar({ name, src, size = "md", className }: UserAvatarProps) {
  const imageSize = imageSizes[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full border bg-muted shadow-sm",
        sizeClasses[size],
        className,
      )}
    >
      <Image
        src={src || DEFAULT_PROFILE_PHOTO_URL}
        alt={`${name || "User"} profile photo`}
        width={imageSize}
        height={imageSize}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}

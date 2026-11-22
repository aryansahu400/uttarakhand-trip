"use client";
import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

/** name → Google photo URL, for members who have signed in. */
const PhotosContext = createContext<Record<string, string>>({});
export const PhotosProvider = PhotosContext.Provider;
export const usePhoto = (name?: string | null) => {
  const photos = useContext(PhotosContext);
  return name ? photos[name] : undefined;
};

/** Round profile photo with the first letter as a fallback. */
export function Avatar({ name, src, size = 28, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const fromContext = usePhoto(name);
  const url = src ?? fromContext;
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-black/5", className)}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#0f2238] font-semibold text-white", className)}
      style={style}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** Photo + name, inline. */
export function PersonName({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Avatar name={name} size={size} />
      {name}
    </span>
  );
}

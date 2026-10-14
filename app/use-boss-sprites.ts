"use client";
import { useEffect, useState } from "react";
import { BOSS_STYLES } from "@/lib/challenge-icon.mjs";

export function useBossSprites(overrides: Record<string, string> = {}) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const entries = [...BOSS_STYLES.map(style => [style.id, overrides[style.id] || style.sprite] as const),
    ...Object.entries(overrides).filter(([id,src])=>src && !BOSS_STYLES.some(style=>style.id===id))];
  const paths = JSON.stringify(entries);
  useEffect(() => {
    let live = true;
    const entries = JSON.parse(paths) as [string,string][];
    for (const [id,src] of entries) {
      const image = new Image();
      image.onload = () => { if (live) setImages(current => ({ ...current, [id]: image })); };
      image.src = src;
    }
    return () => { live = false; };
  }, [paths]);
  return Object.fromEntries(entries.flatMap(([id,src]) => {
    const image = images[id];
    return image?.getAttribute("src") === src ? [[id, image]] : [];
  }));
}

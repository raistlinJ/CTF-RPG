"use client";
import { useEffect, useState } from "react";
import { BOSS_STYLES } from "@/lib/challenge-icon.mjs";

export function useBossSprites(overrides: Record<string, string> = {}) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const sources = BOSS_STYLES.map(style => overrides[style.id] || style.sprite);
  const paths = sources.join("|");
  useEffect(() => {
    let live = true;
    const sources = paths.split("|");
    for (const [index, style] of BOSS_STYLES.entries()) {
      const image = new Image();
      image.onload = () => {
        if (live) setImages(current => ({ ...current, [style.id]: image }));
      };
      image.src = sources[index];
    }
    return () => { live = false; };
  }, [paths]);
  return Object.fromEntries(BOSS_STYLES.flatMap((style, index) => {
    const image = images[style.id];
    return image?.getAttribute("src") === sources[index] ? [[style.id, image]] : [];
  }));
}

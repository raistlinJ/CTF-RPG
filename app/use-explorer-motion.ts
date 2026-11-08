"use client";

import { useLayoutEffect, useRef } from "react";
import { MOVE_INTERVAL } from "@/lib/player-movement.mjs";

/** Animate presentation only; collisions, interactions and presence keep integer tiles. */
export function useExplorerMotion(map: string, pos: { x: number; y: number }, immediate: boolean) {
  const { x, y } = pos;
  const surface = useRef<HTMLDivElement>(null);
  const motion = useRef({ map, target: pos, current: pos });
  useLayoutEffect(() => {
    const element = surface.current;
    if (!element) return;
    const target = { x, y };
    const previous = motion.current;
    const from = previous.current;
    const adjacent = previous.map === map &&
      Math.abs(previous.target.x - x) + Math.abs(previous.target.y - y) === 1;
    const animate = adjacent && !immediate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    motion.current = { map, target, current: from };
    function paint(point: { x: number; y: number }) {
      motion.current.current = point;
      element!.style.setProperty("--explorer-x", `${(point.x + 0.5) / 40 * 100}%`);
      element!.style.setProperty("--explorer-y", `${(point.y + 0.5) / 28 * 100}%`);
    }
    if (!animate) { paint(target); return; }
    const start = performance.now();
    let frame: number;
    function update(now: number) {
      const progress = Math.min(1, (now - start) / MOVE_INTERVAL);
      paint({ x: from.x + (x - from.x) * progress, y: from.y + (y - from.y) * progress });
      if (progress < 1) frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [map, x, y, immediate]);
  return surface;
}

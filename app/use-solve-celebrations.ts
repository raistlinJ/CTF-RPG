"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { advanceSolveCelebrations } from "@/lib/solve-celebrations.mjs";
export type SolveCelebration = { id: string; title: string; detail: string; tier: number; duration: number; boss: boolean; chainLength: number; milestone: number; expedition: boolean; map: string; x: number; y: number };
export type CelebrationProgress = { scope: string; expeditionComplete: boolean; completed: { id: string; object: string; map: string; x: number; y: number; boss: boolean; chainLength: number; chainComplete: boolean }[] };
type ProgressTracker = { scope: string; seen: string[]; highWater: number; expeditionCelebrated: boolean };

export function useSolveCelebrations(paused = false) {
  const tracker = useRef<ProgressTracker | null>(null);
  const [queue, setQueue] = useState<SolveCelebration[]>([]);
  const observe = useCallback((progress?: CelebrationProgress) => {
    if (!progress) return;
    const changedScope = tracker.current?.scope !== progress.scope;
    const { state, celebration } = advanceSolveCelebrations(tracker.current, progress) as { state: ProgressTracker; celebration: SolveCelebration | null };
    tracker.current = state;
    if (changedScope) setQueue([]);
    if (celebration) setQueue(previous => [...previous.slice(-4), celebration]);
  }, []);
  const dismiss = useCallback(() => setQueue(previous => previous.slice(1)), []);
  const reset = useCallback(() => { tracker.current = null; setQueue([]); }, []);
  const current = queue[0];
  useEffect(() => {
    if (paused || !current) return;
    const timer = setTimeout(dismiss, current.duration);
    return () => clearTimeout(timer);
  }, [paused, current, dismiss]);
  return { current: paused ? null : current || null, observe, dismiss, reset };
}

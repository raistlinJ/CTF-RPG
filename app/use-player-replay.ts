"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { blocked, transitionAt } from "@/lib/world-data.mjs";
import { challengeTiles } from "@/lib/challenge-icon.mjs";
import { samplePlayerReplay, updatePlayerReplays } from "@/lib/player-replay.mjs";
import type { NearbyPlayer } from "./use-player-presence";

type Replay = {
  target: { x: number; y: number };
  route: { x: number; y: number }[];
  length: number;
  startedAt: number;
  duration: number;
};
type ReplayChallenge = { map: string; icon?: string; iconSize?: number; location: { x: number; y: number } };

/** Presentation only: presence and player interactions retain the reported tiles. */
export function usePlayerReplay(map: string, players: NearbyPlayer[], challenges: ReplayChallenge[]) {
  const motion = useRef<{ map: string; replays: Map<string, Replay> }>({ map, replays: new Map() });
  const [display, setDisplay] = useState<{ map: string; points: Map<string, { x: number; y: number }> }>({ map, points: new Map() });
  const bossTiles = useMemo(() => new Set<string>(challenges
    .filter(challenge => challenge.map === map && challenge.icon === "boss")
    .flatMap(challenge => challengeTiles(challenge).map((tile: { x: number; y: number }) => `${tile.x},${tile.y}`))), [map, challenges]);

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const now = performance.now();
    const previous = motion.current.map === map ? motion.current.replays : new Map<string, Replay>();
    const replays: Map<string, Replay> = updatePlayerReplays(previous, players, now,
      (x: number, y: number) => !blocked(map, x, y) && !transitionAt(map, x, y) && !bossTiles.has(`${x},${y}`),
      reducedMotion.matches || document.hidden);
    motion.current = { map, replays };
    let frame: number;
    function paint(time: number) {
      const immediate = reducedMotion.matches || document.hidden;
      const points = new Map<string, { x: number; y: number }>();
      let moving = false;
      for (const [username, replay] of replays) {
        if (immediate) {
          replay.route = [replay.target];
          replay.length = 0;
        }
        points.set(username, samplePlayerReplay(replay, time).point);
        if (replay.length && time < replay.startedAt + replay.duration) moving = true;
      }
      setDisplay({ map, points });
      if (moving) frame = requestAnimationFrame(paint);
    }
    // Synchronize new arrivals and map changes before the browser paints.
    paint(now);
    return () => cancelAnimationFrame(frame);
  }, [map, players, bossTiles]);

  return players.map(player => ({ ...player, ...(display.map === map ? display.points.get(player.username) : undefined) }));
}

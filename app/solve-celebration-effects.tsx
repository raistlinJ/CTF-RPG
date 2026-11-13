"use client";
import type { CSSProperties } from "react";
import { Crown, Link2, Sparkles, Trophy, X } from "lucide-react";
import { celebrationLandmark } from "@/lib/solve-celebrations.mjs";
import { EMOJI_DELIVERY_COLORS } from "@/lib/player-emotes.mjs";
import type { SolveCelebration } from "./use-solve-celebrations";

export default function SolveCelebrationEffects({ celebration, onDismiss }: { celebration: SolveCelebration | null; onDismiss: () => void }) {
  if (!celebration) return null;
  const Icon = celebration.expedition ? Trophy : celebration.boss ? Crown : celebration.chainLength > 1 ? Link2 : Sparkles;
  const particles = [0, 12, 18, 28, 40, 54][celebration.tier];
  return <div key={celebration.id} className={`solve-celebration tier-${celebration.tier}`}>
    <div className="solve-celebration-confetti" aria-hidden="true">
      {Array.from({ length: particles }, (_, index) => <i key={index} style={{
        left: `${(index * 37 + 11) % 100}%`, background: EMOJI_DELIVERY_COLORS[index % EMOJI_DELIVERY_COLORS.length],
        "--confetti-delay": `${index % 7 * .07}s`, "--confetti-drift": `${(index * 47) % 240 - 120}px`,
        "--confetti-turn": `${180 + index * 29}deg`, "--confetti-duration": `${2.4 + celebration.tier * .35}s`,
      } as CSSProperties} />)}
    </div>
    <section className="solve-celebration-card" role="status" aria-live="polite" aria-atomic="true">
      <div className="solve-celebration-emblem" aria-hidden="true"><Icon /></div>
      <div><span className="solve-celebration-kicker">{celebration.expedition ? "THE GRAND FINALE" : celebration.boss ? "BOSS VICTORY" : celebration.chainLength >= 5 ? "LEGENDARY PROGRESS" : celebration.milestone ? "PROGRESS MILESTONE" : "VICTORY"}</span>
        <h2>{celebration.title}</h2><p>{celebration.detail}</p></div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss celebration"><X size={17} /></button>
    </section>
  </div>;
}

type CelebrationWorld = { startMap: string; buildings: { id: string; x: number; y: number; w: number; h: number }[]; maps: { id: string; spawn: { x: number; y: number } }[] };
export function MapSolveCelebration({ celebration, map, world }: { celebration: SolveCelebration | null; map: string; world: CelebrationWorld }) {
  if (!celebration) return null;
  const landmark = celebrationLandmark(world, map, celebration);
  return <div key={celebration.id} className={`map-celebration tier-${celebration.tier}`} aria-hidden="true">
    <div className="map-celebration-frame" />
    {celebration.tier >= 3 && <div className="map-celebration-landmark" style={{
      left: `${landmark.x / 40 * 100}%`, top: `${landmark.y / 28 * 100}%`,
      width: `${landmark.w / 40 * 100}%`, height: `${landmark.h / 28 * 100}%`,
    }}><span>✦</span></div>}
  </div>;
}

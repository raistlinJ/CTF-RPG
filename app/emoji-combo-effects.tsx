"use client";
import type { CSSProperties } from "react";
import type { NearbyPlayer } from "./use-player-presence";
import { EMOJI_DELIVERY_COLORS } from "@/lib/player-emotes.mjs";

export type EmojiComboEffect = { id: string; kind: "high-five" | "fireworks"; partner: string; expiresAt: number };
export const emojiComboLabel = (combo: EmojiComboEffect) => combo.kind === "high-five" ? `High five with ${combo.partner}!` : `Double wow with ${combo.partner}!`;
export function visibleEmojiCombos(combos: EmojiComboEffect[]) {
  const latest = new Map<string, EmojiComboEffect>();
  for (const combo of combos) latest.set(combo.partner, combo);
  return [...latest.values()].slice(-3);
}

export default function EmojiComboEffects({ combos, players, self }: { combos: EmojiComboEffect[]; players: NearbyPlayer[]; self?: NearbyPlayer }) {
  if (!self || !combos.length) return null;
  return <div className="emoji-combo-layer" aria-hidden="true">
    {visibleEmojiCombos(combos).map(combo => {
      const partner = players.find(player => player.username === combo.partner);
      const x = partner ? (self.x + partner.x) / 2 : self.x;
      const y = partner ? (self.y + partner.y) / 2 : self.y;
      return <div key={combo.id} className={`emoji-combo ${combo.kind}`} style={{ left: `${(x + .5) / 40 * 100}%`, top: `${(y + .5) / 28 * 100}%` }}>
        <div className="emoji-combo-stage">
          {combo.kind === "high-five" ? <>
            <span className="combo-hand left">👋</span><span className="combo-hand right">👋</span><span className="combo-impact">✨</span>
          </> : <>
            <span className="combo-wow">😮 😮</span>
            {Array.from({ length: 12 }, (_, index) => {
              const angle = index / 12 * Math.PI * 2;
              const radius = index % 2 ? 64 : 86;
              return <i className="combo-spark" key={index} style={{
                "--spark-x": `${Math.cos(angle) * radius}px`, "--spark-y": `${Math.sin(angle) * radius}px`,
                "--spark-delay": `${index % 3 * .08}s`, background: EMOJI_DELIVERY_COLORS[index % EMOJI_DELIVERY_COLORS.length],
              } as CSSProperties} />;
            })}
          </>}
        </div>
        <strong>{combo.kind === "high-five" ? "High five!" : "Double wow!"}</strong>
        <small>You + {combo.partner}</small>
      </div>;
    })}
  </div>;
}

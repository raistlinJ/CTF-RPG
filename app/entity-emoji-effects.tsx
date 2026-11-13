"use client";
import { useId, type CSSProperties } from "react";
import type { EntityEmojiInteraction, EntityEmojiReaction, EntitySummary } from "@/lib/non-player-entities";
import { EMOJI_DELIVERY_COLORS } from "@/lib/player-emotes.mjs";

export type ActiveEntityReaction = { id: string; entity: EntitySummary; reaction: EntityEmojiReaction; expiresAt: number };
export function EntityReactionAnimation({ effect }: { effect: EntityEmojiInteraction["effect"] }) {
  if (effect === "none") return null;
  const count = effect === "fireworks" ? 18 : effect === "hearts" ? 7 : 10;
  return <div className={`entity-reaction-animation ${effect}`} aria-hidden="true">
    {Array.from({length:count},(_,index) => {
      const angle = index / count * Math.PI * 2;
      return <span key={index} style={{ "--reaction-x":`${Math.cos(angle) * (effect === "fireworks" ? 72 : 45)}px`,
        "--reaction-y":`${effect === "hearts" ? -55 - index * 5 : Math.sin(angle) * 55}px`,
        "--reaction-delay":`${index % 5 * .12}s`, color:EMOJI_DELIVERY_COLORS[index % EMOJI_DELIVERY_COLORS.length],
      } as CSSProperties}>{effect === "hearts" ? "♥" : effect === "fireworks" ? "✦" : "✧"}</span>;
    })}
  </div>;
}

export default function EntityEmojiEffects({ active, map, pos }: { active:ActiveEntityReaction | null; map:string; pos:{x:number;y:number} }) {
  const arrow = useId();
  if (!active || active.entity.map !== map) return null;
  const {entity,reaction}=active, size=entity.size || 1;
  const x1=(pos.x+.5)*25,y1=(pos.y+.5)*25,x2=(entity.location.x+size/2)*25,y2=(entity.location.y+size/2)*25;
  const path=`M ${x1} ${y1} Q ${(x1+x2)/2} ${Math.min(y1,y2)-32} ${x2} ${y2}`;
  return <div key={active.id} className="entity-emoji-effects">
    <svg viewBox="0 0 1000 700" preserveAspectRatio="none" className="entity-emoji-delivery" aria-hidden="true">
      <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#a6e9ff" /></marker></defs>
      <path d={path} className="entity-emoji-path" markerEnd={`url(#${arrow})`} />
      <text className="entity-emoji-flight" textAnchor="middle" dominantBaseline="central">{reaction.emoji}<animateMotion path={path} dur="1.4s" repeatCount="indefinite" /></text>
    </svg>
    <div className="entity-reaction-anchor" aria-hidden="true" style={{left:`${(entity.location.x+size/2)/40*100}%`,top:`${entity.location.y/28*100}%`}}>
      <span className="entity-reaction-emoji">{reaction.emoji}</span><EntityReactionAnimation effect={reaction.effect} />
    </div>
    {reaction.matched ? <section className="entity-reaction-caption" role="status" aria-live="polite">
      <strong>{reaction.firstDiscovery ? "✦ Secret discovered!" : reaction.repeated ? "Already discovered" : entity.name}</strong>
      {reaction.firstDiscovery && <small>{entity.name}</small>}<p>{reaction.response}</p>
    </section> : <span className="sr-only" role="status">{reaction.emoji} sent to {entity.name}</span>}
  </div>;
}

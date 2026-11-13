"use client";
import { useId } from "react";
import { teamEmojiNotice, teamEmojiConnections, emojiDeliveryColors } from "@/lib/player-emotes.mjs";
import type { NearbyPlayer } from "./use-player-presence";

export type SentTeamEmoji = { id: string; emoji: string; toTeam: { id: string; label: string }; toUser?: string };
export type TeamEmojiEvent = SentTeamEmoji & {
  sender: string;
  fromTeam: { id: string; label: string } | null;
  outgoing: boolean;
  expiresAt: number;
};

export function TeamEmojiNotices({ events }: { events: TeamEmojiEvent[] }) {
  return <div className="team-emoji-notices" aria-live="polite" aria-atomic="false">
    {events.slice(-3).map(event => <p key={event.id} className={event.outgoing ? "outgoing" : "incoming"}>
      {teamEmojiNotice(event)}
    </p>)}
  </div>;
}

export function TeamEmojiLinks({ events, players, self }: { events: TeamEmojiEvent[]; players: NearbyPlayer[]; self?: NearbyPlayer }) {
  const markerId = useId();
  const deliveries = events.flatMap(event => teamEmojiConnections(event, players, self).map(({ from, to }: { from: NearbyPlayer; to: NearbyPlayer }) => ({ event, from, to, key: `${event.id}:${to.username}` })));
  const colors: string[] = emojiDeliveryColors(deliveries.map(delivery => delivery.key));
  const lanes = new Map<string, number>();
  if (!deliveries.length) return null;
  return <svg className="team-emoji-link-layer" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-label="Emoji deliveries">
    <defs>
      {colors.map((color, index) => <marker key={index} id={`${markerId}-${index}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill={color} /></marker>)}
    </defs>
    {deliveries.map(({ event, from, to, key }, index) => {
      const x1 = (from.x + 0.5) * 25, y1 = (from.y + 0.5) * 25;
      const x2 = (to.x + 0.5) * 25, y2 = (to.y + 0.5) * 25;
      const dx = x2 - x1, dy = y2 - y1, length = Math.hypot(dx, dy);
      const route = `${from.username}:${to.username}`;
      const lane = lanes.get(route) || 0;
      lanes.set(route, lane + 1);
      const bend = 32 + lane * 22;
      const cx = (x1 + x2) / 2 + (length ? dy / length * bend : 0);
      const cy = (y1 + y2) / 2 - (length ? dx / length * bend : 44);
      // A small loop keeps deliveries visible when two players share a tile.
      const path = length ? `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}` : `M ${x1} ${y1} C ${x1 - 40} ${y1 - 55} ${x1 + 40} ${y1 - 55} ${x2} ${y2}`;
      const direction = event.outgoing ? "outgoing" : "incoming";
      const label = `${from.username} sent ${event.emoji} to ${to.username}`;
      return <g key={key} className={`team-emoji-link ${direction}`} style={{ color: colors[index] }} role="img" aria-label={label}>
        <title>{label}</title>
        <path className="team-emoji-link-shadow" d={path} />
        <path className="team-emoji-link-line" d={path} markerEnd={`url(#${markerId}-${index})`} />
        <text className="team-emoji-flight" textAnchor="middle" dominantBaseline="central" aria-hidden="true">{event.emoji}<animateMotion path={path} dur="1.5s" repeatCount="indefinite" /></text>
        <text className="team-emoji-still" x={length ? (x1 + 2 * cx + x2) / 4 : x1} y={length ? (y1 + 2 * cy + y2) / 4 : y1 - 41} textAnchor="middle" dominantBaseline="central" aria-hidden="true">{event.emoji}</text>
      </g>;
    })}
  </svg>;
}

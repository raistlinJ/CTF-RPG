"use client";
import { teamEmojiNotice, teamEmojiTargets } from "@/lib/player-emotes.mjs";
import type { NearbyPlayer } from "./use-player-presence";

export type SentTeamEmoji = { id: string; emoji: string; toTeam: { id: string; label: string } };
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

export function TeamEmojiGlows({ events, players }: { events: TeamEmojiEvent[]; players: NearbyPlayer[] }) {
  return <div className="team-emoji-glow-layer">
    {players.map(player => {
      const event = events.find(event => teamEmojiTargets(event, player));
      return event ? <div key={player.username}
        className={`team-emoji-glow ${event.outgoing ? "recipient" : "sender"}`}
        role="img" aria-label={`${event.outgoing ? "Emoji recipient" : "Emoji sender"}: ${player.username}`}
        style={{ left: `${((player.x + 0.5) / 40) * 100}%`, top: `${((player.y + 0.5) / 28) * 100}%` }} /> : null;
    })}
  </div>;
}

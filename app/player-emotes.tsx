"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { PLAYER_EMOTES } from "@/lib/player-emotes.mjs";

export type PlayerEmote = { emoji: string; expiresAt: number };

export function PlayerEmotePicker({ onSelect, description = "Show an emoji above your player for 5 seconds", selected, disabled = false }: {
  onSelect: (emoji: string) => void;
  description?: string;
  selected?: string;
  disabled?: boolean;
}) {
  return (
    <div className="player-emote-picker" role="group" aria-label="Choose an emoji reaction">
      <p>{description}</p>
      <div>
        {PLAYER_EMOTES.map(({ emoji, label }) => (
          <button key={emoji} type="button" aria-label={label} title={label} disabled={disabled} aria-pressed={selected ? selected === emoji : undefined} onClick={() => onSelect(emoji)}>
            <span aria-hidden="true">{emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlayerEmoteBubble({ emote, username, style }: {
  emote: PlayerEmote;
  username: string;
  style: CSSProperties;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, emote.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [emote.expiresAt]);
  if (expired) return null;
  const label = PLAYER_EMOTES.find(option => option.emoji === emote.emoji)?.label;
  if (!label) return null;
  return (
    <div className="player-emote-bubble" role="status" aria-label={`${username}: ${label}`} style={style}>
      <span aria-hidden="true">{emote.emoji}</span>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { isPlayerEmote } from "@/lib/player-emotes.mjs";
import { PlayerEmotePicker } from "./player-emotes";
import type { SentTeamEmoji } from "./team-emoji-effects";

export default function TeamEmojiPicker({ team, username, onSent }: {
  team: { id: string; label: string };
  username: string;
  onSent: (event: SentTeamEmoji) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState<"user" | "team">("user");
  const pending = useRef<{ id: string; team: string; text: string; recipient?: string } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);

  async function send(emoji: string) {
    if (active.current || !isPlayerEmote(emoji)) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const toUser = recipient === "user" ? username : undefined;
      if (pending.current?.text !== emoji || pending.current?.team !== team.id || pending.current?.recipient !== toUser)
        pending.current = { id: clientUuid(), team: team.id, text: emoji, ...(toUser ? { recipient: toUser } : {}) };
      const message = pending.current;
      const response = await fetch("/api/team-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "Could not send emoji.");
      pending.current = null;
      onSent({ id: message.id, emoji, toTeam: team, ...(toUser ? { toUser } : {}) });
    } catch (cause) {
      setError(controller.signal.aborted
        ? "Sending timed out. Tap the same emoji to retry safely."
        : (cause as Error).message);
    } finally {
      clearTimeout(timeout);
      active.current = null;
      setBusy(false);
    }
  }

  return <div className="player-team-emojis">
    <div className="emoji-recipient-toggle" role="group" aria-label="Emoji recipient">
      <span>To</span>
      <button type="button" aria-pressed={recipient === "user"} disabled={busy} onClick={() => { setRecipient("user"); setError(""); }}>User</button>
      <button type="button" aria-pressed={recipient === "team"} disabled={busy} onClick={() => { setRecipient("team"); setError(""); }}>Team</button>
    </div>
    <PlayerEmotePicker description={`Send an emoji to ${recipient === "user" ? username : team.label}`} disabled={busy} onSelect={emoji => void send(emoji)} />
    <small className="emoji-combo-hint">Wave back for a high-five · Match 😮 for fireworks</small>
    {busy && <p role="status">Sending…</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

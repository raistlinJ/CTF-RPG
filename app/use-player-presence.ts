"use client";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import type { TeamFeatures } from "./team-panel";
import { useEffect, useRef, useState } from "react";
import { emptyMessageInbox, receiveMessages, readMessages } from "@/lib/message-inbox.mjs";
import { EMOTE_DURATION_MS, isPlayerEmote } from "@/lib/player-emotes.mjs";
import type { PlayerEmote } from "./player-emotes";
import type { SentTeamEmoji, TeamEmojiEvent } from "./team-emoji-effects";
export type ChallengeSolve = { id: string; map: string; x: number; y: number; count: number };
export type SolveShine = ChallengeSolve & { key: string };
export type NearbyPlayer = {
  username: string;
  hero: string;
  role: "admin" | "student";
  x: number;
  y: number;
  teammate: boolean;
  team: string | null;
  crowned: boolean;
  emote?: PlayerEmote;
};
export function usePlayerPresence(
  username: string | undefined,
  enabled: boolean,
  map: string,
  pos: { x: number; y: number },
  themeRevision: number | undefined,
  readMessagesAt = 0,
) {
  const [selfEmote, setSelfEmote] = useState<(PlayerEmote & { username: string }) | undefined>();
  const pendingEmote = useRef<PlayerEmote | null>(null);
  const refreshPresence = useRef<(() => void) | null>(null);
  useEffect(() => { refreshPresence.current?.(); }, [map]);
  const seenTeamEmojis = useRef(new Map<string, number>());
  const [teamEmojiState, setTeamEmojiState] = useState<{ username?: string; events: TeamEmojiEvent[] }>({ events: [] });
  function sentTeamEmoji(event: SentTeamEmoji) {
    if (!username || !enabled || !isPlayerEmote(event.emoji)) return;
    const now = Date.now();
    seenTeamEmojis.current.set(event.id, now + EMOTE_DURATION_MS * 2);
    const outgoing = { ...event, sender: username, fromTeam: null, outgoing: true, expiresAt: now + EMOTE_DURATION_MS };
    setTeamEmojiState(previous => ({ username, events: [...(previous.username === username ? previous.events.filter(old => old.id !== event.id) : []), outgoing] }));
    refreshPresence.current?.();
  }
  useEffect(() => {
    if (!teamEmojiState.events.length) return;
    const nextExpiry = Math.min(...teamEmojiState.events.map(event => event.expiresAt));
    const timer = setTimeout(() => setTeamEmojiState(previous => ({ ...previous, events: previous.events.filter(event => event.expiresAt > Date.now()) })), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [teamEmojiState]);
  function sendEmote(emoji: string) {
    if (!username || !enabled || themeRevision === undefined || !isPlayerEmote(emoji)) return;
    const emote = { emoji, expiresAt: Date.now() + EMOTE_DURATION_MS };
    pendingEmote.current = emote;
    setSelfEmote({ ...emote, username });
    refreshPresence.current?.();
  }
  useEffect(() => {
    if (!selfEmote) return;
    const timer = setTimeout(() => setSelfEmote(undefined), Math.max(0, selfEmote.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [selfEmote]);
  const [notifications, setNotifications] = useState<{unread:number;latestAt:number;historyVersion?:string}|null>(null);
  const [gameRevision, setGameRevision] = useState<string>();
  const [challengeSolves, setChallengeSolves] = useState<ChallengeSolve[]>([]);
  const [solveShines, setSolveShines] = useState<SolveShine[]>([]);
  const [inbox, setInbox] = useState(emptyMessageInbox);
  const [scoreboard, setScoreboard] = useState<{
    visibility: "admins" | "all";
    mode: string;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{
      map: string;
      players: NearbyPlayer[];
    }>({ map, players: [] }),
    [self, setSelf] = useState({ teammate: false, crowned: false }),
    [visibility, setVisibility] = useState("team"),
    [features, setFeatures] = useState<TeamFeatures>({
      names: true,
      scores: true,
      messaging: true,
      everyone: { names: true, scores: true, messaging: true },
      revision: 0,
    }),
    [latestMessageAt, setLatestMessageAt] = useState(0),
    [status, setStatus] = useState("");
  const current = useRef({ map, pos, themeRevision, readMessagesAt });
  current.current = { map, pos, themeRevision, readMessagesAt };
  useEffect(() => { setInbox(state => readMessages(state, readMessagesAt)); }, [readMessagesAt]);
  useEffect(() => {
    pendingEmote.current = null;
    seenTeamEmojis.current.clear();
    setSnapshot({ map: current.current.map, players: [] });
    setStatus("");
    setSelf({ teammate: false, crowned: false });
    setInbox(emptyMessageInbox());
    setLatestMessageAt(0);
    setNotifications(null);
    if (!username || !enabled || themeRevision === undefined) return;
    let previousSolves: Map<string, number> | undefined;
    let shineTimer: ReturnType<typeof setTimeout> | undefined;
    setSolveShines([]);
    setChallengeSolves([]);
    let live = true;
    function leave() {
      void fetch("/api/presence", { method: "DELETE", keepalive: true }).catch(
        () => {},
      );
    }
    async function update(signal: AbortSignal) {
      const sent = current.current;
      const emote = pendingEmote.current;
      const r = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map: sent.map,
          x: sent.pos.x,
          y: sent.pos.y,
          themeRevision: sent.themeRevision,
          ...(emote && emote.expiresAt > Date.now() ? { emote: emote.emoji } : {}),
        }),
        signal,
      });
      const d = (await r.json()) as {
        themeRevision?: number;
        gameRevision: string;
        challengeSolves: ChallengeSolve[];
        players: (Omit<NearbyPlayer, "emote"> & { emote?: { emoji: string; remainingMs: number } })[];
        teamEmojis?: (Omit<TeamEmojiEvent, "expiresAt"> & { remainingMs: number })[];
        visibility: string;
        truncated: boolean;
        teamFeatures: TeamFeatures;
        latestMessageAt: number;
        receivedCount: number;
        notifications: {unread:number;latestAt:number;historyVersion?:string};
        scoreboard: { visibility: "admins" | "all"; mode: string };
        self: { teammate: boolean; crowned: boolean };
      };
      if (r.status === 409 && d.themeRevision !== undefined && d.themeRevision !== sent.themeRevision) { window.location.reload(); return; }
      if (!r.ok) throw Error();
      if (pendingEmote.current === emote) pendingEmote.current = null;
      if (live && !signal.aborted && !document.hidden && current.current.map === sent.map) {
        const counts = d.challengeSolves || [];
        setChallengeSolves(counts);
        setGameRevision(d.gameRevision);
        const fresh = counts.filter((c) => previousSolves && previousSolves.has(c.id) && c.count > previousSolves.get(c.id)! && c.map === sent.map);
        previousSolves = new Map(counts.map((c) => [c.id, c.count]));
        if (fresh.length) {
          setSolveShines((old) => [...old, ...fresh.map((c) => ({ ...c, key: `${c.id}:${c.count}` }))]);
          clearTimeout(shineTimer);
          shineTimer = setTimeout(() => { if (live) setSolveShines([]); }, 3000);
        }
        const receivedAt = Date.now();
        for (const [id, expiry] of seenTeamEmojis.current) {
          if (expiry <= receivedAt) seenTeamEmojis.current.delete(id);
        }
        const freshEmojis = (d.teamEmojis || []).filter(event => isPlayerEmote(event.emoji) && event.remainingMs > 0 && !seenTeamEmojis.current.has(event.id)).map(event => {
          seenTeamEmojis.current.set(event.id, receivedAt + EMOTE_DURATION_MS * 2);
          return { ...event, expiresAt: receivedAt + EMOTE_DURATION_MS };
        });
        if (freshEmojis.length) setTeamEmojiState(previous => ({ username, events: [...(previous.username === username ? previous.events : []), ...freshEmojis] }));
        setSnapshot({ map: sent.map, players: d.players.map(player => ({
          ...player,
          emote: player.emote ? { emoji: player.emote.emoji, expiresAt: receivedAt + Math.min(EMOTE_DURATION_MS, player.emote.remainingMs) } : undefined,
        })) });
        setVisibility(d.visibility);
        setSelf(d.self);
        setFeatures(d.teamFeatures);
        setLatestMessageAt(d.latestMessageAt);
        setNotifications(d.notifications);
        setScoreboard(d.scoreboard);
        setInbox(state => receiveMessages(state, d, current.current.readMessagesAt));
        setStatus(
          d.truncated ? "Showing the 100 most recently active players." : "",
        );
      }
    }
    const poller = startPolling(update, {
      interval: 3000,
      onHidden: leave,
      onError: () => {
        if (live && !document.hidden) {
          setSnapshot({ map: current.current.map, players: [] });
          setSelf(previous => ({ ...previous, crowned: false }));
          setStatus("Player visibility is reconnecting…");
        }
      },
    });
    refreshPresence.current = poller.refresh;
    window.addEventListener("pagehide", leave);
    return () => {
      live = false;
      refreshPresence.current = null;
      poller.stop();
      clearTimeout(shineTimer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [username, enabled, themeRevision]);
  return {
    teamEmojis: enabled && teamEmojiState.username === username ? teamEmojiState.events : [],
    sentTeamEmoji,
    selfEmote: enabled && selfEmote?.username === username ? selfEmote : undefined,
    sendEmote,
    polling: !!username && enabled && themeRevision !== undefined,
    notifications,
    players: snapshot.map === map ? snapshot.players : [],
    visibility,
    self,
    features,
    latestMessageAt,
    messageCount: inbox.latestMessageAt <= readMessagesAt ? 0 : inbox.unreadCount,
    challengeSolves,
    gameRevision,
    solveShines: solveShines.filter((c) => c.map === map),
    scoreboard,
    status,
  };
}

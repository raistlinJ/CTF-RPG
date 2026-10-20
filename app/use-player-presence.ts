"use client";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import type { TeamFeatures } from "./team-panel";
import { useEffect, useRef, useState } from "react";
import { emptyMessageInbox, receiveMessages, readMessages } from "@/lib/message-inbox.mjs";
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
};
export function usePlayerPresence(
  username: string | undefined,
  enabled: boolean,
  map: string,
  pos: { x: number; y: number },
  themeRevision: number | undefined,
  readMessagesAt = 0,
) {
  const [notifications, setNotifications] = useState<{unread:number;latestAt:number}|null>(null);
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
      const r = await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map: sent.map,
          x: sent.pos.x,
          y: sent.pos.y,
          themeRevision: sent.themeRevision,
        }),
        signal,
      });
      const d = (await r.json()) as {
        themeRevision?: number;
        gameRevision: string;
        challengeSolves: ChallengeSolve[];
        players: NearbyPlayer[];
        visibility: string;
        truncated: boolean;
        teamFeatures: TeamFeatures;
        latestMessageAt: number;
        receivedCount: number;
        notifications: {unread:number;latestAt:number};
        scoreboard: { visibility: "admins" | "all"; mode: string };
        self: { teammate: boolean; crowned: boolean };
      };
      if (r.status === 409 && d.themeRevision !== undefined && d.themeRevision !== sent.themeRevision) { window.location.reload(); return; }
      if (!r.ok) throw Error();
      if (live && !signal.aborted && !document.hidden && current.current.map === sent.map) {
        const counts = d.challengeSolves || [];
        setChallengeSolves(counts);
        setGameRevision(d.gameRevision);
        const fresh = counts.filter((c) => previousSolves && previousSolves.has(c.id) && c.count > previousSolves.get(c.id)! && c.map === sent.map);
        previousSolves = new Map(counts.map((c) => [c.id, c.count]));
        if (fresh.length) {
          setSolveShines((old) => [...old, ...fresh.map((c) => ({ ...c, key: `${c.id}:${c.count}` }))]);
          clearTimeout(shineTimer);
          shineTimer = setTimeout(() => { if (live) setSolveShines([]); }, 2400);
        }
        setSnapshot({ map: sent.map, players: d.players });
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
    window.addEventListener("pagehide", leave);
    return () => {
      live = false;
      poller.stop();
      clearTimeout(shineTimer);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [username, enabled, themeRevision]);
  return {
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

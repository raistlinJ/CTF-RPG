"use client";
import type { TeamFeatures } from "./team-panel";
import { useEffect, useRef, useState } from "react";
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
) {
  const [challengeSolves, setChallengeSolves] = useState<ChallengeSolve[]>([]);
  const [solveShines, setSolveShines] = useState<SolveShine[]>([]);
  const [messageCount, setMessageCount] = useState(0);
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
  const current = useRef({ map, pos, themeRevision });
  current.current = { map, pos, themeRevision };
  useEffect(() => {
    setSnapshot({ map: current.current.map, players: [] });
    setStatus("");
    setSelf({ teammate: false, crowned: false });
    if (!username || !enabled || themeRevision === undefined) return;
    let previousSolves: Map<string, number> | undefined;
    let shineTimer: ReturnType<typeof setTimeout> | undefined;
    setSolveShines([]);
    setChallengeSolves([]);
    let previousCount: number | undefined;
    let badgeTimer: ReturnType<typeof setTimeout> | undefined;
    setMessageCount(0);
    let live = true,
      timer: ReturnType<typeof setInterval> | undefined,
      inFlight = false,
      controller: AbortController | undefined;
    function leave() {
      void fetch("/api/presence", { method: "DELETE", keepalive: true }).catch(
        () => {},
      );
    }
    async function update() {
      if (!live || document.hidden || inFlight) return;
      inFlight = true;
      const sent = current.current;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const r = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            map: sent.map,
            x: sent.pos.x,
            y: sent.pos.y,
            themeRevision: sent.themeRevision,
          }),
          signal: controller.signal,
        });
        const d = (await r.json()) as {
          challengeSolves: ChallengeSolve[];
          players: NearbyPlayer[];
          visibility: string;
          truncated: boolean;
          teamFeatures: TeamFeatures;
          latestMessageAt: number;
          receivedCount: number;
          scoreboard: { visibility: "admins" | "all"; mode: string };
          self: { teammate: boolean; crowned: boolean };
        };
        if (!r.ok) throw Error();
        if (live && !document.hidden && current.current.map === sent.map) {
          const counts = d.challengeSolves || [];
          setChallengeSolves(counts);
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
          setScoreboard(d.scoreboard);
          if (previousCount !== undefined && d.receivedCount > previousCount) {
            const incoming = d.receivedCount - previousCount;
            setMessageCount((n) => n + incoming);
            clearTimeout(badgeTimer);
            badgeTimer = setTimeout(() => {
              if (live) setMessageCount(0);
            }, 5000);
          }
          previousCount = d.receivedCount;
          setStatus(
            d.truncated ? "Showing the 100 most recently active players." : "",
          );
        }
      } catch {
        if (live && !document.hidden) {
          setSnapshot({ map: current.current.map, players: [] });
          setSelf((previous) => ({ ...previous, crowned: false }));
          setStatus("Player visibility is reconnecting…");
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    }
    function visibilityChanged() {
      controller?.abort();
      setSnapshot({ map: current.current.map, players: [] });
      if (document.hidden) leave();
      else void update();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", leave);
    timer = setInterval(update, 3000);
    void update();
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(badgeTimer);
      clearTimeout(shineTimer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [username, enabled, themeRevision]);
  return {
    players: snapshot.map === map ? snapshot.players : [],
    visibility,
    self,
    features,
    latestMessageAt,
    messageCount,
    challengeSolves,
    solveShines: solveShines.filter((c) => c.map === map),
    scoreboard,
    status,
  };
}

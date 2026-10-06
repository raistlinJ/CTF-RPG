"use client";
import type { TeamFeatures } from "./team-panel";
import { useEffect, useRef, useState } from "react";
export type NearbyPlayer = {
  username: string;
  hero: string;
  x: number;
  y: number;
  teammate: boolean;
  team: string | null;
};
export function usePlayerPresence(
  username: string | undefined,
  enabled: boolean,
  map: string,
  pos: { x: number; y: number },
  themeRevision: number | undefined,
) {
  const [snapshot, setSnapshot] = useState<{
      map: string;
      players: NearbyPlayer[];
    }>({ map, players: [] }),
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
    if (!username || !enabled || themeRevision === undefined) return;
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
          players: NearbyPlayer[];
          visibility: string;
          truncated: boolean;
          teamFeatures: TeamFeatures;
          latestMessageAt: number;
        };
        if (!r.ok) throw Error();
        if (live && !document.hidden && current.current.map === sent.map) {
          setSnapshot({ map: sent.map, players: d.players });
          setVisibility(d.visibility);
          setFeatures(d.teamFeatures);
          setLatestMessageAt(d.latestMessageAt);
          setStatus(
            d.truncated ? "Showing the 100 most recently active players." : "",
          );
        }
      } catch {
        if (live && !document.hidden) {
          setSnapshot({ map: current.current.map, players: [] });
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
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [username, enabled, themeRevision]);
  return {
    players: snapshot.map === map ? snapshot.players : [],
    visibility,
    features,
    latestMessageAt,
    status,
  };
}

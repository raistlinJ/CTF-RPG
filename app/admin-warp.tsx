"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Destination = { map: string; pos: { x: number; y: number } };
type MapRoster = {
  themeRevision: number;
  visibility: string;
  maps: { id: string; name: string; playerCount: number | null; players: { username: string; role: string; team: { id: string; name: string } | null }[] }[];
};

export default function AdminWarp({ currentMap, username, themeRevision, onWarp }: {
  currentMap: string;
  username: string;
  themeRevision: number;
  onWarp: (destination: Destination) => void;
}) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<MapRoster | null>(null);
  const [loadError, setLoadError] = useState("");
  const [warpError, setWarpError] = useState("");
  const [warping, setWarping] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const poller = startPolling(async (signal: AbortSignal) => {
      try {
        const response = await fetch("/api/admin/warp", { signal });
        const data = await response.json() as MapRoster & { error?: string };
        if (!response.ok) throw Error(data.error || "Could not load map players.");
        if (live && !signal.aborted) { setRoster(data); setLoadError(""); }
      } catch (error) {
        if (live && !signal.aborted) setLoadError((error as Error).message);
        throw error;
      }
    }, { interval: 3000 });
    poller.refresh();
    return () => { live = false; poller.stop(); request.current?.abort(); };
  }, [open]);
  async function warp(map: string) {
    if (request.current || !roster || roster.themeRevision !== themeRevision) return;
    const controller = new AbortController();
    request.current = controller;
    setWarping(map);
    setWarpError("");
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/admin/warp", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ map, themeRevision: roster.themeRevision }),
      });
      const data = await response.json() as Destination & { error?: string };
      if (!response.ok) throw Error(data.error || "Could not warp to this map.");
      if (!controller.signal.aborted) { onWarp(data); setOpen(false); }
    } catch (error) {
      setWarpError(controller.signal.aborted ? "Warp timed out. Please try again." : (error as Error).message);
    } finally { clearTimeout(timer); request.current = null; setWarping(null); }
  }
  const stale = !!roster && roster.themeRevision !== themeRevision;
  return <>
    <button type="button" className="secondary-button admin-warp-button" aria-haspopup="dialog" onClick={() => { setRoster(null); setLoadError(""); setWarpError(""); setOpen(true); }}>
      <Sparkles size={16} aria-hidden="true" /> Warp
    </button>
    <Dialog open={open} onOpenChange={value => { if (!warping) setOpen(value); }}>
      <DialogContent className="admin-warp-dialog">
        <DialogTitle>Warp to a map</DialogTitle>
        <DialogDescription>Choose any map to teleport to its spawn point. Expand the player count to see usernames and teams. Counts refresh every 3 seconds.</DialogDescription>
        {(loadError || warpError) && <p className="error" role="alert">{warpError || loadError}</p>}
        {stale && <p role="alert">The maps changed. <button type="button" className="text-button" onClick={() => window.location.reload()}>Reload the game</button> before warping.</p>}
        {roster?.visibility === "off" && <p className="admin-warp-note">Player visibility is off. Live player counts are unavailable; you can still warp.</p>}
        {!roster && !loadError && <p role="status">Loading maps and players…</p>}
        <div className="admin-warp-maps">
          {roster?.maps.map(map => <section className="admin-warp-map" key={map.id}>
            <div className="admin-warp-map-heading">
              <h3>{map.name}{map.id === currentMap && <small>Current map</small>}</h3>
              <button type="button" className="secondary-button" disabled={!!warping || stale} aria-label={`Warp to ${map.name}`} onClick={() => void warp(map.id)}>{warping === map.id ? "Warping…" : "Warp here"}</button>
            </div>
            {map.playerCount === null ? <p className="admin-warp-note">Player count unavailable</p> : <details>
              <summary>{map.playerCount} {map.playerCount === 1 ? "player" : "players"}</summary>
              {map.players.length ? <ul>{map.players.map(player => <li key={player.username}>
                <strong>@{player.username}{player.username === username ? " (you)" : ""}</strong>
                <span>{player.team?.name || (player.role === "admin" ? "Administrator" : "No team")}{player.team && player.role === "admin" ? " · Admin" : ""}</span>
              </li>)}</ul> : <p className="admin-warp-note">No active players on this map.</p>}
            </details>}
          </section>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

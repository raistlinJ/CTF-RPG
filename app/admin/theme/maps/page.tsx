"use client";
import { useCallback, useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import MapSettings from "../../map-settings";
import ThemeNav from "../theme-nav";
import { activeWorld, configureWorld } from "@/lib/world-data.mjs";
import type { EntityCharacter, NonPlayerEntity } from "@/lib/non-player-entities";

type State = {
  theme: { world: typeof activeWorld & { entities?: NonPlayerEntity[] }; characters: EntityCharacter[] };
  challenges: { id: string; object: string; map: string; location: { x: number; y: number } }[];
  themeRevision: number;
  revision: number;
};
export default function MapsAdmin() {
  const [state, setState] = useState<State | null>(null);
  const [mapId, setMapId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/challenges");
    const data = await r.json() as State & { error?: string };
    if (!r.ok) throw Error(data.error || "Administrator access required.");
    configureWorld(data.theme.world);
    setState(data);
    setMapId(current => {
      const selected = current || new URLSearchParams(window.location.search).get("map");
      return data.theme.world.maps.some(m => m.id === selected) ? selected! : data.theme.world.startMap;
    });
    setError("");
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load).catch(e => setError(e.message));
  }, [load]);
  return <main className="admin-studio">
    <AdminHeader active="theme" />
    <section className="admin-workspace">
      <ThemeNav active="maps" />
      <div className="roster-heading">
        <div><h1>Maps &amp; transport</h1><p className="admin-page-description">Edit artwork, reachable ground, characters and dialogue, doors, portals, and their lock requirements.</p></div>
        {state && <a className="secondary-button" href={`/admin?map=${encodeURIComponent(mapId)}`}>Place challenges on this map</a>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!state ? error ? <a href="/admin">Sign in as an admin</a> : <p>Loading maps…</p> : <>
        <label className="management-map-picker">Map
          <select aria-label="Select map" value={mapId} onChange={e => {
            if (dirty && !window.confirm("Discard your unsaved map edits?")) return;
            setMapId(e.target.value);
          }}>{state.theme.world.maps.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}</select>
          <span role="status">{dirty ? "Unsaved map edits" : "Saved map"}</span>
        </label>
        <MapSettings key={mapId} standalone world={state.theme.world} mapId={mapId}
          themeRevision={state.themeRevision} contentRevision={state.revision} challenges={state.challenges} characters={state.theme.characters}
          onSaved={load} onDirtyChange={setDirty} />
      </>}
    </section>
  </main>;
}

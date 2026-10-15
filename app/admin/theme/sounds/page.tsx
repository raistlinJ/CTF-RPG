"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";

type Clip = { name: string; src: string; source: "theme" | "upload" };
type Settings = {
  sounds: { clips: Clip[]; maps: Record<string, string | null>; events: Record<string, string | null> };
  maps: { id: string; name: string; music: string | null }[];
  tracks: { name: string; midi: string }[];
  events: { id: string; label: string; description: string }[];
  revision: number;
};
type Tab = "music" | "maps" | "events";
const tabs: { id: Tab; label: string }[] = [
  { id: "music", label: "Map music" },
  { id: "maps", label: "Map sounds" },
  { id: "events", label: "Events" },
];

export default function SoundsAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("music");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("/api/admin/theme-sounds").then(async response => {
      const data = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(data.error || "Administrator access required.");
      if (live) setSettings(data);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const sync = () => setTab(tabs.find(item => item.id === new URLSearchParams(window.location.search).get("tab"))?.id || "music");
    queueMicrotask(sync);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function select(next: Tab) {
    setTab(next);
    window.history.pushState(null, "", `/admin/theme/sounds?tab=${next}`);
  }
  function update(group: "maps" | "events", key: string, src: string) {
    setSettings(current => current && ({ ...current, sounds: { ...current.sounds, [group]: { ...current.sounds[group], [key]: src || null } } }));
    setDirty(true);
    setMessage("");
  }
  function updateMusic(key: string, src: string) {
    setSettings(current => current && ({ ...current, maps: current.maps.map(map => map.id === key ? { ...map, music: src || null } : map) }));
    setDirty(true);
    setMessage("");
  }
  async function request(body: object): Promise<Settings> {
    const response = await fetch("/api/admin/theme-sounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json() as Settings & { error?: string };
    if (!response.ok) throw Error(data.error || "Sounds could not be saved.");
    setSettings(data);
    return data;
  }
  async function saveAssignments(current: Settings) {
    const saved = await request({ action: "assign", revision: current.revision, maps: current.sounds.maps, events: current.sounds.events, mapMusic: Object.fromEntries(current.maps.map(map => [map.id, map.music])) });
    setDirty(false);
    return saved;
  }
  async function save() {
    if (!settings || busy || !dirty) return;
    setBusy(true); setError(""); setMessage("");
    try { await saveAssignments(settings); setMessage("Music and sounds saved. Reload the game to use them."); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function picker(label: string, value: string | null | undefined, group: "maps" | "events", key: string) {
    return <label className="theme-media-picker"><span>{label}</span>
      <select disabled={busy} value={value || ""} onChange={e => update(group, key, e.target.value)}>
        <option value="">None</option>
        {settings?.sounds.clips.map(clip => <option key={clip.src} value={clip.src}>{clip.name}</option>)}
      </select>
    </label>;
  }
  return <main className="admin-studio"><AdminHeader active="theme" /><section className="admin-workspace">
    <ThemeNav active="sounds" />
    <h1>Sounds</h1>
    <p className="admin-page-description">Choose music for each map and short effects for maps and game events. None keeps the current music playing on map entry. Browse and upload files in <a href="/admin/theme/media?tab=music">Media Library → Music</a> or <a href="/admin/theme/media?tab=effects">Sound effects</a>.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {dirty && <p className="save-note" role="status">You have unsaved sound changes.</p>}
    {!settings ? !error && <p>Loading sounds…</p> : <div className="theme-media-page">
      <div className="theme-media-tabs" role="tablist" aria-label="Sound categories" onKeyDown={e => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const index = tabs.findIndex(item => item.id === tab);
        const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs.at(-1)! : tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        select(next.id);
        e.currentTarget.querySelector<HTMLButtonElement>(`#sound-tab-${next.id}`)?.focus();
      }}>
        {tabs.map(item => <button type="button" role="tab" id={`sound-tab-${item.id}`} key={item.id} aria-controls={`sound-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => select(item.id)}>{item.label}</button>)}
      </div>
      <section className="admin-editor theme-media-section" role="tabpanel" id="sound-panel-music" aria-labelledby="sound-tab-music" hidden={tab !== "music"}>
        <h2>Map music</h2><p>Choose a track from the theme playlist. None keeps whatever music is already playing. Moving between maps with the same track keeps it playing without restarting.</p>
        <div className="theme-media-assignments">{settings.maps.map(map => <div className="theme-media-assignment sound-assignment" key={map.id}><strong>{map.name}</strong><label className="theme-media-picker"><span>Music for {map.name}</span><select disabled={busy} value={map.music || ""} onChange={e => updateMusic(map.id, e.target.value)}><option value="">None</option>{settings.tracks.map(track => <option value={track.midi} key={track.midi}>{track.name}</option>)}</select></label></div>)}</div>
        {!settings.tracks.length && <p>There are no MIDI tracks yet. <a href="/admin/theme/media?tab=music">Add music in Media Library</a>.</p>}
      </section>
      <section className="admin-editor theme-media-section" role="tabpanel" id="sound-panel-maps" aria-labelledby="sound-tab-maps" hidden={tab !== "maps"}>
        <h2>Map sounds</h2><p>Play this effect when a player enters the map.</p>
        <div className="theme-media-assignments">{settings.maps.map(map => <div className="theme-media-assignment sound-assignment" key={map.id}><strong>{map.name}</strong>{picker(`Sound for ${map.name}`, settings.sounds.maps[map.id], "maps", map.id)}</div>)}</div>
      </section>
      <section className="admin-editor theme-media-section" role="tabpanel" id="sound-panel-events" aria-labelledby="sound-tab-events" hidden={tab !== "events"}>
        <h2>Events</h2><p>Choose a sound for each game event.</p>
        <div className="theme-media-assignments">{settings.events.map(event => <div className="theme-media-assignment sound-assignment" key={event.id}><div><strong>{event.label}</strong><small>{event.description}</small></div>{picker(`Sound for ${event.label}`, settings.sounds.events[event.id], "events", event.id)}</div>)}</div>
      </section>
      <div className="appearance-save"><button type="button" className="primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save music and sounds"}</button>{dirty && <small>Map music, map sounds, and event selections are saved together.</small>}</div>
    </div>}
  </section></main>;
}

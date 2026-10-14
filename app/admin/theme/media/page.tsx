"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";
import { BOSS_STYLES } from "@/lib/challenge-icon.mjs";
import AudioPanel from "./audio-panel";
import { Portrait, AdminAvatarPreview } from "@/app/page";

import type { Character, Settings } from "./media-types";
type NewAppearance = { name: string; appearanceFor: Character["appearanceFor"]; sprite: string };
const blank: NewAppearance = { name: "", appearanceFor: "player", sprite: "" };

function AppearancesPanel({onDirtyChange,onSaved,knownRevision}:{onDirtyChange:(dirty:boolean)=>void;onSaved:(revision:number)=>void;knownRevision:number|null}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [newAppearance, setNewAppearance] = useState<NewAppearance>(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/theme-media").then(async response => {
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(result.error || "Administrator access required.");
      if (live) setSettings(result);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{if(knownRevision!==null)setSettings(current=>current && current.revision<knownRevision?{...current,revision:knownRevision}:current);},[knownRevision,settings?.revision]);
  const options = settings ? [...new Map([
    ...settings.media.map(item => [item.src, item.name] as const),
    ...settings.suppliedMedia.map(item => [item.src, item.name] as const),
    ...settings.characters.filter(c => c.sprite).map(c => [c.sprite!, c.name] as const),
    ...settings.maps.filter(m => m.background).map(m => [m.background!, m.name] as const),
    ...BOSS_STYLES.map(style => [settings.bossSprites[style.id] || style.sprite, style.label] as const),
  ]).entries()].map(([src, label]) => ({ src, label })) : [];
  const update = (next: Settings) => { setSettings(next); setDirty(true); setMessage(""); };
  async function save() {
    if (!settings || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/theme-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign", revision: settings.revision,
          characterSprites: Object.fromEntries(settings.characters.map(c => [c.id, c.sprite])),
          bossSprites: Object.fromEntries(BOSS_STYLES.map(style => [style.id, settings.bossSprites[style.id] || null])),
          mapBackgrounds: Object.fromEntries(settings.maps.map(m => [m.id, m.background])),
          newAppearances: newAppearance.name.trim() && newAppearance.sprite ? [newAppearance] : [],
        }),
      });
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(result.error || "Media assignments could not be saved.");
      setSettings(result); onSaved(result.revision); setNewAppearance(blank); setDirty(false);
      setMessage("Media assignments saved. Reload the game to see the new artwork.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function imagePicker(label: string, value: string | null, onChange: (src: string | null) => void, fallback: string) {
    return <label className="theme-media-picker"><span>{label}</span><select value={value || ""} onChange={e => onChange(e.target.value || null)}>
      <option value="">{fallback}</option>
      {options.map(option => <option key={option.src} value={option.src}>{option.label} · {option.src.split("/").at(-1)?.slice(0, 14)}</option>)}
    </select></label>;
  }
  return <section aria-label="Appearance assignments">
    <h2>Appearances</h2>
    <p className="admin-page-description">Upload and browse artwork in the <a href="/admin/theme/images">Image library</a>, then assign it to player appearances, non-player appearances, boss styles, and maps here. Images travel with theme exports and backups.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? !error && <p>Loading media…</p> : <div className="theme-media-page">
      <section id="selectable-characters" className="admin-editor theme-media-section"><h2>Selectable player characters</h2><p>These appearances are available when players choose their character. Previews match the game, including fallback sprites.</p>
        <div className="theme-media-assignments">{settings.characters.filter(character => character.appearanceFor !== "entity").map(character => <div className="theme-media-assignment" key={character.id}>
          <Portrait hero={character} />
          <div><strong>{character.name}</strong><small>{character.appearanceFor === "both" ? "Player and non-player entity" : character.appearanceFor === "player" ? "Player" : "Non-player entity"}</small></div>
          {imagePicker(`Image for ${character.name}`, character.sprite, src => update({ ...settings, characters: settings.characters.map(c => c.id === character.id ? { ...c, sprite: src } : c) }), "Use fallback sprite")}
        </div>)}</div>
        <h3>Administrator</h3>
        <div className="theme-media-assignment theme-media-admin-avatar"><AdminAvatarPreview /><div><strong>Admin wizard</strong><small>Reserved for administrator accounts</small></div><span>The game’s built-in wizard appearance; not selectable by students.</span></div>
        <h3>Non-player appearances</h3>
        <div className="theme-media-assignments">{settings.characters.filter(character => character.appearanceFor === "entity").map(character => <div className="theme-media-assignment" key={character.id}>
          <Portrait hero={character} /><div><strong>{character.name}</strong><small>Non-player entity</small></div>
          {imagePicker(`Image for ${character.name}`,character.sprite,src => update({...settings,characters:settings.characters.map(c=>c.id===character.id?{...c,sprite:src}:c)}),"Use fallback sprite")}
        </div>)}</div>
        <div className="theme-media-new"><h3>Add an appearance</h3><p>Create another selectable look for players, non-player entities, or both.</p>
          <label>Name<input maxLength={80} value={newAppearance.name} onChange={e => { setNewAppearance({ ...newAppearance, name: e.target.value }); setDirty(true); }} /></label>
          <label>Available to<select value={newAppearance.appearanceFor} onChange={e => { setNewAppearance({ ...newAppearance, appearanceFor: e.target.value as Character["appearanceFor"] }); setDirty(true); }}><option value="player">Players</option><option value="entity">Non-player entities</option><option value="both">Both</option></select></label>
          {imagePicker("Image", newAppearance.sprite, src => { setNewAppearance({ ...newAppearance, sprite: src || "" }); setDirty(true); }, "Choose an image")}
        </div>
      </section>

      <section className="admin-editor theme-media-section"><h2>Boss styles</h2><p>Each boss challenge uses the image assigned to its style.</p>
        <div className="theme-media-assignments">{BOSS_STYLES.map(style => <div className="theme-media-assignment" key={style.id}>
          <img src={settings.bossSprites[style.id] || style.sprite} alt="" /><strong>{style.label}</strong>
          {imagePicker(`Image for ${style.label}`, settings.bossSprites[style.id] || null, src => update({ ...settings, bossSprites: { ...settings.bossSprites, [style.id]: src || "" } }), "Built-in artwork")}
        </div>)}</div>
      </section>
      <section id="map-artwork" className="admin-editor theme-media-section"><h2>Map artwork</h2><p>Upload an image in the <a href="/admin/theme/images">Image library</a>, then assign it to a map below. Images fill the 40 × 28 grid. Artwork changes preserve ground, challenges, entities, spawn, and transport. Edit those separately in Maps &amp; transport. Artwork changes and resets take effect when you save media assignments.</p>
        <div className="theme-media-assignments">{settings.maps.map(map => <div className="theme-media-assignment" key={map.id}>
          {map.background && <img src={map.background} alt="" />}<strong>{map.name}</strong>
          {imagePicker(`Background for ${map.name}`, map.background, src => update({ ...settings, maps: settings.maps.map(m => m.id === map.id ? { ...m, background: src } : m) }), "No background image")}
          <a className="text-button" href={`/admin/theme/maps?map=${encodeURIComponent(map.id)}`}>Edit ground &amp; transport</a>
          {Object.hasOwn(map,"originalBackground") && <button type="button" className="text-button" disabled={busy} onClick={()=>update({...settings,maps:settings.maps.map(m=>m.id===map.id?{...m,background:m.originalBackground ?? null}:m)})}>Reset original artwork</button>}
        </div>)}</div>
      </section>
      <button className="primary" type="button" disabled={busy || !dirty || (!!newAppearance.name.trim() !== !!newAppearance.sprite)} onClick={() => void save()}>{busy ? "Saving…" : "Save media assignments"}</button>
      {!!newAppearance.name.trim() !== !!newAppearance.sprite && <p>Enter a name and choose an image for the new appearance before saving.</p>}
    </div>}
  </section>;
}

export default function MediaAdmin({ initialTab = "appearances" }: { initialTab?: "appearances" | "audio" }) {
  const [tab, setTab] = useState<"appearances" | "audio">(initialTab);
  const [knownRevision,setKnownRevision]=useState<number|null>(null);
  const [appearancesDirty,setAppearancesDirty]=useState(false),[audioDirty,setAudioDirty]=useState(false);
  useEffect(()=>{if(!appearancesDirty&&!audioDirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[appearancesDirty,audioDirty]);
  useEffect(() => {
    const sync = () => setTab(new URLSearchParams(window.location.search).get("tab") === "audio" ? "audio" : "appearances");
    queueMicrotask(sync);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function select(next: "appearances" | "audio") {
    setTab(next);
    window.history.pushState(null, "", next === "audio" ? "/admin/theme/media?tab=audio" : "/admin/theme/media");
  }
  return <main className="admin-studio"><AdminHeader active="theme" /><section className="admin-workspace">
    <ThemeNav active="media" />
    <h1>Media &amp; appearances</h1>
    <div className="theme-media-tabs" role="tablist" aria-label="Media type" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?"appearances":e.key==="End"?"audio":tab==="appearances"?"audio":"appearances";select(next);e.currentTarget.querySelector<HTMLButtonElement>(`#media-tab-${next}`)?.focus();}}>
      <button type="button" role="tab" id="media-tab-appearances" aria-controls="media-panel-appearances" tabIndex={tab==="appearances"?0:-1} aria-selected={tab === "appearances"} onClick={() => select("appearances")}>Appearances</button>
      <button type="button" role="tab" id="media-tab-audio" aria-controls="media-panel-audio" tabIndex={tab==="audio"?0:-1} aria-selected={tab === "audio"} onClick={() => select("audio")}>Audio</button>
    </div>
    {(appearancesDirty||audioDirty)&&<p className="save-note" role="status">Unsaved media changes are kept when switching tabs. Save each tab before leaving Media.</p>}
    <div role="tabpanel" id="media-panel-appearances" aria-labelledby="media-tab-appearances" hidden={tab!=="appearances"}><AppearancesPanel onDirtyChange={setAppearancesDirty} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
    <div role="tabpanel" id="media-panel-audio" aria-labelledby="media-tab-audio" hidden={tab!=="audio"}><AudioPanel onDirtyChange={setAudioDirty} active={tab==="audio"} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
  </section></main>;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

type Settings = { muteAll: boolean; revision: number; overrides: Record<string, boolean> };
export function usePersonalMutes(username: string | undefined, active: boolean) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), writing = useRef(false);
  const refresh = useCallback(async () => {
    if (!username || writing.current) return;
    const version = ++generation.current;
    try {
      const r = await fetch("/api/chat-mutes");
      const d = await r.json() as Settings & {error?:string};
      if (!r.ok) throw Error(d.error || "Could not load your personal mutes.");
      if (version === generation.current) setSettings(d);
    } catch (e) { if (version === generation.current) setError((e as Error).message); }
  }, [username]);
  useEffect(() => {
    setSettings(null); setError(""); writing.current = false; setBusy(false);
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
  useEffect(() => {
    if (!active || !username) return;
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); },5000);
    return () => { clearInterval(timer); };
  }, [active, username, refresh]);
  async function change(action: "set" | "mute-all" | "unmute-all", target?: string, muted?: boolean) {
    if (!settings || writing.current) return;
    writing.current = true; setBusy(true); setError("");
    const version = ++generation.current;
    try {
      const r = await fetch("/api/chat-mutes", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,username:target,muted,revision:settings.revision})});
      const d = await r.json() as Settings & {error?:string};
      if (!r.ok) throw Error(d.error || "Could not update your personal mutes.");
      if (version === generation.current) setSettings(d);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) { writing.current = false; setBusy(false); void refresh(); }
    }
  }
  return {settings,busy,error,change};
}
export type PersonalMutes = ReturnType<typeof usePersonalMutes>;

export function PersonalMuteButton({controls,username,muted = false}: {controls: PersonalMutes; username: string; muted?: boolean}) {
  const settings = controls.settings;
  const isMuted = settings ? (Object.hasOwn(settings.overrides,username) ? settings.overrides[username] : settings.muteAll) : muted;
  return <button type="button" className="text-button personal-mute-button" disabled={controls.busy || !settings}
    aria-label={`${isMuted ? "Unmute" : "Mute"} ${username} for me`} title="Affects only the messages you receive from this player"
    onClick={() => void controls.change("set",username,!isMuted)}>
    {isMuted ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
    {isMuted ? "Unmute for me" : "Mute for me"}
  </button>;
}

export function PersonalMuteControls({controls}: {controls:PersonalMutes}) {
  return <section className="personal-mute-controls" aria-label="Personal chat mutes">
    <div><strong>Personal chat mutes</strong><small>Only affects your inbox. Teammates and administrators are always allowed.</small></div>
    <div className="personal-mute-actions">
      <button type="button" className="secondary-button" disabled={controls.busy || !controls.settings} onClick={() => void controls.change("mute-all")} title="Mute all other players, including new contacts">Mute all</button>
      <button type="button" className="secondary-button" disabled={controls.busy || !controls.settings} onClick={() => void controls.change("unmute-all")}>Unmute all</button>
    </div>
    {controls.settings?.muteAll && <small>Other players are muted by default. You can unmute individual players.</small>}
    {controls.busy && <small role="status">Saving your personal mutes…</small>}
    {controls.error && <p className="error" role="alert">{controls.error}</p>}
  </section>;
}

"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useRef, useState } from "react";

type Clip = { name: string; src: string; source: "theme" | "upload" };
type Settings = { sounds: { clips: Clip[] }; revision: number };
type Result = Settings & { error?: string; uploaded?: number };

export default function SoundsPanel({ onDirtyChange, onSaved, knownRevision, active }: {
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (revision: number) => void;
  knownRevision: number | null;
  active: boolean;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/admin/theme-sounds").then(async response => {
      const data = await response.json() as Result;
      if (!response.ok) throw Error(data.error || "Administrator access required.");
      if (live) setSettings(data);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; preview.current?.pause(); };
  }, []);
  useEffect(() => { onDirtyChange(files.length > 0); }, [files.length, onDirtyChange]);
  useEffect(() => { if (!active) stop(); }, [active]);

  function stop() { preview.current?.pause(); preview.current = null; setPlaying(null); }
  function play(clip: Clip) {
    if (playing === clip.src) { stop(); return; }
    stop(); setError("");
    const sound = new Audio(clip.src);
    sound.onended = () => setPlaying(null);
    sound.onerror = () => { setError("The sound could not be previewed."); setPlaying(null); };
    preview.current = sound; setPlaying(clip.src);
    void sound.play().catch(() => { setError("The sound could not be previewed."); setPlaying(null); });
  }
  async function request(body: FormData | object) {
    const response = await fetch("/api/admin/theme-sounds", {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const result = await response.json() as Result;
    if (!response.ok) throw Error(result.error || "Sounds could not be saved.");
    setSettings(result); onSaved(result.revision);
    return result;
  }
  async function upload() {
    if (!settings || !files.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData();
    form.set("revision", String(Math.max(settings.revision, knownRevision ?? 0)));
    files.forEach(file => form.append("files", file));
    try {
      const result = await request(form);
      setFiles([]);
      setMessage(result.uploaded ? `${result.uploaded} sound ${result.uploaded === 1 ? "file" : "files"} uploaded. Assign them under Sounds.` : "Those sounds are already in the library.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(clip: Clip) {
    if (!settings || busy) return;
    setBusy(true); setError(""); setMessage(""); stop();
    try {
      await request({ action: "delete", revision: Math.max(settings.revision, knownRevision ?? 0), src: clip.src });
      setMessage(`${clip.name} removed. Its map and event assignments were cleared.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function queue(chosen: File[]) {
    const invalid = chosen.find(file => !/\.(wav|mp3|ogg)$/i.test(file.name) || file.size > 2 * 1024 * 1024 || file.size < 12);
    if (invalid) { setError(`"${invalid.name}": choose a WAV, MP3, or OGG file up to 2 MB.`); return; }
    if (chosen.length + files.length > 10 || chosen.length + files.length + (settings?.sounds.clips.length || 0) > 40) {
      setError("Choose at most 10 files and keep the library within 40 clips."); return;
    }
    setFiles(current => [...current, ...chosen]); setError(""); setMessage("");
  }
  const clips = settings?.sounds.clips || [];
  return <section aria-label="Sound media">
    <h2>Sound effects</h2>
    <p className="admin-page-description">Browse theme and uploaded effects, and preview them here. Assign them to maps and events under <a href="/admin/theme/sounds">Sounds</a>.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? !error && <p>Loading sounds…</p> : <div className="theme-media-page">
      <section className="admin-editor theme-media-section"><h2>All sound effects</h2>
        <ul className="audio-track-list">{clips.map(clip => <li key={clip.src}><span>{clip.name} · {clip.source === "theme" ? "Theme" : "Uploaded"}</span><div><button type="button" className="secondary-button" disabled={busy} onClick={() => play(clip)}>{playing === clip.src ? "Stop" : "Preview"}</button>{clip.source === "upload" && <button type="button" className="text-button" disabled={busy} onClick={() => void remove(clip)}>Delete upload</button>}</div></li>)}</ul>
        {!clips.length && <p>No sound effects yet.</p>}
      </section>
      <section className="admin-editor theme-media-section"><h2>Upload sound effects</h2>
        <p>WAV, MP3, or OGG. Up to 10 per upload, 2 MB per file, and 40 clips per theme.</p>
        <label>Choose sounds<input type="file" accept=".wav,.mp3,.ogg,audio/wav,audio/mpeg,audio/ogg" multiple disabled={busy} onChange={e => { const chosen = Array.from(e.target.files || []); e.target.value = ""; queue(chosen); }} /></label>
        {files.length > 0 && <p>{files.map(file => file.name).join(", ")}</p>}
        <div className="entity-editor-actions"><button className="primary" type="button" disabled={!files.length || busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload sounds"}</button>{files.length > 0 && <button className="text-button" type="button" disabled={busy} onClick={() => setFiles([])}>Clear selection</button>}</div>
      </section>
    </div>}
  </section>;
}

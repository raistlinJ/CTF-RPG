"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useRef, useState } from "react";
import AdminHeader from "../../admin-header";
import { MidiPlayer, type MusicConfig } from "@/lib/midi-player";
import ThemeNav from "../theme-nav";

type Track = { name: string; midi: string };
type Settings = { audio: MusicConfig & { playlist: Track[] }; revision: number };
type SaveResult = Settings & { uploaded: number; skipped: string[]; error?: string };

export default function AudioAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<MidiPlayer | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/admin/theme-audio")
      .then(async (r) => {
        const d = (await r.json()) as Settings & { error?: string };
        if (!r.ok) throw Error(d.error || "Administrator access required.");
        if (live) setSettings(d);
      })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; player.current?.dispose(); };
  }, []);

  function stop() {
    player.current?.dispose();
    player.current = null;
    setPlaying(null);
  }

  async function preview(track: Track) {
    if (playing === track.midi) { stop(); return; }
    stop();
    setError("");
    let current: MidiPlayer | null = null;
    try {
      const p = new MidiPlayer(
        { midi: track.midi, playlist: [], loop: true, volume: settings?.audio.volume ?? .15 },
        (e) => { setError(e.message); stop(); },
      );
      current = p;
      player.current = p;
      setPlaying(track.midi);
      await p.play();
    } catch (e) {
      if (player.current === current) { setError((e as Error).message); stop(); }
    }
  }

  function queueFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (!selected.length) return;
    const invalid = selected.find((f) => !/\.midi?$/i.test(f.name) || f.size > 5 * 1024 * 1024);
    if (invalid) { setError(`"${invalid.name}": choose a MIDI file up to 5 MB.`); return; }
    if (selected.length + files.length > 20) {
      setError("You can queue up to 20 MIDI files at a time.");
      return;
    }
    setFiles((queued) => [...queued, ...selected]);
    setError("");
    setMessage("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    stop();
    const form = new FormData();
    form.set("revision", String(settings.revision));
    form.set("playlist", JSON.stringify(settings.audio.playlist));
    form.set("volume", String(settings.audio.volume));
    form.set("loop", String(settings.audio.loop));
    for (const file of files) form.append("files", file);
    try {
      const r = await fetch("/api/admin/theme-audio", { method: "POST", body: form });
      const d = await r.json().catch(() => null) as SaveResult | null;
      if (!r.ok) {
        throw Error(d?.error || (r.status === 413
          ? "The selected files are too large. Audio and the rest of the theme must fit within 8 MB."
          : "Audio could not be saved. Please retry."));
      }
      if (!d?.audio) throw Error("The server returned an unexpected response. Please retry.");
      setSettings(d);
      setFiles([]);
      const uploaded = d.uploaded ?? files.length;
      const summary = files.length ? `${uploaded} MIDI ${uploaded === 1 ? "file" : "files"} uploaded. ` : "";
      const skipped = d.skipped?.length ? `Already in the playlist, skipped: ${d.skipped.join(", ")}. ` : "";
      setMessage(`${summary}${skipped}Audio saved. Reload the game to use the updated playlist.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-studio">
      <AdminHeader active="theme" />
      <section className="admin-workspace">
        <ThemeNav active="audio" />
        <h1>Audio</h1>
        <p className="audio-description">MIDI tracks play in shuffled order. Players can turn sound on or mute it in the game.</p>
        {error && !settings && <p role="alert" className="error">{error}</p>}
        {settings ? (
          <form className="admin-editor theme-audio-form" onSubmit={save}>
            <fieldset disabled={busy}>
              <legend>Theme playlist</legend>
              <p>Up to 20 tracks, 5 MB per file. The complete theme, including map artwork, sprites and audio, must fit within 8 MB. Duplicate MIDI files are skipped.</p>
              <ul className="audio-track-list">
                {settings.audio.playlist.map((track, i) => (
                  <li key={track.midi}>
                    <span>{i + 1}. {track.name}</span>
                    <div>
                      <button type="button" className="secondary-button" onClick={() => void preview(track)}>{playing === track.midi ? "Stop" : "Preview"}</button>
                      <button type="button" className="text-button" aria-label={`Remove ${track.name}`} onClick={() => {
                        stop();
                        setSettings({ ...settings, audio: { ...settings.audio, playlist: settings.audio.playlist.filter((_, n) => n !== i) } });
                        setMessage("");
                      }}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
              {!settings.audio.playlist.length && !files.length && <p>No music configured. Add MIDI files below.</p>}
              <label>
                Add MIDI files
                <input type="file" accept=".mid,.midi,audio/midi" multiple key={settings.revision} onChange={queueFiles} aria-describedby="audio-upload-help" />
              </label>
              <p id="audio-upload-help">Select one or more files, then click Upload &amp; Save to add them to the playlist.</p>
              {files.length > 0 && (
                <section aria-label="MIDI files ready to upload">
                  <p>{files.length} {files.length === 1 ? "file" : "files"} ready to upload</p>
                  <ul className="audio-track-list">
                    {files.map((file, i) => (
                      <li key={`${file.name}-${i}`}>
                        <span>{file.name} · ready to upload</span>
                        <button type="button" className="text-button" aria-label={`Remove queued ${file.name}`} onClick={() => { setFiles((queued) => queued.filter((_, n) => n !== i)); setMessage(""); }}>Remove</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <label>
                Volume ({Math.round(settings.audio.volume * 100)}%)
                <input aria-label="Music volume" type="range" min="0" max="1" step=".01" value={settings.audio.volume} onChange={(e) => setSettings({ ...settings, audio: { ...settings.audio, volume: Number(e.target.value) } })} />
              </label>
              <label className="check-row">
                <input type="checkbox" checked={settings.audio.loop} onChange={(e) => setSettings({ ...settings, audio: { ...settings.audio, loop: e.target.checked } })} />
                Repeat playlist with a new shuffle
              </label>
              <button className="primary" type="submit" aria-busy={busy}>{busy ? "Uploading & Saving…" : "Upload & Save"}</button>
              {error && <p role="alert" className="error">{error}</p>}
              {message && <p role="status">{message}</p>}
            </fieldset>
          </form>
        ) : !error && <p>Loading audio…</p>}
      </section>
    </main>
  );
}

"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";
import { IMAGE_FILE_LIMIT } from "@/lib/pack-limits.mjs";
import type { Media, Settings } from "../media/media-types";

export default function ImageLibraryAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<File[]>([]);
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
  useEffect(() => {
    if (!files.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [files.length]);
  async function upload() {
    if (!settings || !files.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData();
    form.set("revision", String(settings.revision));
    files.forEach(file => form.append("files", file));
    try {
      const response = await fetch("/api/admin/theme-media", { method: "POST", body: form });
      const result = await response.json() as Settings & { error?: string; uploaded?: number };
      if (!response.ok) throw Error(result.error || "Images could not be uploaded.");
      setSettings(result); setFiles([]);
      setMessage(`${result.uploaded} ${result.uploaded === 1 ? "image" : "images"} added. Assign artwork under Media & appearances.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteImage(item: Media) {
    if (!settings || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/theme-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", revision: settings.revision, id: item.id }),
      });
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(result.error || "Image could not be deleted.");
      setSettings(result);
      setMessage(`Deleted ${item.name} from the image library and future theme exports.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="admin-studio"><AdminHeader active="theme" /><section className="admin-workspace">
    <ThemeNav active="images" />
    <h1>Image library</h1>
    <p className="admin-page-description">Upload and browse your theme’s images here. Choose which images players, characters, bosses, and maps use in <a href="/admin/theme/media">Media &amp; appearances</a>.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? !error && <p>Loading image library…</p> : <div className="theme-media-page">
      <section className="admin-editor theme-media-section"><h2>Uploaded images</h2>
        <p>PNG, JPEG, WebP, or GIF. Up to 10 images per upload and 4 MB per image; the complete theme must fit within 32 MB, including existing artwork, audio, retained originals, and unused uploads. Only unused uploads can be deleted.</p>
        <label>Choose images<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={busy} onChange={e => {
          const selected = Array.from(e.target.files || []); e.target.value = "";
          if (selected.length > 10 || selected.some(file => file.size > IMAGE_FILE_LIMIT)) { setError("Choose at most 10 images, each up to 4 MB."); return; }
          setFiles(selected); setError(""); setMessage("");
        }} /></label>
        {files.length > 0 && <p>{files.map(file => file.name).join(", ")}</p>}
        <div className="entity-editor-actions">
          <button className="primary" type="button" disabled={!files.length || busy} onClick={() => void upload()}>{busy ? "Saving…" : "Upload images"}</button>
          {files.length > 0 && <button className="text-button" type="button" disabled={busy} onClick={() => setFiles([])}>Clear selection</button>}
        </div>
        <div className="theme-media-grid">{settings.media.filter(item => item.source === "upload").map(item => <article className="theme-media-card" key={item.id}>
          <img src={item.src} alt="" /><strong>{item.name}</strong>
          <button className="text-button" type="button" disabled={busy} onClick={() => void deleteImage(item)}>Delete upload</button>
        </article>)}{!settings.media.some(item => item.source === "upload") && <p>No uploaded images yet.</p>}</div>
      </section>
      <section className="admin-editor theme-media-section"><h2>Theme artwork</h2><p>These images came with the theme or the game. They can be assigned to roles in Media &amp; appearances and are read only here.</p>
        <div className="theme-media-grid">{settings.suppliedMedia.map(item => <article className="theme-media-card" key={item.src}>
          <img src={item.src} alt="" /><strong>{item.name}</strong><span className="theme-media-protected">Theme artwork</span>
        </article>)}</div>
      </section>
    </div>}
  </section></main>;
}

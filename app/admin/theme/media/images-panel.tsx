"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { IMAGE_FILE_LIMIT } from "@/lib/pack-limits.mjs";
import type { Media, Settings } from "./media-types";

export default function ImagesPanel({ onDirtyChange, onSaved, knownRevision }: { onDirtyChange: (dirty: boolean) => void; onSaved: (revision: number) => void; knownRevision: number | null }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "theme" | "upload">("all");
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/theme-media").then(async response => {
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(result.error || "Administrator access required.");
      if (live) setSettings(result);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const images: Media[] = settings ? [...new Map([...settings.suppliedMedia.map(item => ({...item,id:item.src,source:"theme" as const})),...settings.media].map(item => [item.src,item])).values()] : [];
  const visibleImages = images.filter(item => filter === "all" || item.source === filter);
  useEffect(() => { onDirtyChange(files.length > 0); }, [files.length, onDirtyChange]);
  async function upload() {
    if (!settings || !files.length || busy) return;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData();
    try {
      form.set("revision", String(Math.max(settings.revision, knownRevision ?? 0)));
      files.forEach(file => form.append("files", file));
      const response = await fetch("/api/admin/theme-media", { method: "POST", body: form });
      const result = await response.json() as Settings & { error?: string; uploaded?: number };
      if (!response.ok) throw Error(result.error || "Images could not be uploaded.");
      setSettings(result); onSaved(result.revision); setFiles([]);
      setMessage(`${result.uploaded} ${result.uploaded === 1 ? "image" : "images"} added. Assign images under Appearances.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteImage(item: Media) {
    if (!settings || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/theme-media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", revision: Math.max(settings.revision, knownRevision ?? 0), id: item.id }),
      });
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw Error(result.error || "Image could not be deleted.");
      setSettings(result); onSaved(result.revision);
      setMessage(`Deleted ${item.name} from the Media Library and future theme exports.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section aria-label="Image media">
    <h2>Images</h2>
    <p className="admin-page-description">Browse all theme and uploaded images. Assign map backgrounds, characters, and boss artwork in <a href="/admin/theme/appearances?tab=maps">Appearances</a>.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!settings ? !error && <p>Loading Media Library…</p> : <div className="theme-media-page">
      <section className="admin-editor theme-media-section"><h2>All images</h2>
        <p>Theme artwork and uploaded images appear together. Use the filters to narrow the library.</p>
        <div className="theme-media-tabs theme-media-subtabs" role="group" aria-label="Filter images">
          {(["all","theme","upload"] as const).map(value => <button key={value} type="button" aria-pressed={filter===value} onClick={() => setFilter(value)}>{value === "all" ? "All images" : value === "theme" ? "Theme" : "Uploaded"} ({value === "all" ? images.length : images.filter(item => item.source === value).length})</button>)}
        </div>
        <div className="theme-media-grid">{visibleImages.map(item => <article className="theme-media-card" key={item.src}>
          <img src={item.src} alt="" /><strong>{item.name}</strong>
          {item.source === "upload" ? <button className="text-button" type="button" disabled={busy} onClick={() => void deleteImage(item)}>Delete upload</button> : <span className="theme-media-protected">Theme artwork</span>}
        </article>)}{!visibleImages.length && <p>No images in this view.</p>}</div>
      </section>
      <section className="admin-editor theme-media-section"><h2>Upload images</h2>
        <p>PNG, JPEG, WebP, or GIF. Up to 10 images per upload and 4 MB per image; theme images and sound effects must fit within 32 MB, including existing artwork, retained originals, and unused uploads. Map music is excluded from this size limit. Only unused uploads can be deleted.</p>
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
      </section>
    </div>}
  </section>;
}

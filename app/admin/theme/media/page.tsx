"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";
import ImagesPanel from "./images-panel";
import AudioPanel from "./audio-panel";

export default function MediaLibraryAdmin({ initialTab = "images" }: { initialTab?: "images" | "audio" }) {
  const [tab, setTab] = useState<"images" | "audio">(initialTab);
  const [knownRevision,setKnownRevision]=useState<number|null>(null);
  const [imagesDirty,setImagesDirty]=useState(false),[audioDirty,setAudioDirty]=useState(false);
  useEffect(()=>{if(!imagesDirty&&!audioDirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[imagesDirty,audioDirty]);
  useEffect(() => {
    const sync = () => setTab(new URLSearchParams(window.location.search).get("tab") === "audio" ? "audio" : "images");
    queueMicrotask(sync);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function select(next: "images" | "audio") {
    setTab(next);
    window.history.pushState(null, "", next === "audio" ? "/admin/theme/media?tab=audio" : "/admin/theme/media");
  }
  return <main className="admin-studio"><AdminHeader active="theme" /><section className="admin-workspace">
    <ThemeNav active="media" />
    <h1>Media Library</h1>
    <div className="theme-media-tabs" role="tablist" aria-label="Media type" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const next=e.key==="Home"?"images":e.key==="End"?"audio":tab==="images"?"audio":"images";select(next);e.currentTarget.querySelector<HTMLButtonElement>(`#media-tab-${next}`)?.focus();}}>
      <button type="button" role="tab" id="media-tab-images" aria-controls="media-panel-images" tabIndex={tab==="images"?0:-1} aria-selected={tab === "images"} onClick={() => select("images")}>Image</button>
      <button type="button" role="tab" id="media-tab-audio" aria-controls="media-panel-audio" tabIndex={tab==="audio"?0:-1} aria-selected={tab === "audio"} onClick={() => select("audio")}>Audio</button>
    </div>
    {(imagesDirty||audioDirty)&&<p className="save-note" role="status">Unsaved media changes are kept when switching tabs. Save each tab before leaving Media Library.</p>}
    <div role="tabpanel" id="media-panel-images" aria-labelledby="media-tab-images" hidden={tab!=="images"}><ImagesPanel onDirtyChange={setImagesDirty} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
    <div role="tabpanel" id="media-panel-audio" aria-labelledby="media-tab-audio" hidden={tab!=="audio"}><AudioPanel onDirtyChange={setAudioDirty} active={tab==="audio"} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
  </section></main>;
}

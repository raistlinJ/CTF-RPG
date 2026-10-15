"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";
import ImagesPanel from "./images-panel";
import AudioPanel from "./audio-panel";
import SoundsPanel from "./sounds-panel";

type Tab = "images" | "music" | "effects";
const tabs: { id: Tab; label: string }[] = [
  { id: "images", label: "Images" },
  { id: "music", label: "Music" },
  { id: "effects", label: "Sound effects" },
];
export default function MediaLibraryAdmin({ initialTab = "images" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [knownRevision,setKnownRevision]=useState<number|null>(null);
  const [imagesDirty,setImagesDirty]=useState(false),[musicDirty,setMusicDirty]=useState(false),[soundsDirty,setSoundsDirty]=useState(false);
  useEffect(()=>{if(!imagesDirty&&!musicDirty&&!soundsDirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[imagesDirty,musicDirty,soundsDirty]);
  useEffect(() => {
    const sync = () => { const query = new URLSearchParams(window.location.search),value=query.get("tab"); setTab(value === "audio" || (value === "sounds" && query.get("kind") === "music") ? "music" : value === "sounds" ? "effects" : tabs.find(item => item.id === value)?.id || "images"); };
    queueMicrotask(sync);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function select(next: Tab) {
    setTab(next);
    window.history.pushState(null, "", next === "images" ? "/admin/theme/media" : `/admin/theme/media?tab=${next}`);
  }
  return <main className="admin-studio"><AdminHeader active="theme" /><section className="admin-workspace">
    <ThemeNav active="media" />
    <h1>Media Library</h1>
    <div className="theme-media-tabs" role="tablist" aria-label="Media type" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const i=tabs.findIndex(item=>item.id===tab),next=e.key==="Home"?tabs[0]:e.key==="End"?tabs.at(-1)!:tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];select(next.id);e.currentTarget.querySelector<HTMLButtonElement>(`#media-tab-${next.id}`)?.focus();}}>
      {tabs.map(item=><button type="button" role="tab" id={`media-tab-${item.id}`} aria-controls={`media-panel-${item.id}`} tabIndex={tab===item.id?0:-1} aria-selected={tab===item.id} onClick={()=>select(item.id)} key={item.id}>{item.label}</button>)}
    </div>
    {(imagesDirty||musicDirty||soundsDirty)&&<p className="save-note" role="status">Unsaved media changes are kept when switching tabs. Save each tab before leaving Media Library.</p>}
    <div role="tabpanel" id="media-panel-images" aria-labelledby="media-tab-images" hidden={tab!=="images"}><ImagesPanel onDirtyChange={setImagesDirty} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
    <div role="tabpanel" id="media-panel-music" aria-labelledby="media-tab-music" hidden={tab!=="music"}><AudioPanel onDirtyChange={setMusicDirty} active={tab==="music"} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
    <div role="tabpanel" id="media-panel-effects" aria-labelledby="media-tab-effects" hidden={tab!=="effects"}><SoundsPanel onDirtyChange={setSoundsDirty} active={tab==="effects"} knownRevision={knownRevision} onSaved={revision=>setKnownRevision(old=>Math.max(old??0,revision))}/></div>
  </section></main>;
}

"use client";
/* Full-page links support the standalone Vite app. */
/* eslint-disable @next/next/no-html-link-for-pages */
import { useEffect, useState } from "react";
import { Snowflake, Cpu, Compass } from "lucide-react";
import AdminHeader from "../admin/admin-header";
import ScoresPanel from "./scores-panel";
export default function Scoreboard() {
  const [admin, setAdmin] = useState(false), [title, setTitle] = useState("Quest"), [badge, setBadge] = useState("compass");
  useEffect(() => {
    let live = true;
    void fetch("/api/config").then(async (r) => {
      if (r.ok) {
        const d = await r.json() as { theme: { title: string; badge: string } };
        if (live) { setTitle(d.theme.title); setBadge(d.theme.badge); }
      }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return <main className={admin ? "admin-studio" : "scoreboard-shell"}>
    {admin ? <AdminHeader active="scores"/> : <header className="player-header">
      <a className="brand" href="/"><span className="brand-icon">{badge === "cpu" ? <Cpu size={24}/> : badge === "snowflake" ? <Snowflake size={24}/> : <Compass size={24}/>}</span><span className="ctf-brand-name">CTF-RPG<small>{title}</small></span></a>
      <a className="admin-link" href="/">Back to game</a>
    </header>}
    <ScoresPanel onViewerAdmin={setAdmin}/>
  </main>;
}

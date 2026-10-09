"use client";
import { useEffect, useState } from "react";
import { Trophy, RefreshCw } from "lucide-react";
type Player = { id?: string; rank: number; username: string; hero?: string; score: number; completed?: number; isYou: boolean };
export default function ScoresPanel({ allowModeSwitch = true, onViewerAdmin }: { allowModeSwitch?: boolean; onViewerAdmin?: (admin: boolean) => void }) {
  const [mode, setMode] = useState("team"), [requestedMode, setRequestedMode] = useState(""),
    [admin, setAdmin] = useState(false), [players, setPlayers] = useState<Player[]>([]),
    [error, setError] = useState(""), [loading, setLoading] = useState(true),
    [heroes, setHeroes] = useState<Record<string,string>>({}), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    void fetch("/api/config").then(async (r) => {
      if (r.ok) {
        const d = await r.json() as { characters: { id: string; name: string }[] };
        if (live) setHeroes(Object.fromEntries(d.characters.map((c) => [c.id,c.name])));
      }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    const load = async (initial = false) => {
      const current = ++version;
      if (initial) { setLoading(true); setPlayers([]); }
      try {
        const query = allowModeSwitch ? requestedMode : "team";
        const r = await fetch(`/api/scoreboard${query ? `?mode=${query}` : ""}`, { signal: controller.signal });
        const d = await r.json() as { players: Player[]; mode: string; admin: boolean; error?: string };
        if (!r.ok) throw Error(d.error || "Could not load scores.");
        if (!controller.signal.aborted && current === version) {
          setPlayers(d.players); setMode(d.mode); setAdmin(d.admin); setError(""); onViewerAdmin?.(d.admin);
        }
      } catch (e) {
        if (!controller.signal.aborted && current === version) { setError((e as Error).message); setPlayers([]); }
      } finally {
        if (!controller.signal.aborted && current === version) setLoading(false);
      }
    };
    void load(true);
    const update = () => { if (!document.hidden) void load(); };
    const timer = setInterval(update, 5000);
    window.addEventListener("focus", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", update); };
  }, [requestedMode, refresh, allowModeSwitch, onViewerAdmin]);
  return <section className="scoreboard-page">
    <div className="roster-heading">
      <div><span className="eyebrow">EXPEDITION SCORES</span><h1>{mode === "team" ? "Team scoreboard" : "User scoreboard"}</h1>
        <p>{mode === "team" ? "Team totals include earned points and point gifts." : "Earned points include the cost of any hints used."}</p></div>
      <button className="secondary-button" onClick={() => setRefresh((n) => n + 1)} disabled={loading}><RefreshCw size={17} />Refresh scores</button>
    </div>
    {admin && allowModeSwitch && <div className="team-modes scoreboard-modes" role="group" aria-label="Scoreboard scores">
      <button type="button" className={mode === "individual" ? "primary" : "secondary-button"} aria-pressed={mode === "individual"} onClick={() => setRequestedMode("individual")}>User scores</button>
      <button type="button" className={mode === "team" ? "primary" : "secondary-button"} aria-pressed={mode === "team"} onClick={() => setRequestedMode("team")}>Team scores</button>
    </div>}
    {error ? <div className="roster-empty"><Trophy size={28} /><p role="alert">{error}</p></div>
      : loading ? <p role="status">Loading expedition scores…</p>
      : !players.length ? <div className="roster-empty"><Trophy size={28}/><h2>The expedition is just beginning</h2><p>{mode === "team" ? "Teams will appear here when explorers create them." : "Student explorers will appear here as accounts are created."}</p></div>
      : <div className="scoreboard-list">{players.map((p) => <div className={"scoreboard-row " + (p.isYou ? "is-you" : "")} key={p.id || p.username}>
        <span className={"rank rank-" + p.rank}>{p.rank <= 3 ? <Trophy size={20}/> : p.rank}<small>{p.rank <= 3 ? `#${p.rank}` : ""}</small></span>
        <div><h2>{p.username}{p.isYou && <span>{mode === "team" ? "Your team" : "You"}</span>}</h2><p>{mode === "team" ? "Team total" : `${heroes[p.hero || ""] || p.hero} · ${p.completed} ${p.completed === 1 ? "treasure" : "treasures"}`}</p></div>
        <strong>{p.score.toLocaleString()}<small>points</small></strong>
      </div>)}</div>}
    <p className="roster-note">Tied scores share a rank. Earned totals exclude admins and disabled accounts.</p>
  </section>;
}

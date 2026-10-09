"use client";
/* Full-page navigation also supports the standalone app. */
import { useEffect, useRef, useState } from "react";
import { Save, RefreshCw, Undo2, ArrowRight } from "lucide-react";
import AdminHeader from "../../admin-header";
import ChallengeNav from "../challenge-nav";
import DependencyGraph, { type DependencyNode } from "./dependency-graph";
import { validateChallengeDependencies } from "@/lib/challenge-dependencies.mjs";
type Catalog = { challenges: DependencyNode[]; revision: number; themeRevision: number; error?: string };
const serialize = (nodes: DependencyNode[]) => JSON.stringify(nodes.map((c) => ({ id: c.id, dependsOn: [...c.dependsOn].sort() })));
export default function Dependencies() {
  const [nodes, setNodes] = useState<DependencyNode[]>([]), [revision, setRevision] = useState(0), [themeRevision, setThemeRevision] = useState(0),
    [initial, setInitial] = useState(""), [allowed, setAllowed] = useState(false), [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""),
    [from, setFrom] = useState(""), [to, setTo] = useState(""), [history, setHistory] = useState<DependencyNode[][]>([]);
  const saving = useRef(false);
  const dirty = allowed && serialize(nodes) !== initial;
  const sorted = [...nodes].sort((a,b) => a.object.localeCompare(b.object) || a.id.localeCompare(b.id));
  const edges = nodes.flatMap((c) => c.dependsOn.map((id) => ({ from: id, to: c.id })));
  function apply(d: Catalog) {
    setNodes(d.challenges); setRevision(d.revision); setThemeRevision(d.themeRevision);
    setInitial(serialize(d.challenges)); setHistory([]); setAllowed(true); setFrom(""); setTo("");
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/challenge-dependencies", { signal: controller.signal }).then(async (r) => {
      const d = await r.json() as Catalog;
      if (!r.ok) throw Error(d.error || "Could not load dependencies.");
      if (!controller.signal.aborted) apply(d);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function connect(source: string, target: string) {
    if (busy || !source || !target) return false;
    if (!nodes.some((c) => c.id === source) || !nodes.some((c) => c.id === target)) {
      setError("Choose two current challenges."); setMessage(""); return false;
    }
    if (nodes.find((c) => c.id === target)?.dependsOn.includes(source)) {
      setError("That connection already exists."); setMessage(""); return false;
    }
    const updated = nodes.map((c) => c.id === target ? { ...c, dependsOn: [...c.dependsOn,source] } : c);
    try { validateChallengeDependencies(updated); }
    catch (e) { setError((e as Error).message); setMessage(""); return false; }
    setHistory((previous) => [...previous,nodes].slice(-50)); setNodes(updated); setError(""); setMessage("");
    return true;
  }
  function remove(source: string, target: string) {
    if (busy) return;
    setHistory((previous) => [...previous,nodes].slice(-50));
    setNodes(nodes.map((c) => c.id === target ? { ...c, dependsOn: c.dependsOn.filter((id) => id !== source) } : c));
    setError(""); setMessage("");
  }
  async function reload() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/admin/challenge-dependencies"), d = await r.json() as Catalog;
      if (!r.ok) throw Error(d.error || "Could not reload dependencies.");
      apply(d); setMessage("Loaded the saved graph.");
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  async function save() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/admin/challenge-dependencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, themeRevision, dependencies: nodes.map((c) => ({ id: c.id, dependsOn: c.dependsOn })) }) });
      const d = await r.json() as Catalog;
      if (!r.ok) throw Error(d.error || "Could not save dependencies.");
      apply(d); setMessage("Dependencies saved. Active games update automatically.");
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <main className="admin-studio">
    <AdminHeader active="challenges"/>
    <section className="admin-workspace dependencies-workspace">
      <ChallengeNav active="dependencies"/>
      <div className="roster-heading">
        <div><span className="eyebrow">CHALLENGE PROGRESSION</span><h1>Dependencies</h1><p>Connect a prerequisite to the challenge it unlocks. Players must solve every prerequisite before that challenge appears.</p></div>
        {allowed && <div className="dependency-save-actions">
          <button type="button" className="secondary-button" disabled={busy || !history.length} onClick={() => { setNodes(history[history.length - 1]); setHistory(history.slice(0,-1)); setError(""); setMessage(""); }}><Undo2 size={17}/>Undo change</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void reload()}><RefreshCw size={17}/>Reload saved</button>
          <button type="button" className="primary" disabled={busy || !dirty} onClick={() => void save()}><Save size={17}/>{busy ? "Saving…" : "Save dependencies"}</button>
        </div>}
      </div>
      {error && <p role="alert" className="error dependency-feedback">{error}</p>}
      {message && <p role="status" className="dependency-feedback">{message}</p>}
      {loading ? <p>Loading dependency graph…</p> : !allowed ? <a href="/admin">Sign in as an admin</a> : !nodes.length ? <div className="roster-empty"><h2>Add your first challenge</h2><p>Create challenges before connecting their prerequisites.</p><a className="primary" href="/admin">Manage challenges</a></div> : <>
        <p className="dependency-save-note">{dirty ? "Unsaved connections — save to apply them to the game." : "Saved connections"} · Unlocks follow each player’s progress. Admins can preview every challenge.</p>
        <DependencyGraph key={nodes.map((c) => c.id).join(",")} nodes={nodes} disabled={busy} onConnect={connect} onRemove={remove}/>
        <form className="dependency-connect-form admin-editor" onSubmit={(e) => { e.preventDefault(); connect(from,to); }}>
          <h2>Add a connection</h2>
          <div className="dependency-connect-fields">
            <label>Prerequisite<select aria-label="Prerequisite" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} required><option value="">Select a challenge</option>{sorted.map((c) => <option key={c.id} value={c.id}>{c.object} ({c.id})</option>)}</select></label>
            <ArrowRight size={20} aria-hidden="true"/>
            <label>Unlocks<select aria-label="Unlocks" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} required><option value="">Select a challenge</option>{sorted.map((c) => <option key={c.id} value={c.id}>{c.object} ({c.id})</option>)}</select></label>
            <button className="primary" disabled={busy || !from || !to}>Connect challenges</button>
          </div>
        </form>
        <details className="dependency-connection-list admin-editor">
          <summary>Connections ({edges.length})</summary>
          <ul>{edges.map((edge) => <li key={`${edge.from}>${edge.to}`}><span><strong>{nodes.find((c) => c.id === edge.from)?.object}</strong> <ArrowRight size={16} aria-hidden="true"/> {nodes.find((c) => c.id === edge.to)?.object}</span><button type="button" className="secondary-button" disabled={busy} aria-label={`Remove ${edge.from} prerequisite from ${edge.to}`} onClick={() => remove(edge.from,edge.to)}>Remove</button></li>)}</ul>
          {!edges.length && <p>No prerequisites. Visible challenges appear at the start.</p>}
        </details>
        <p className="roster-note">Written prerequisites unlock after grading. Already completed challenges remain available. Challenges marked Hidden remain hidden from players.</p>
      </>}
    </section>
  </main>;
}

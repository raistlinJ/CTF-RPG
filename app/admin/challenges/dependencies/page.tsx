"use client";
/* Full-page navigation also supports the standalone app. */
import { useEffect, useRef, useState } from "react";
import { Save, RefreshCw, Undo2, ArrowRight, UsersRound, Trash2 } from "lucide-react";
import AdminHeader from "../../admin-header";
import ChallengeNav from "../challenge-nav";
import DependencyGraph, { type DependencyNode } from "./dependency-graph";
import { validateChallengeDependencies } from "@/lib/challenge-dependencies.mjs";
import EntityEditor from "../../entity-editor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { entityReference } from "@/lib/challenge-dependencies.mjs";
import { entitySchema, entityLocationAvailable, findEntityLocation } from "@/lib/non-player-entities.mjs";
import { createWorld, activeWorld } from "@/lib/world-data.mjs";
import { clientUuid } from "@/lib/client-uuid.mjs";
import type { EntityCharacter, NonPlayerEntity } from "@/lib/non-player-entities";
type Catalog = { challenges: DependencyNode[]; entities: NonPlayerEntity[]; world: typeof activeWorld; characters: EntityCharacter[]; revision: number; themeRevision: number; error?: string };
const entityNode = (entity: NonPlayerEntity): DependencyNode => ({ id: entityReference(entity.id), kind: "entity", entity, object: entity.name, map: entity.map, region: "Non-player entity", visibility: "visible", points: 0, grading: "automatic", summary: entity.nodes.find(n => n.id === entity.startNode)?.text || "", dependsOn: entity.dependsOn || [] });
const entityDefinitions = (nodes: DependencyNode[]) => nodes.flatMap(n => n.entity ? [{ ...n.entity, dependsOn: n.dependsOn }] : []);
const serialize = (nodes: DependencyNode[]) => JSON.stringify(nodes.map((c) => ({ id: c.id, dependsOn: [...c.dependsOn].sort(), entity: c.entity })));
export default function Dependencies() {
  const [nodes, setNodes] = useState<DependencyNode[]>([]), [revision, setRevision] = useState(0), [themeRevision, setThemeRevision] = useState(0),
    [initial, setInitial] = useState(""), [allowed, setAllowed] = useState(false), [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""),
    [from, setFrom] = useState(""), [to, setTo] = useState(""), [history, setHistory] = useState<DependencyNode[][]>([]);
  const [world, setWorld] = useState<typeof activeWorld | null>(null), [characters, setCharacters] = useState<EntityCharacter[]>([]), [editingEntity, setEditingEntity] = useState<NonPlayerEntity | null>(null);
  const saving = useRef(false);
  const dirty = allowed && serialize(nodes) !== initial;
  const sorted = [...nodes].sort((a,b) => a.object.localeCompare(b.object) || a.id.localeCompare(b.id));
  const edges = nodes.flatMap((c) => c.dependsOn.map((id) => ({ from: id, to: c.id })));
  function apply(d: Catalog) {
    const combined = [...d.challenges, ...(d.entities || []).map(entityNode)];
    setWorld(d.world); setCharacters(d.characters);
    setNodes(combined); setRevision(d.revision); setThemeRevision(d.themeRevision);
    setInitial(serialize(combined)); setHistory([]); setAllowed(true); setFrom(""); setTo("");
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
      setError("Choose two current challenges or entities."); setMessage(""); return false;
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
      const r = await fetch("/api/admin/challenge-dependencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, themeRevision, entities: entityDefinitions(nodes), dependencies: nodes.map((c) => ({ id: c.id, dependsOn: c.dependsOn })) }) });
      const d = await r.json() as Catalog;
      if (!r.ok) throw Error(d.error || "Could not save dependencies.");
      apply(d); setMessage("Dependencies saved. Active games update automatically.");
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  function addEntity() {
    if (!world || !characters.length || busy) return;
    const engine = createWorld(world);
    const maps = [...new Set([world.startMap, ...world.maps.map(m => m.id)])];
    const placement = maps.map(map => ({ map, location: findEntityLocation(engine, nodes.filter(n => !n.entity), entityDefinitions(nodes), map, engine.mapInfo(map)!.spawn) })).find(p => p.location);
    if (!placement?.location) { setError("The maps have no free character locations. Free a reachable tile in Theme first."); return; }
    const { map, location } = placement;
    setEditingEntity({ id: "entity-" + clientUuid(), name: "New character", characterId: characters[0].id, map, location, startNode: "greeting", nodes: [{ id: "greeting", text: "Welcome, traveler.", choices: [] }], dependsOn: [] });
  }
  function saveEntity() {
    if (!editingEntity || !world) return;
    try {
      const entity = entitySchema.parse(editingEntity);
      if (!entityLocationAvailable(createWorld(world), nodes.filter(n => !n.entity), entityDefinitions(nodes), entity.map, entity.location.x, entity.location.y, entity.id)) throw Error("Choose an unoccupied, reachable tile away from doors, walls, and challenges.");
      const id = entityReference(entity.id), previous = nodes.find(n => n.id === id);
      const updated = entityNode({ ...entity, dependsOn: previous?.dependsOn || [] });
      setHistory(h => [...h, nodes].slice(-50)); setNodes(previous ? nodes.map(n => n.id === id ? updated : n) : [...nodes, updated]);
      setEditingEntity(null); setError(""); setMessage("Character updated in the draft. Save dependencies to apply changes.");
    } catch (e) { setError((e as Error).message); }
  }
  function deleteEntity(id: string) {
    if (busy) return;
    setHistory(h => [...h, nodes].slice(-50));
    setNodes(nodes.filter(n => n.id !== id).map(n => ({ ...n, dependsOn: n.dependsOn.filter(d => d !== id) })));
    setFrom(""); setTo(""); setError(""); setMessage("Character and its connections removed from the draft. Undo is available until you save.");
  }
  return <main className="admin-studio">
    <AdminHeader active="challenges"/>
    <section className="admin-workspace dependencies-workspace">
      <ChallengeNav active="dependencies"/>
      <div className="roster-heading">
        <div><span className="eyebrow">CHALLENGE PROGRESSION</span><h1>Dependencies</h1><p>Connect challenges and non-player entities. A challenge is completed by solving it; an entity is activated by speaking to it. Every prerequisite must be completed before the connected challenge or entity appears.</p></div>
        {allowed && <div className="dependency-save-actions">
          <button type="button" className="secondary-button" disabled={busy || !world || nodes.filter(n => n.entity).length >= 100} onClick={addEntity}><UsersRound size={17}/>Add non-player entity</button>
          <button type="button" className="secondary-button" disabled={busy || !history.length} onClick={() => { setNodes(history[history.length - 1]); setHistory(history.slice(0,-1)); setError(""); setMessage(""); }}><Undo2 size={17}/>Undo change</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void reload()}><RefreshCw size={17}/>Reload saved</button>
          <button type="button" className="primary" disabled={busy || !dirty} onClick={() => void save()}><Save size={17}/>{busy ? "Saving…" : "Save dependencies"}</button>
        </div>}
      </div>
      {error && <p role="alert" className="error dependency-feedback">{error}</p>}
      {message && <p role="status" className="dependency-feedback">{message}</p>}
      {loading ? <p>Loading dependency graph…</p> : !allowed ? <a href="/admin">Sign in as an admin</a> : <>
        <p className="dependency-save-note">{dirty ? "Unsaved changes — save to apply them to the game." : "Saved connections"} · Unlocks follow each player’s progress. Admins can preview every challenge and entity.</p>
        <DependencyGraph key={nodes.map((c) => c.id).join(",")} nodes={nodes} disabled={busy} onConnect={connect} onRemove={remove}/>
        <form className="dependency-connect-form admin-editor" onSubmit={(e) => { e.preventDefault(); connect(from,to); }}>
          <h2>Add a connection</h2>
          <div className="dependency-connect-fields">
            <label>Prerequisite<select aria-label="Prerequisite" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} required><option value="">Select a challenge or entity</option>{sorted.map((c) => <option key={c.id} value={c.id}>{c.object} ({c.entity ? "Entity · spoke to" : "Challenge · solved"})</option>)}</select></label>
            <ArrowRight size={20} aria-hidden="true"/>
            <label>Unlocks<select aria-label="Unlocks" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} required><option value="">Select a challenge or entity</option>{sorted.map((c) => <option key={c.id} value={c.id}>{c.object} ({c.entity ? "Entity · spoke to" : "Challenge · solved"})</option>)}</select></label>
            <button className="primary" disabled={busy || !from || !to}>Connect prerequisites</button>
          </div>
        </form>
        {!!nodes.filter(n => n.entity).length && <section className="admin-editor dependency-connection-list"><h2>Non-player entities</h2><p>These characters also appear in Theme → Maps &amp; Transport → Non-Player Entities.</p><ul>{nodes.filter(n => n.entity).map(n => <li key={n.id}><span><strong>{n.object}</strong> · {n.map} · Activated when spoken to</span><div className="entity-editor-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setError(""); setEditingEntity(n.entity!); }}>Edit {n.object}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => deleteEntity(n.id)} aria-label={`Delete non-player entity ${n.object}`}><Trash2 size={16}/>Delete</button></div></li>)}</ul></section>}
        <details className="dependency-connection-list admin-editor">
          <summary>Connections ({edges.length})</summary>
          <ul>{edges.map((edge) => <li key={`${edge.from}>${edge.to}`}><span><strong>{nodes.find((c) => c.id === edge.from)?.object}</strong> <ArrowRight size={16} aria-hidden="true"/> {nodes.find((c) => c.id === edge.to)?.object}</span><button type="button" className="secondary-button" disabled={busy} aria-label={`Remove ${edge.from} prerequisite from ${edge.to}`} onClick={() => remove(edge.from,edge.to)}>Remove</button></li>)}</ul>
          {!edges.length && <p>No prerequisites. Visible challenges and entities appear at the start.</p>}
        </details>
        <p className="roster-note">Written prerequisites unlock after grading. Solved challenges and activated entities remain available. Admin conversations are previews and do not activate entities. Challenges marked Hidden remain hidden from players.</p>
      </>}
    </section>
    <Dialog open={!!editingEntity} onOpenChange={open => { if (!open) setEditingEntity(null); }}><DialogContent className="entity-dialogue dependency-entity-dialog" aria-describedby="dependency-entity-help"><DialogTitle>{nodes.some(n => n.id === entityReference(editingEntity?.id || "")) ? "Edit non-player entity" : "Add non-player entity"}</DialogTitle><DialogDescription id="dependency-entity-help">Place a character and configure what they say. Connect its card to set prerequisites, then save dependencies.</DialogDescription>
      {editingEntity && world && <><label>Map<select aria-label="Character map" value={editingEntity.map} onChange={e => { const map = e.target.value, engine = createWorld(world), location = findEntityLocation(engine, nodes.filter(n => !n.entity), entityDefinitions(nodes), map, engine.mapInfo(map)!.spawn, editingEntity.id); if (location) setEditingEntity({ ...editingEntity, map, location }); else setError("This map has no free character locations."); }}>{world.maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><EntityEditor key={editingEntity.id} entity={editingEntity} characters={characters} onChange={setEditingEntity}/></>}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="entity-editor-actions"><button type="button" className="primary" onClick={saveEntity}>Apply character</button><button type="button" className="secondary-button" onClick={() => setEditingEntity(null)}>Cancel</button></div>
    </DialogContent></Dialog>
  </main>;
}

"use client";
import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import AdminHeader from "../../../admin-header";
import ThemeNav from "../../theme-nav";
import { EntityPreview } from "@/app/entity-dialogue";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { entitySchema } from "@/lib/non-player-entities.mjs";
import type { EntityCharacter, NonPlayerEntity } from "@/lib/non-player-entities";
import DialogueGraph from "./dialogue-graph";

type Catalog = {
  theme: { world: { entities?: NonPlayerEntity[] }; characters: EntityCharacter[] };
  themeRevision: number;
  revision: number;
  error?: string;
};
export default function EntityDialoguePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entityId, setEntityId] = useState("");
  const [draft, setDraft] = useState<NonPlayerEntity | null>(null);
  const [nodeId, setNodeId] = useState("");
  const [choiceId, setChoiceId] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingConnection, setPendingConnection] = useState<{ from: string; to: string } | null>(null);
  const [choiceText, setChoiceText] = useState("");
  const [choiceError, setChoiceError] = useState("");
  const [editingNodeId, setEditingNodeId] = useState("");
  const [dialogueText, setDialogueText] = useState("");
  const [editingChoice, setEditingChoice] = useState<{ from: string; id: string; label: string; to: string } | null>(null);
  const [editingChoiceError, setEditingChoiceError] = useState("");
  const entities = catalog?.theme.world.entities || [];
  const saved = entities.find(entity => entity.id === entityId);
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const validation = draft ? entitySchema.safeParse(draft) : null;
  const node = draft?.nodes.find(item => item.id === nodeId) || draft?.nodes[0];

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/challenges").then(async response => {
      const data = await response.json() as Catalog;
      if (!response.ok) throw Error(data.error || "Administrator access required.");
      if (!active) return;
      const requested = new URLSearchParams(window.location.search).get("entity");
      const selected = data.theme.world.entities?.find(entity => entity.id === requested) || data.theme.world.entities?.[0];
      setCatalog(data); setEntityId(selected?.id || ""); setDraft(selected ? structuredClone(selected) : null);
      setNodeId(selected?.startNode || ""); setError("");
    }).catch(reason => { if (active) setError((reason as Error).message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function chooseEntity(id: string) {
    if (dirty && !window.confirm("Discard unsaved dialogue changes?")) return;
    const selected = entities.find(entity => entity.id === id);
    if (!selected) return;
    setEntityId(id); setDraft(structuredClone(selected)); setNodeId(selected.startNode);
    setChoiceId(""); setError(""); setMessage(""); setPendingConnection(null); setEditingNodeId(""); setEditingChoice(null);
    window.history.replaceState(null, "", `/admin/theme/maps/dialogue?entity=${encodeURIComponent(id)}`);
  }
  function openDialogue(id: string) {
    if (!draft || busy) return;
    const selected = draft.nodes.find(item => item.id === id);
    if (!selected) return;
    setNodeId(id); setChoiceId(""); setDialogueText(selected.text); setEditingNodeId(id);
  }
  function openChoice(from: string, id: string) {
    if (!draft || busy) return;
    const choice = draft.nodes.find(item => item.id === from)?.choices.find(item => item.id === id);
    if (!choice) return;
    setNodeId(from); setChoiceId(id); setEditingChoice({ from, id, label: choice.label, to: choice.to }); setEditingChoiceError("");
  }
  function validChoiceLabel(from: string, label: string, excludeId = "") {
    const source = draft?.nodes.find(item => item.id === from);
    if (!source || !label) return "Enter the text the player will select.";
    if (source.choices.some(choice => choice.id !== excludeId && choice.label.trim().replace(/\s+/g, " ").toLowerCase() === label.replace(/\s+/g, " ").toLowerCase()))
      return "This dialogue already has a choice with that text.";
    const index = excludeId ? source.choices.findIndex(choice => choice.id === excludeId) : source.choices.length;
    if (/^\d+$/.test(label) && Number(label) !== index + 1) return `A number-only choice must be ${index + 1}.`;
    return "";
  }
  function applyChoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !editingChoice || busy) return;
    const label = editingChoice.label.trim();
    const issue = validChoiceLabel(editingChoice.from, label, editingChoice.id);
    if (issue) { setEditingChoiceError(issue); return; }
    setDraft({ ...draft, nodes: draft.nodes.map(item => item.id === editingChoice.from ? {
      ...item, choices: item.choices.map(choice => choice.id === editingChoice.id ? { ...choice, label, to: editingChoice.to } : choice),
    } : item) });
    setEditingChoice(null); setMessage("");
  }
  function applyDialogueText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !editingNodeId || busy || !dialogueText.trim()) return;
    const text = dialogueText.trim();
    setDraft({ ...draft, nodes: draft.nodes.map(item => item.id === editingNodeId ? { ...item, text } : item) });
    setEditingNodeId(""); setMessage("");
  }
  function addDialogue() {
    if (!draft || busy || draft.nodes.length >= 50) return;
    const id = "dialogue-" + clientUuid();
    setDraft({ ...draft, nodes: [...draft.nodes, { id, text: "", choices: [] }] });
    setNodeId(id); setChoiceId(""); setMessage("");
    return id;
  }
  function removeDialogue(id: string) {
    if (!draft || busy || draft.nodes.length === 1 || draft.startNode === id || draft.nodes.some(item => item.choices.some(choice => choice.to === id))) return;
    setDraft({ ...draft, nodes: draft.nodes.filter(item => item.id !== id) });
    if (nodeId === id) { setNodeId(draft.startNode); setChoiceId(""); }
    setMessage("");
  }
  function addChoice(from: string, to: string, label?: string) {
    if (!draft || busy) return;
    const source = draft.nodes.find(item => item.id === from);
    if (!source || !draft.nodes.some(item => item.id === to) || source.choices.length >= 10) return;
    let number = source.choices.length + 1;
    while (source.choices.some(choice => choice.label.toLowerCase() === `choice ${number}`)) number++;
    const id = "choice-" + clientUuid();
    setDraft({ ...draft, nodes: draft.nodes.map(item => item.id === from ? { ...item, choices: [...item.choices, { id, label: label ?? `Choice ${number}`, to }] } : item) });
    setNodeId(from); setChoiceId(id); setMessage("");
  }
  function beginConnection(from: string, to: string) {
    if (!draft || busy || !draft.nodes.some(item => item.id === to) || (draft.nodes.find(item => item.id === from)?.choices.length ?? 10) >= 10) return;
    setPendingConnection({ from, to }); setChoiceText(""); setChoiceError("");
  }
  function finishConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingConnection || !draft) return;
    const label = choiceText.trim();
    const issue = validChoiceLabel(pendingConnection.from, label);
    if (issue) { setChoiceError(issue); return; }
    addChoice(pendingConnection.from, pendingConnection.to, label);
    setPendingConnection(null); setChoiceText(""); setChoiceError("");
  }
  function addChoiceFromNode(id: string) {
    if (!draft) return;
    beginConnection(id, draft.nodes.find(item => item.id !== id)?.id || id);
  }
  function removeChoice(from: string, id: string) {
    if (!draft || busy) return;
    setDraft({ ...draft, nodes: draft.nodes.map(item => item.id === from ? { ...item, choices: item.choices.filter(choice => choice.id !== id) } : item) });
    if (nodeId === from && choiceId === id) setChoiceId("");
    setMessage("");
  }
  async function save() {
    if (!catalog || !draft || !validation?.success || !dirty || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.set("action", "update-entities");
      form.set("map", JSON.stringify({ id: draft.map }));
      form.set("themeRevision", String(catalog.themeRevision));
      form.set("contentRevision", String(catalog.revision));
      form.set("entities", JSON.stringify(entities.map(entity => entity.id === draft.id ? draft : entity)));
      const response = await fetch("/api/admin/maps", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "Could not save the dialogue graph.");
      const refreshed = await fetch("/api/admin/challenges");
      const data = await refreshed.json() as Catalog;
      if (!refreshed.ok) throw Error(data.error || "Saved, but could not reload the dialogue graph.");
      const current = data.theme.world.entities?.find(entity => entity.id === draft.id);
      setCatalog(data); setDraft(current ? structuredClone(current) : null);
      setMessage("Dialogue graph saved. Active games update automatically.");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  function reset() {
    if (!saved) return;
    setDraft(structuredClone(saved)); setNodeId(saved.startNode); setChoiceId("");
    setError(""); setMessage("Unsaved dialogue changes reset."); setPendingConnection(null); setEditingNodeId(""); setEditingChoice(null);
  }

  return <main className="admin-studio">
    <AdminHeader active="theme" />
    <section className="admin-workspace dialogue-workspace">
      <ThemeNav active="maps" />
      <nav className="admin-breadcrumbs" aria-label="Dialogue location"><a href="/admin/theme/maps">Maps &amp; transport</a><span aria-hidden="true">›</span><a href={draft ? `/admin/theme/maps?tab=entities&map=${encodeURIComponent(draft.map)}&entity=${encodeURIComponent(draft.id)}` : "/admin/theme/maps?tab=entities"}>Non-player entities</a><span aria-hidden="true">›</span><span aria-current="page">{draft?.name || "Dialogue graph"}</span></nav>
      <div className="roster-heading">
        <div><h1>Dialogue graph</h1><p className="admin-page-description">Connect player choices to the response each selection should open.</p></div>
        {draft && <a className="secondary-button" href={`/admin/theme/maps?tab=entities&map=${encodeURIComponent(draft.map)}&entity=${encodeURIComponent(draft.id)}`}>Back to character</a>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!catalog ? !error && <p>Loading dialogue graph…</p> : !draft ? <div className="admin-editor"><p>No non-player entities exist yet.</p><a href="/admin/theme/maps?tab=entities">Create a character</a></div> : <>
        <label className="management-map-picker">Character
          <select aria-label="Select character" value={entityId} onChange={event => chooseEntity(event.target.value)} disabled={busy}>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {entity.map}</option>)}</select>
          <span role="status">{dirty ? "Unsaved dialogue changes" : "Saved dialogue"}</span>
        </label>
        <label className="management-map-picker">Conversation replay
          <select aria-label="Conversation replay" value={draft.restartable === false ? "once" : "restartable"} disabled={busy} onChange={event => { setDraft({ ...draft, restartable: event.target.value === "restartable" }); setMessage(""); }}>
            <option value="restartable">Can be restarted</option><option value="once">One-time · show last dialogue on later interactions</option>
          </select>
        </label>
        <DialogueGraph key={entityId} entity={draft} selectedNodeId={node?.id || ""} selectedChoiceId={choiceId} disabled={busy}
          onSelectNode={id => { setNodeId(id); setChoiceId(""); }}
          onSelectChoice={(from, id) => { setNodeId(from); setChoiceId(id); }}
          onOpenChoice={openChoice}
          onOpenDialogue={openDialogue}
          onSetStart={id => { setDraft({ ...draft, startNode: id }); setNodeId(id); setChoiceId(""); setMessage(""); }}
          onConnect={beginConnection} onAddDialogue={addDialogue} onRemoveDialogue={removeDialogue}
          onAddChoice={addChoiceFromNode} onRemoveChoice={removeChoice} />
        <div className="dialogue-preview-actions"><button type="button" className="secondary-button" disabled={!validation?.success || busy} onClick={() => setPreview(true)}>Preview conversation</button></div>
        {validation && !validation.success && <p className="error" role="alert">{validation.error.issues.map(issue => issue.message).join(" ")}</p>}
        {message && <p role="status">{message}</p>}
        <div className="dependency-save-actions dialogue-save-actions"><button type="button" className="secondary-button" disabled={!dirty || busy} onClick={reset}><RefreshCw size={17}/>Reset</button>
          <button type="button" className="primary" disabled={!dirty || !validation?.success || busy} onClick={() => void save()}><Save size={17}/>{busy ? "Saving…" : "Save dialogue"}</button></div>
        {preview && <EntityPreview entity={draft} character={catalog.theme.characters.find(character => character.id === draft.characterId)} onClose={() => setPreview(false)} />}
      </>}
    </section>
    <Dialog open={!!pendingConnection} onOpenChange={open => { if (!open) { setPendingConnection(null); setChoiceError(""); } }}>
      <DialogContent className="dialogue-choice-dialog">
        <DialogTitle>Add player choice</DialogTitle>
        <DialogDescription>{pendingConnection && draft ? `Dialogue ${draft.nodes.findIndex(item => item.id === pendingConnection.from) + 1} → Dialogue ${draft.nodes.findIndex(item => item.id === pendingConnection.to) + 1}. What text should the player choose to go there?` : "Enter the text the player will select."}</DialogDescription>
        <form onSubmit={finishConnection}>
          <label>Choice text<input autoFocus aria-label="Choice text" value={choiceText} maxLength={120} placeholder="Ask about the quest" onChange={event => { setChoiceText(event.target.value); setChoiceError(""); }} /></label>
          <label>Respond with<select aria-label="New choice response dialogue" value={pendingConnection?.to || ""} onChange={event => setPendingConnection(current => current ? { ...current, to: event.target.value } : null)}>{draft?.nodes.map((item, index) => <option key={item.id} value={item.id}>Dialogue {index + 1}: {item.text.slice(0, 42) || "New dialogue"}</option>)}</select></label>
          {choiceError && <p className="error" role="alert">{choiceError}</p>}
          <div className="dialogue-choice-actions"><button type="button" className="secondary-button" onClick={() => setPendingConnection(null)}>Cancel</button><button type="submit" className="primary" disabled={!choiceText.trim()}>Add choice</button></div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!editingChoice} onOpenChange={open => { if (!open) { setEditingChoice(null); setEditingChoiceError(""); } }}>
      <DialogContent className="dialogue-choice-dialog">
        <DialogTitle>Edit player choice</DialogTitle>
        <DialogDescription>Change what the player selects and which dialogue opens next.</DialogDescription>
        <form onSubmit={applyChoice}>
          <label>Choice text<input autoFocus aria-label="Edit choice text" value={editingChoice?.label || ""} maxLength={120} onChange={event => { setEditingChoice(current => current ? { ...current, label: event.target.value } : null); setEditingChoiceError(""); }} /></label>
          <label>Respond with<select aria-label="Choice response dialogue" value={editingChoice?.to || ""} onChange={event => setEditingChoice(current => current ? { ...current, to: event.target.value } : null)}>{draft?.nodes.map((item, index) => <option key={item.id} value={item.id}>Dialogue {index + 1}: {item.text.slice(0, 42) || "New dialogue"}</option>)}</select></label>
          {editingChoiceError && <p className="error" role="alert">{editingChoiceError}</p>}
          <div className="dialogue-choice-actions"><button type="button" className="secondary-button" onClick={() => setEditingChoice(null)}>Cancel</button><button type="submit" className="primary" disabled={busy || !editingChoice?.label.trim()}>Apply choice</button></div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!editingNodeId} onOpenChange={open => { if (!open) setEditingNodeId(""); }}>
      <DialogContent className="dialogue-choice-dialog dialogue-text-dialog">
        <DialogTitle>{draft && editingNodeId ? `Dialogue ${draft.nodes.findIndex(item => item.id === editingNodeId) + 1}` : "Dialogue text"}</DialogTitle>
        <DialogDescription>Text this character says on this screen. Apply it here, then save the dialogue graph to publish it.</DialogDescription>
        <form onSubmit={applyDialogueText}>
          <label>Dialogue text<textarea autoFocus aria-label="Dialogue text in popup" value={dialogueText} rows={8} maxLength={5000} placeholder="What does this character say?" onChange={event => setDialogueText(event.target.value)} /></label>
          <div className="dialogue-choice-actions"><button type="button" className="secondary-button" onClick={() => setEditingNodeId("")}>Cancel</button><button type="submit" className="primary" disabled={busy || !dialogueText.trim()}>Apply text</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}

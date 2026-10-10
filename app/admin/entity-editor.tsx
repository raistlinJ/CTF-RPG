"use client";
import { useState } from "react";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { entitySchema } from "@/lib/non-player-entities.mjs";
import { EntityPreview } from "../entity-dialogue";
import type { EntityCharacter, EntityNode, NonPlayerEntity } from "@/lib/non-player-entities";

export default function EntityEditor({ entity, characters, onChange }: { entity: NonPlayerEntity; characters: EntityCharacter[]; onChange: (entity: NonPlayerEntity) => void }) {
  const [nodeId, setNodeId] = useState(entity.startNode), [preview, setPreview] = useState(false);
  const node = entity.nodes.find(n => n.id === nodeId) || entity.nodes[0];
  const title = (n: EntityNode) => `Dialogue ${entity.nodes.indexOf(n) + 1}${n.id === entity.startNode ? " · First" : ""}: ${n.text.slice(0, 45) || "New dialogue"}`;
  const patchNode = (values: Partial<EntityNode>) => onChange({ ...entity, nodes: entity.nodes.map(n => n.id === node.id ? { ...n, ...values } : n) });
  const incoming = entity.nodes.some(n => n.choices.some(c => c.to === node.id));
  return <div className="entity-editor">
    <label>Character name<input aria-label="Character name" value={entity.name} maxLength={80} onChange={e => onChange({ ...entity, name: e.target.value })} /></label>
    <label>Appearance<select aria-label="Character appearance" value={entity.characterId} onChange={e => onChange({ ...entity, characterId: e.target.value })}>{characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <div className="entity-coordinates">{(["x", "y"] as const).map(axis => <label key={axis}>{axis.toUpperCase()} coordinate<input aria-label={`Character ${axis.toUpperCase()} coordinate`} type="number" min={0} max={axis === "x" ? 39 : 27} value={entity.location[axis]} onChange={e => onChange({ ...entity, location: { ...entity.location, [axis]: Number(e.target.value) } })} /></label>)}</div>
    <label>First dialogue<select aria-label="First dialogue" value={entity.startNode} onChange={e => onChange({ ...entity, startNode: e.target.value })}>{entity.nodes.map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select></label>
    <label>Dialogue to edit<select aria-label="Dialogue to edit" value={node.id} onChange={e => setNodeId(e.target.value)}>{entity.nodes.map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select></label>
    <div className="entity-editor-actions"><button type="button" className="secondary-button" disabled={entity.nodes.length >= 50} onClick={() => { const id = "dialogue-" + clientUuid(); onChange({ ...entity, nodes: [...entity.nodes, { id, text: "", choices: [] }] }); setNodeId(id); }}>Add dialogue</button>
      <button type="button" className="text-button" disabled={entity.nodes.length === 1 || entity.startNode === node.id || incoming} onClick={() => { const nodes = entity.nodes.filter(n => n.id !== node.id); onChange({ ...entity, nodes }); setNodeId(entity.startNode); }}>Remove dialogue</button></div>
    {(incoming || entity.startNode === node.id) && <small>To remove this dialogue, change the first dialogue and remove any choices pointing here.</small>}
    <label>What this character says<textarea aria-label="Dialogue text" value={node.text} rows={5} maxLength={5000} placeholder="Welcome, traveler. What would you like to know?" onChange={e => patchNode({ text: e.target.value })} /></label>
    <h3>Player choices</h3><small>Each choice opens its response dialogue. Leave a dialogue without choices to end the conversation.</small>
    {node.choices.map((c, i) => <div className="entity-choice-editor" key={c.id}>
      <label>Choice {i + 1}<input aria-label={`Choice ${i + 1} text`} value={c.label} maxLength={120} onChange={e => patchNode({ choices: node.choices.map(choice => choice.id === c.id ? { ...choice, label: e.target.value } : choice) })} /></label>
      <label>Respond with<select aria-label={`Choice ${i + 1} response`} value={c.to} onChange={e => patchNode({ choices: node.choices.map(choice => choice.id === c.id ? { ...choice, to: e.target.value } : choice) })}>{entity.nodes.map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select></label>
      <button type="button" className="text-button" aria-label={`Remove choice ${i + 1}`} onClick={() => patchNode({ choices: node.choices.filter(choice => choice.id !== c.id) })}>Remove choice</button>
    </div>)}
    <div className="entity-editor-actions"><button type="button" className="secondary-button" disabled={node.choices.length >= 10} onClick={() => patchNode({ choices: [...node.choices, { id: "choice-" + clientUuid(), label: "", to: entity.nodes.find(n => n.id !== node.id)?.id || node.id }] })}>Add choice</button>
      <button type="button" className="secondary-button" disabled={!entitySchema.safeParse(entity).success} onClick={() => setPreview(true)}>Preview conversation</button></div>
    {preview && <EntityPreview entity={entity} character={characters.find(c => c.id === entity.characterId)} onClose={() => setPreview(false)} />}
  </div>;
}

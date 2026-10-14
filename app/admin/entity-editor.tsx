"use client";
import type { EntityCharacter, NonPlayerEntity } from "@/lib/non-player-entities";

export default function EntityEditor({ entity, characters, onChange, dialogueHref }: {
  entity: NonPlayerEntity;
  characters: EntityCharacter[];
  onChange: (entity: NonPlayerEntity) => void;
  dialogueHref?: string;
}) {
  return <div className="entity-editor">
    <label>Character name<input aria-label="Character name" value={entity.name} maxLength={80} onChange={e => onChange({ ...entity, name: e.target.value })} /></label>
    <label>Appearance<select aria-label="Character appearance" value={entity.characterId} onChange={e => onChange({ ...entity, characterId: e.target.value })}>{characters.filter(c => c.appearanceFor !== "player" || c.id === entity.characterId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <div className="entity-coordinates">{(["x", "y"] as const).map(axis => <label key={axis}>{axis.toUpperCase()} coordinate<input aria-label={`Character ${axis.toUpperCase()} coordinate`} type="number" min={0} max={axis === "x" ? 39 : 27} value={entity.location[axis]} onChange={e => onChange({ ...entity, location: { ...entity.location, [axis]: Number(e.target.value) } })} /></label>)}</div>
    <div className="entity-dialogue-link">
      <strong>Conversation</strong>
      <span>{entity.nodes.length} dialogue {entity.nodes.length === 1 ? "screen" : "screens"}</span>
      {dialogueHref ? <a className="secondary-button" href={dialogueHref}>Edit dialogue graph</a> : <small>Save this character before editing its dialogue graph.</small>}
    </div>
  </div>;
}

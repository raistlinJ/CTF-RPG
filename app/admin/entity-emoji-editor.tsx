"use client";
import { useState } from "react";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { PLAYER_EMOTES } from "@/lib/player-emotes.mjs";
import type { EntityEmojiInteraction, NonPlayerEntity } from "@/lib/non-player-entities";
import { EntityReactionAnimation } from "../entity-emoji-effects";

const effects = { sparkles: "Sparkles", hearts: "Hearts", fireworks: "Fireworks", none: "Reply only" };

export default function EntityEmojiEditor({ entity, onChange }: { entity: NonPlayerEntity; onChange: (entity: NonPlayerEntity) => void }) {
  const rules = entity.emojiInteractions || [];
  const [editing, setEditing] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ emoji: string; key: number } | null>(null);
  const endings = entity.nodes.filter(node => !node.choices.length);
  const update = (index: number, patch: Partial<EntityEmojiInteraction>) => onChange({ ...entity, emojiInteractions: rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  const sample = rules.find(rule => rule.emoji === preview?.emoji);
  const rule = editing === null ? undefined : rules[editing];
  const incomplete = rules.filter(item => !item.response.trim()).length;

  return <details className="entity-emoji-editor" open>
    <summary className="entity-emoji-summary">
      <ChevronRight size={17} aria-hidden="true" />
      <span><strong>Secret emoji interactions</strong><small>{entity.name} · {rules.length} {rules.length === 1 ? "reaction" : "reactions"}{incomplete > 0 && ` · ${incomplete} needs a reply`}</small></span>
    </summary>
    <div className="entity-emoji-editor-body">
      <div className="entity-emoji-toolbar"><small>{rules.length} of {PLAYER_EMOTES.length} emojis configured · Select a tile to edit its reaction.</small></div>
      <ul className="entity-emoji-tiles" aria-label={`${entity.name} emoji reactions`}>
        {rules.map((item, index) => <li key={index}>
          <button type="button" className="entity-emoji-tile" aria-label={`Edit ${item.emoji} reaction`} aria-pressed={editing === index} onClick={() => { setEditing(editing === index ? null : index); setPreview(null); }}>
            <span className="entity-emoji-tile-heading"><span className="entity-emoji-tile-trigger" aria-hidden="true">{item.emoji}</span><strong>{PLAYER_EMOTES.find(option => option.emoji === item.emoji)?.label}</strong></span>
            <span className={`entity-emoji-tile-reply${item.response.trim() ? "" : " is-empty"}`}>{item.response.trim() || "Add a secret reply"}</span>
            <span className="entity-emoji-tile-meta"><span>{effects[item.effect]}</span><span>{item.once ? "Once per player" : "Every time"}</span>{item.outputNodeId && <span>Unlocks an ending</span>}</span>
            <span className="entity-emoji-tile-edit"><Pencil size={13} aria-hidden="true" />{editing === index ? "Editing reaction" : "Edit reaction"}</span>
          </button>
        </li>)}
        <li><button type="button" className="entity-emoji-tile entity-emoji-add-tile" disabled={rules.length >= PLAYER_EMOTES.length} onClick={() => {
          const option = PLAYER_EMOTES.find(option => !rules.some(rule => rule.emoji === option.emoji));
          if (!option) return;
          onChange({ ...entity, emojiInteractions: [...rules, { emoji: option.emoji, response: "", effect: "sparkles", once: false, outputNodeId: null }] });
          setEditing(rules.length);
          setPreview(null);
        }}><Plus size={25} aria-hidden="true" /><strong>{rules.length >= PLAYER_EMOTES.length ? "All emojis configured" : "Add reaction"}</strong><span>{rules.length >= PLAYER_EMOTES.length ? "Edit an existing tile to make changes." : "Choose an emoji and a secret reply."}</span></button></li>
      </ul>
      {rule && editing !== null && <fieldset className="entity-emoji-rule"><legend>Edit {rule.emoji} reaction</legend>
        <div className="entity-emoji-rule-controls"><label>Trigger emoji<select aria-label={`Reaction ${editing + 1} emoji`} value={rule.emoji} onChange={event => update(editing, { emoji: event.target.value })}>
          {PLAYER_EMOTES.map(option => <option key={option.emoji} value={option.emoji} disabled={rules.some((other, i) => i !== editing && other.emoji === option.emoji)}>{option.emoji} {option.label}</option>)}
        </select></label>
          <label>Visual effect<select aria-label={`Reaction ${editing + 1} effect`} value={rule.effect} onChange={event => update(editing, { effect: event.target.value as EntityEmojiInteraction["effect"] })}>
            {Object.entries(effects).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label></div>
        <label>Secret reply<textarea rows={3} maxLength={1000} value={rule.response} aria-label={`Reaction ${editing + 1} reply`} placeholder="The character's reply when this emoji is discovered" onChange={event => update(editing, { response: event.target.value })} /></label>
        <label className="entity-emoji-once"><input type="checkbox" checked={rule.once} onChange={event => update(editing, { once: event.target.checked })} />Play effect once per player</label>
        <label>Unlock dialogue ending (optional)<select aria-label={`Reaction ${editing + 1} unlock`} value={rule.outputNodeId || ""} onChange={event => update(editing, { outputNodeId: event.target.value || null })}>
          <option value="">No progression unlock</option>{endings.map(node => <option key={node.id} value={node.id}>Dialogue {entity.nodes.indexOf(node) + 1}: {node.text.slice(0, 70)}</option>)}
        </select><small>Use this ending as a prerequisite in the challenge dependency graph. Add a separate ending in the dialogue graph for an emoji-only secret.</small></label>
        <div className="entity-emoji-rule-actions"><button type="button" className="secondary-button" disabled={!rule.response.trim()} onClick={() => setPreview(previous => ({ emoji: rule.emoji, key: (previous?.key || 0) + 1 }))}>Preview reaction</button>
          <button type="button" className="text-button" onClick={() => { setEditing(null); setPreview(null); }}>Done editing</button>
          <button type="button" className="text-button entity-emoji-remove" aria-label={`Remove ${rule.emoji} reaction`} onClick={() => { onChange({ ...entity, emojiInteractions: rules.filter((_, i) => i !== editing) }); setEditing(null); setPreview(null); }}>Remove</button></div>
        <small>Changes are published when you save the map.</small>
      </fieldset>}
      {sample && preview && <div key={preview.key} className="entity-emoji-admin-preview" role="status"><EntityReactionAnimation effect={sample.effect} /><strong>{entity.name} reacts to {sample.emoji}</strong><p>{sample.response}</p></div>}
    </div>
  </details>;
}

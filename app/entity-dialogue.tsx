"use client";
// Raw sprite images also work in the standalone Vite app.
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { matchDialogueChoice, resolveEntityDialogue } from "@/lib/non-player-entities.mjs";
import type { EntityCharacter, EntitySummary, NonPlayerEntity, PublicDialogue } from "@/lib/non-player-entities";

export function EntityPortrait({ character }: { character?: EntityCharacter }) {
  const [failed, setFailed] = useState(false);
  return <span className="entity-portrait">
    {character?.sprite && !failed ? <img src={character.sprite} alt="" onError={() => setFailed(true)} /> : <UserRound aria-hidden="true" />}
  </span>;
}
export function EntityMarker({ entity, character, selected = false }: { entity: EntitySummary; character?: EntityCharacter; selected?: boolean }) {
  return <div className={`entity-marker${selected ? " selected" : ""}`} style={{ left: `${(entity.location.x + .5) / 40 * 100}%`, top: `${(entity.location.y + .5) / 28 * 100}%` }} aria-label={`Character: ${entity.name}`}>
    <EntityPortrait key={character?.sprite || character?.id} character={character} />
    <MessageCircle className="entity-talk-icon" aria-hidden="true" />
    <span className="entity-map-name">{entity.name}</span>
  </div>;
}
function DialogueView({ entity, character, node, busy, error, onChoose, onRestart, onClose, preview = false }: {
  entity: EntitySummary; character?: EntityCharacter; node: PublicDialogue | null; busy?: boolean; error?: string;
  onChoose: (id: string) => void; onRestart: () => void; onClose: () => void; preview?: boolean;
}) {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="entity-dialogue" aria-describedby="entity-dialogue-text">
      <div className="entity-dialogue-heading"><EntityPortrait key={character?.sprite || character?.id} character={character} /><div>
        <small>{preview ? "CONVERSATION PREVIEW" : "NON-PLAYER ENTITY"}</small><DialogTitle>{entity.name}</DialogTitle>
      </div></div>
      <p id="entity-dialogue-text" className="entity-dialogue-text" aria-live="polite">{node?.text || (busy ? "Opening conversation…" : "Conversation unavailable.")}</p>
      {!!node?.choices.length && <>
        <div className="entity-dialogue-choices" aria-label="Dialogue choices">{node.choices.map((choice, i) => <button key={choice.id} type="button" className="secondary-button" disabled={busy} onClick={() => { setInput(""); setInputError(""); onChoose(choice.id); }}><b>{i + 1}.</b> {choice.label}</button>)}</div>
        <form onSubmit={e => {
          e.preventDefault(); if (busy) return;
          const choice = matchDialogueChoice(node, input);
          if (!choice) { setInputError("Enter a displayed choice number or its text."); return; }
          setInput(""); setInputError(""); onChoose(choice.id);
        }}>
          <label>Your reply<input maxLength={120} value={input} disabled={busy} aria-describedby="entity-reply-help" onChange={e => { setInput(e.target.value); setInputError(""); }} placeholder="Choice number or text" /></label>
          <button className="primary" disabled={busy || !input.trim()}>{busy ? "Speaking…" : "Reply"}</button>
        </form>
        <small id="entity-reply-help">Choose a reply above, or enter its number or text.</small>
      </>}
      {node && !node.choices.length && <p className="entity-dialogue-end">End of conversation.</p>}
      {(error || inputError) && <p className="error" role="alert">{error || inputError}</p>}
      <div className="entity-dialogue-footer"><button type="button" className="text-button" disabled={busy} onClick={() => { setInput(""); setInputError(""); onRestart(); }}>Restart conversation</button><button type="button" className="secondary-button" onClick={onClose}>Close conversation</button></div>
    </DialogContent>
  </Dialog>;
}
export function EntityPreview({ entity, character, onClose }: { entity: NonPlayerEntity; character?: EntityCharacter; onClose: () => void }) {
  const [path, setPath] = useState<string[]>([]);
  return <DialogueView preview entity={entity} character={character} node={resolveEntityDialogue(entity, path)} onChoose={id => setPath(p => [...p, id])} onRestart={() => setPath([])} onClose={onClose} />;
}
export function EntityConversation<T>({ entity, character, themeRevision, map, pos, onClose, onGameChange }: {
  entity: EntitySummary; character?: EntityCharacter; themeRevision: number; map: string; pos: { x: number; y: number }; onClose: () => void; onGameChange: (game: T) => void;
}) {
  const [node, setNode] = useState<PublicDialogue | null>(null), [path, setPath] = useState<string[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const updateGame = useRef(onGameChange);
  useEffect(() => { updateGame.current = onGameChange; }, [onGameChange]);
  const speak = useCallback(async (choices: string[]) => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, signal: current.signal,
        body: JSON.stringify({ action: "entity-dialogue", id: entity.id, choices, themeRevision, map, x: pos.x, y: pos.y }) });
      const data = await r.json() as { dialogue: PublicDialogue; game: T; error?: string };
      if (!r.ok) throw Error(data.error || "Could not speak to this character.");
      if (!current.signal.aborted) { setNode(data.dialogue); setPath(choices); updateGame.current(data.game); }
    } catch (e) { if (!current.signal.aborted) setError((e as Error).message); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }, [entity.id, themeRevision, map, pos.x, pos.y]);
  useEffect(() => { let live = true; void Promise.resolve().then(() => { if (live) void speak([]); }); return () => { live = false; controller.current?.abort(); }; }, [speak]);
  return <DialogueView entity={entity} character={character} node={node} busy={busy} error={error} onChoose={id => { if (!busy) void speak([...path, id]); }} onRestart={() => void speak([])} onClose={onClose} />;
}

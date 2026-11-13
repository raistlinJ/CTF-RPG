"use client";
// Raw sprite images also work in the standalone Vite app.
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { matchDialogueChoice, resolveEntityDialogue } from "@/lib/non-player-entities.mjs";
import type { EntityCharacter, EntityEmojiReaction, EntitySummary, NonPlayerEntity, PublicDialogue } from "@/lib/non-player-entities";
import { PlayerEmotePicker } from "./player-emotes";
import { EntityReactionAnimation } from "./entity-emoji-effects";
import { visibleSprite } from "@/lib/visible-sprite";
import { MAP_AVATAR_SIZE } from "@/lib/character-artwork";
import { entitySize } from "@/lib/entity-footprint.mjs";

export function EntityPortrait({ character, onImageLoad, onImageError }: { character?: EntityCharacter; onImageLoad?: (image: HTMLImageElement) => void; onImageError?: () => void }) {
  const [failed, setFailed] = useState(false);
  return <span className="entity-portrait">
    {character?.sprite && !failed ? <img src={character.sprite} alt="" onLoad={e => onImageLoad?.(e.currentTarget)} onError={() => { setFailed(true); onImageError?.(); }} /> : <UserRound aria-hidden="true" />}
  </span>;
}
export function EntityMarker({ entity, character, selected = false, showName = false, revealInvisible = false }: { entity: EntitySummary; character?: EntityCharacter; selected?: boolean; showName?: boolean; revealInvisible?: boolean }) {
  const [artwork, setArtwork] = useState<{ source: string; width: number; height: number; left: number; top: number; right: number } | null>(null);
  if (entity.invisible && !revealInvisible) return null;
  const bounds = artwork?.source === character?.sprite ? artwork : null;
  const size = entitySize(entity);
  const visualSize = size * MAP_AVATAR_SIZE / 24;
  const style = {
    left: `${(entity.location.x + size / 2) / 40 * 100}%`, top: `${(entity.location.y + size / 2) / 28 * 100}%`,
    width: `${visualSize / 40 * 100}%`, height: `${visualSize / 28 * 100}%`,
    ...(bounds && { "--entity-image-width": `${bounds.width}%`, "--entity-image-height": `${bounds.height}%`, "--entity-image-left": `${bounds.left}%`, "--entity-image-top": `${bounds.top}%`, "--entity-visible-right": `${bounds.right}%` }),
  } as CSSProperties;
  return <>{selected && <div className="entity-footprint" style={{ left: `${entity.location.x / 40 * 100}%`, top: `${entity.location.y / 28 * 100}%`, width: `${size / 40 * 100}%`, height: `${size / 28 * 100}%` }} />}<div className={`entity-marker${entity.invisible ? " is-invisible" : ""}`} style={style} data-entity-id={entity.id} aria-label={showName ? `${entity.invisible ? "Hidden character" : "Character"}: ${entity.name}` : "Non-player character"}>
    <EntityPortrait key={character?.sprite || character?.id} character={character} onImageError={() => setArtwork(null)} onImageLoad={image => {
      const visible = visibleSprite(image);
      // Match drawCharacter: size the visible artwork by height, excluding padding.
      setArtwork({ source: character!.sprite!, width: image.naturalWidth / visible.h * 100, height: image.naturalHeight / visible.h * 100,
        left: (0.5 - (visible.x + visible.w / 2) / visible.h) * 100, top: -visible.y / visible.h * 100,
        right: (0.5 + visible.w / visible.h / 2) * 100 });
    }} />
    <MessageCircle className="entity-talk-icon" aria-hidden="true" />
    {showName && <span className="entity-map-name">{entity.name}{entity.invisible && " · hidden"}</span>}
  </div></>;
}
function DialogueView({ entity, character, node, busy, error, onChoose, onClose, preview = false, onEmoji, reaction }: {
  entity: EntitySummary; character?: EntityCharacter; node: PublicDialogue | null; busy?: boolean; error?: string;
  onChoose: (id: string) => void; onClose: () => void; preview?: boolean;
  onEmoji?: (emoji:string)=>void; reaction?:EntityEmojiReaction | null;
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
      {onEmoji && <section className="entity-emoji-commands" aria-label="Send an emoji to this character">
        <PlayerEmotePicker onSelect={onEmoji} disabled={busy} description="" />
        {reaction && <div className="entity-emoji-dialogue-reply" role="status">{preview && reaction.matched && <EntityReactionAnimation effect={reaction.effect}/>}<p>{reaction.response}</p></div>}
      </section>}
      {(error || inputError) && <p className="error" role="alert">{error || inputError}</p>}
      <div className="entity-dialogue-footer"><button type="button" className="secondary-button" onClick={onClose}>Close conversation</button></div>
    </DialogContent>
  </Dialog>;
}
export function EntityPreview({ entity, character, onClose }: { entity: NonPlayerEntity; character?: EntityCharacter; onClose: () => void }) {
  const [path, setPath] = useState<string[]>([]);
  const [reaction,setReaction]=useState<EntityEmojiReaction|null>(null);
  return <DialogueView preview entity={entity} character={character} node={resolveEntityDialogue(entity, path)} onChoose={id => {setReaction(null);setPath(p => [...p, id]);}} onClose={onClose}
    reaction={reaction} onEmoji={emoji=>{
      const rule=entity.emojiInteractions?.find(item=>item.emoji===emoji);
      setReaction(rule?{...rule,matched:true,firstDiscovery:false,preview:true}:{matched:false,emoji,response:`${emoji} Sent`,effect:"none",firstDiscovery:false});
    }} />;
}
export function EntityConversation<T>({ entity, character, themeRevision, map, pos, onClose, onGameChange, onReaction }: {
  entity: EntitySummary; character?: EntityCharacter; themeRevision: number; map: string; pos: { x: number; y: number }; onClose: () => void; onGameChange: (game: T) => void;
  onReaction?: (reaction:EntityEmojiReaction)=>void;
}) {
  const [node, setNode] = useState<PublicDialogue | null>(null), [path, setPath] = useState<string[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [reaction,setReaction]=useState<EntityEmojiReaction|null>(null);
  const session = useRef(crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const reacting = useRef(false);
  const updateGame = useRef(onGameChange);
  useEffect(() => { updateGame.current = onGameChange; }, [onGameChange]);
  const speak = useCallback(async (choices: string[]) => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, signal: current.signal,
        body: JSON.stringify({ action: "entity-dialogue", id: entity.id, choices, session: session.current, themeRevision, map, x: pos.x, y: pos.y }) });
      const data = await r.json() as { dialogue: PublicDialogue; game: T; error?: string };
      if (!r.ok) throw Error(data.error || "Could not speak to this character.");
      if (!current.signal.aborted) { setNode(data.dialogue); setPath(choices); updateGame.current(data.game); }
    } catch (e) { if (!current.signal.aborted) setError((e as Error).message); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }, [entity.id, themeRevision, map, pos.x, pos.y]);
  useEffect(() => { let live = true; void Promise.resolve().then(() => { if (live) void speak([]); }); return () => { live = false; controller.current?.abort(); }; }, [speak]);
  async function react(emoji:string) {
    if(busy||reacting.current)return;
    reacting.current=true;
    controller.current?.abort();
    const request=new AbortController();controller.current=request;
    setBusy(true);setError("");setReaction(null);
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;request.abort();},12000);
    try {
      const response=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json"},signal:request.signal,
        body:JSON.stringify({action:"entity-emoji",id:entity.id,emoji,themeRevision,map,x:pos.x,y:pos.y})});
      const data=await response.json() as {reaction:EntityEmojiReaction;game?:T;error?:string};
      if(!response.ok)throw Error(data.error||"Could not send this emoji.");
      if(!request.signal.aborted){
        if(data.game)updateGame.current(data.game);
        setReaction(data.reaction);
        onReaction?.(data.reaction);
      }
    }catch(cause){if(!request.signal.aborted||timedOut)setError(timedOut?"The character did not respond. Please try again.":(cause as Error).message);}
    finally{clearTimeout(timeout);reacting.current=false;if(!request.signal.aborted||timedOut)setBusy(false);}
  }
  return <DialogueView entity={entity} character={character} node={node} busy={busy} error={error} reaction={reaction}
    onEmoji={emoji=>void react(emoji)} onChoose={id => { if (!busy){setReaction(null);void speak([...path, id]);} }} onClose={onClose} />;
}

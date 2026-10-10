"use client";
import { useState } from "react";
import { KeyRound, WandSparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { KEY_PALETTE, normalizeIncantation } from "@/lib/inventory-data.mjs";

export type Inventory = { keys: string[]; incantations: string[] };
export type LockedTransport = { id: string; name: string; lock: { type: string; color?: string }; map: string; x: number; y: number; dx: number; dy: number };
export function PlayerInventory({ open, onOpenChange, items }: { open: boolean; onOpenChange: (open: boolean) => void; items: Inventory }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="inventory-modal" aria-describedby="inventory-help">
      <DialogTitle>Inventory</DialogTitle>
      <p id="inventory-help">Solve challenges to earn keys and learn incantations. Keys are reusable; unlocked routes stay open for you.</p>
      <section aria-label="Keys"><h3><KeyRound size={18} /> Keys</h3>
        {items.keys.length ? <ul className="inventory-keys">{items.keys.map(color => <li key={color}>
          <KeyRound size={22} style={{ color: KEY_PALETTE[color as keyof typeof KEY_PALETTE] }} /><span>{color} key</span>
        </li>)}</ul> : <p>No keys yet.</p>}
      </section>
      <section aria-label="Incantations"><h3><WandSparkles size={18} /> Incantations</h3>
        {items.incantations.length ? <ul className="inventory-incantations">{items.incantations.map(phrase => <li key={phrase}>{phrase}</li>)}</ul> : <p>No incantations learned yet.</p>}
      </section>
    </DialogContent>
  </Dialog>;
}
export function TransportUnlock({ target, items, onClose, onUnlock }: { target: LockedTransport; items: Inventory; onClose: () => void; onUnlock: (phrase: string) => Promise<void> }) {
  const [phrase, setPhrase] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyLock = target.lock.type === "key";
  const matchingPhrases = items.incantations.filter(p => normalizeIncantation(p).includes(normalizeIncantation(phrase)));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="inventory-modal" aria-describedby="transport-lock-help" showCloseButton={!busy} onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogTitle>{keyLock ? "Locked door" : "Locked portal"}</DialogTitle>
      <p>{target.name}</p>
      <p id="transport-lock-help">{keyLock
        ? `A ${target.lock.color} key is needed to proceed.`
        : "An incantation is required to open this portal."}</p>
      <form onSubmit={async e => {
        e.preventDefault(); if (busy) return;
        if (keyLock && (selectedKey !== target.lock.color || !items.keys.includes(selectedKey))) {
          setError(`Select a ${target.lock.color} key to open this door.`); return;
        }
        if (!keyLock && !phrase.trim()) return;
        setBusy(true); setError("");
        try { await onUnlock(phrase); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>
        {keyLock && <fieldset className="inventory-key-picker" disabled={busy}>
          <legend>Inventory — select a key</legend>
          {items.keys.length ? <ul className="inventory-keys">{items.keys.map(color => <li key={color}>
            <label className="inventory-key-choice">
              <input type="radio" name="inventory-key" value={color} checked={selectedKey === color} onChange={() => { setSelectedKey(color); setError(""); }} />
              <KeyRound aria-hidden="true" size={22} style={{ color: KEY_PALETTE[color as keyof typeof KEY_PALETTE] }} /><span>{color} key</span>
            </label>
          </li>)}</ul> : <p>No keys yet. Solve challenges to earn keys.</p>}
          {!!items.keys.length && !items.keys.includes(target.lock.color ?? "") && <p>You don’t have a {target.lock.color} key yet.</p>}
        </fieldset>}
        {!keyLock && <>
          <label>Search incantations<input type="search" autoFocus value={phrase} disabled={busy} required maxLength={80} onChange={e => { setPhrase(e.target.value); setError(""); }} placeholder="Search or enter a short phrase" aria-describedby="incantation-search-help" /></label>
          <p id="incantation-search-help">Select a learned phrase below or enter an incantation. Case and extra spaces are ignored.</p>
          <section aria-label="Learned incantations"><h3><WandSparkles size={18} /> Learned incantations</h3>
            {matchingPhrases.length ? <ul className="inventory-incantations inventory-phrase-picker">{matchingPhrases.map(p => <li key={p}>
              <button type="button" disabled={busy} aria-pressed={phrase === p} onClick={() => { setPhrase(p); setError(""); }}>{p}</button>
            </li>)}</ul> : <p role="status">{items.incantations.length ? "No learned incantations match your search. You can still submit the phrase you entered." : "No incantations learned yet. You can enter a phrase above."}</p>}
          </section>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="transport-unlock-actions">
          <button className="primary" disabled={busy || (keyLock ? !selectedKey : !phrase.trim())}>{busy ? "Unlocking…" : keyLock ? "Use selected key" : "Submit"}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

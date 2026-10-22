"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useId, useRef, useState } from "react";

export default function SolvedAnswer({ challengeId }: { challengeId: string }) {
  const [answer, setAnswer] = useState<string | null | undefined>(undefined);
  const [shown, setShown] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const answerId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  async function toggle() {
    if (busy) return;
    if (shown) { setShown(false); return; }
    if (answer !== undefined) { setShown(true); return; }
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/game", { method: "POST", headers: {"Content-Type":"application/json"}, signal: request.signal, body: JSON.stringify({action:"review-answer", id:challengeId}) });
      const d = await r.json() as {answer: string | null; error?: string};
      if (!r.ok) throw Error(d.error || "Could not load the submitted answer.");
      if (!request.signal.aborted) { setAnswer(d.answer); setShown(true); }
    } catch (e) { if (!request.signal.aborted) setError((e as Error).message); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <section className="solved-answer-review" aria-label="Submitted answer">
    <button type="button" className="secondary-button" autoFocus disabled={busy} aria-expanded={shown} aria-controls={answerId} onClick={() => void toggle()}>{busy ? "Revealing…" : shown ? "Hide answer" : "Reveal answer"}</button>
    <div id={answerId} hidden={!shown}>
      {shown && (answer === null ? <p>No submitted answer was recorded for this solve.</p> : <p className="written-answer">{answer}</p>)}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

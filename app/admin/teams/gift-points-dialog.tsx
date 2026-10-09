"use client";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { clientUuid } from "@/lib/client-uuid.mjs";
import type { Team } from "@/app/team-setup";
export default function GiftPointsDialog({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: (points: number) => Promise<void> }) {
  const [points, setPoints] = useState(""), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const saving = useRef(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const payload = JSON.stringify({ id: team.id, points: Number(points), comment: comment.trim() });
      if (request.current?.payload !== payload) request.current = { payload, id: clientUuid() };
      const r = await fetch("/api/admin/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(payload), action: "gift", awardId: request.current.id }) });
      const d = await r.json() as { error?: string };
      if (!r.ok) throw Error(d.error || "Could not gift points.");
      await onSaved(Number(points));
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving.current) onClose(); }}>
    <DialogContent className="gift-points-modal" showCloseButton={false}>
      <DialogTitle>Gift points to {team.name}</DialogTitle>
      <DialogDescription>Adds points to this team’s total. Team members can read your comment.</DialogDescription>
      <form className="admin-editor gift-points-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>Points<input type="number" required min={1} max={10000} step={1} value={points} onChange={(e) => setPoints(e.target.value)}/></label>
          <label>Comment<textarea required maxLength={1000} rows={4} value={comment} onChange={(e) => setComment(e.target.value)}/></label>
          {error && <p role="alert">{error}</p>}
          <div className="team-card-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary" disabled={!comment.trim()}>{busy ? "Gifting…" : "Gift points"}</button></div>
        </fieldset>
      </form>
    </DialogContent>
  </Dialog>;
}

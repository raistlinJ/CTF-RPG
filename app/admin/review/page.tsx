"use client";
import AdminHeader from "../admin-header";
import { useEffect, useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
type Response = {
  user: string;
  username: string;
  team: string | null;
  challenge: string;
  object: string;
  question: string;
  answer: string;
  maxPoints: number;
  hintCost: number;
  grade: number | null;
  netPoints: number | null;
  feedback: string;
  revision: number;
  submittedAt: number;
  reviewer: string | null;
};
export default function Review() {
  const [rows, setRows] = useState<Response[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [status, setStatus] = useState("pending"),
    [selected, setSelected] = useState<Response | null>(null),
    [grade, setGrade] = useState(""),
    [feedback, setFeedback] = useState(""),
    [allowed, setAllowed] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    try {
      const r = await fetch(
          `/api/admin/review?status=${status}&offset=${offset}`,
        ),
        d = (await r.json()) as {
          error?: string;
          responses: Response[];
          total: number;
        };
      if (!r.ok) {
        setAllowed(false);
        throw Error(d.error);
      }
      setRows(d.responses);
      setTotal(d.total);
      setAllowed(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    setSelected(null);
  }, [status, offset]);
  function choose(r: Response) {
    setSelected(r);
    setGrade(r.grade === null ? "" : String(r.grade));
    setFeedback(r.feedback);
    setMessage("");
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
          `/api/admin/review?status=${status}&offset=${offset}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user: selected.user,
              challenge: selected.challenge,
              revision: selected.revision,
              grade: Number(grade),
              feedback,
            }),
          },
        ),
        d = (await r.json()) as {
          error?: string;
          responses: Response[];
          total: number;
        };
      if (!r.ok) throw Error(d.error);
      setRows(d.responses);
      setTotal(d.total);
      setSelected(null);
      setMessage(
        "Grade saved. The student’s scoreboard and feedback are updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-studio">
      <AdminHeader active="review" />
      <section className="admin-workspace">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Review written answers</h1>
            <p>Award points and send feedback to each student.</p>
          </div>
          {allowed && (
            <label>
              Show responses
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setOffset(0);
                }}
              >
                <SelectTrigger aria-label="Review filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Awaiting review</SelectItem>
                  <SelectItem value="graded">Graded</SelectItem>
                  <SelectItem value="all">All responses</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {loading ? (
          <p>Loading responses…</p>
        ) : !allowed ? (
          <a href="/admin">Sign in as an admin</a>
        ) : (
          <div className="roster-columns">
            <section>
              <div className="review-summary">
                <p>
                  {total} responses · {total ? offset + 1 : 0}–
                  {Math.min(offset + 50, total)}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSelected(null);
                    void load();
                  }}
                >
                  Refresh
                </button>
              </div>
              <div className="roster-list">
                {rows.map((r) => (
                  <button
                    key={r.user + ":" + r.challenge}
                    className={
                      selected?.user === r.user &&
                      selected?.challenge === r.challenge
                        ? "selected"
                        : ""
                    }
                    onClick={() => choose(r)}
                  >
                    <div>
                      <b>{r.username}</b>
                      <small>Team: {r.team === null ? "Not recorded" : r.team || "No team"}</small>
                      <small>
                        {r.object} · {r.challenge}
                      </small>
                    </div>
                    <span>
                      {r.grade === null ? "Pending" : `${r.netPoints} pts`}
                    </span>
                  </button>
                ))}
                {!rows.length && <p>No responses in this view.</p>}
              </div>
              <div className="review-pagination">
                <button
                  className="secondary-button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </button>
                <button
                  className="secondary-button"
                  disabled={offset + 50 >= total}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next
                </button>
              </div>
            </section>
            {selected ? (
              <form className="admin-editor" onSubmit={save}>
                <h2>
                  {selected.username} · {selected.object}
                </h2>
                <p>Team: {selected.team === null ? "Not recorded" : selected.team || "No team"}</p>
                <p className="review-question">{selected.question}</p>
                <section>
                  <h3>Written response</h3>
                  <div className="written-answer">{selected.answer}</div>
                  <small>
                    Submitted {new Date(selected.submittedAt).toLocaleString()}
                  </small>
                </section>
                <label>
                  Grade before hint costs
                  <input
                    type="number"
                    min={0}
                    max={selected.maxPoints}
                    required
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  />
                </label>
                <p>
                  Maximum {selected.maxPoints} points · {selected.hintCost}{" "}
                  points spent on hints. Final award:{" "}
                  {grade === ""
                    ? "—"
                    : Math.max(0, Number(grade) - selected.hintCost)}{" "}
                  points.
                </p>
                <label>
                  Feedback
                  <textarea
                    rows={5}
                    maxLength={5000}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Explain the grade or suggest an improvement."
                  />
                </label>
                {selected.reviewer && (
                  <small>Last reviewed by {selected.reviewer}</small>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? "Saving…" : "Save grade"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setSelected(null);
                    void load();
                  }}
                >
                  Reload responses
                </button>
              </form>
            ) : (
              <section className="admin-editor">
                <p>
                  Select a written response to review. Only admins can see this
                  list.
                </p>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

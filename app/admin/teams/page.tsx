"use client";
import { useEffect, useState } from "react";
import type { Team } from "@/app/team-setup";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
export default function TeamsAdmin() {
  const [teams, setTeams] = useState<Team[]>([]),
    [members, setMembers] = useState<
      { team: string; username: string; disabled: number }[]
    >([]),
    [max, setMax] = useState(4),
    [allowed, setAllowed] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Team | null>(null);
  async function load() {
    const r = await fetch("/api/admin/teams"),
      d = (await r.json()) as {
        error?: string;
        teams: Team[];
        team: Team | null;
        maxMembers: number;
        members?: { team: string; username: string; disabled: number }[];
      };
    if (!r.ok) throw Error(d.error || "Could not load teams.");
    setTeams(d.teams);
    setMembers(d.members || []);
    setMax(d.maxMembers);
    setAllowed(true);
  }
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function mutate(method: string, body: object) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/teams", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = (await r.json()) as {
          error?: string;
          teams: Team[];
          team: Team | null;
          maxMembers: number;
          members?: { team: string; username: string; disabled: number }[];
        };
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      await load();
      setMessage(
        method === "DELETE"
          ? "Team disbanded. Members will choose a team again."
          : "Team limit saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setSelected(null);
    }
  }
  return (
    <main className="admin-studio">
      <header>
        <a className="brand" href="/">
          QUEST <b>STUDIO</b>
        </a>
        <nav className="admin-header-links">
          <a href="/admin/packs">Themes &amp; content</a>
          <a href="/admin/review">Review answers</a>
          <a href="/admin">Challenges</a>
          <a href="/admin/users">Accounts</a>
          <a href="/scoreboard">Scores</a>
          <a href="/">Game</a>
        </nav>
      </header>
      <section className="admin-workspace">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Manage teams</h1>
          </div>
          {allowed && (
            <a className="secondary-button" href="/api/admin/backup">
              Full backup
            </a>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading ? (
          <p>Loading teams…</p>
        ) : !allowed ? (
          <a href="/admin">Sign in as an admin</a>
        ) : (
          <>
            <form
              className="team-limit admin-editor"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("POST", { maxMembers: max });
              }}
            >
              <label>
                Maximum explorers per team
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                />
              </label>
              <p>
                The creator counts as a member. Lowering the limit keeps
                existing members and prevents new joins to full teams. Disabled
                accounts still occupy their place.
              </p>
              <button className="primary" disabled={busy}>
                Save team limit
              </button>
            </form>
            <div className="team-admin-list">
              {teams.map((t) => (
                <article className="admin-editor" key={t.id}>
                  <h2>{t.name}</h2>
                  <p>
                    {t.members} / {max} explorers
                  </p>
                  <p>
                    {members
                      .filter((m) => m.team === t.id)
                      .map(
                        (m) => m.username + (m.disabled ? " (disabled)" : ""),
                      )
                      .join(", ") || "No members"}
                  </p>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setSelected(t)}
                  >
                    Disband team
                  </button>
                </article>
              ))}
              {!teams.length && (
                <p>
                  No teams yet. Students create or join a team after signing in.
                </p>
              )}
            </div>
          </>
        )}
      </section>
      <AlertDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disband {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              All members will need to create or join a team. Their accounts and
              earned points stay saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selected) void mutate("DELETE", { id: selected.id });
              }}
            >
              Disband team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

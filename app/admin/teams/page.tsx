"use client";
import AdminHeader from "../admin-header";
import TeamsNav from "./teams-nav";
import GiftPointsDialog from "./gift-points-dialog";
import { useEffect, useState } from "react";
import TeamPanel from "@/app/team-panel";
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
    [viewedTeam, setViewedTeam] = useState<string | null>(null),
    [panelOpen, setPanelOpen] = useState(false),
    [giftTeam, setGiftTeam] = useState<Team | null>(null),
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
    void Promise.resolve().then(() => load())
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
      <AdminHeader active="teams" />
      <section className="admin-workspace">
        <TeamsNav active="manage" />
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
            <div className="team-admin-list">
              {teams.map((t) => (
                <article className="admin-editor" key={t.id}>
                  <button
                    className="text-button"
                    onClick={() => {
                      setViewedTeam(t.id);
                      setPanelOpen(true);
                    }}
                  >
                    <h2>{t.name}</h2>
                  </button>
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
                  <p><strong>{(t.score || 0).toLocaleString()} points</strong> · {t.pointAwards?.reduce((sum, a) => sum + a.points, 0).toLocaleString() || "0"} gifted</p>
                  {!!t.pointAwards?.length && <details className="team-gift-history"><summary>Point gift history</summary><ul>{t.pointAwards.map((a) => <li key={a.id}><strong>+{a.points.toLocaleString()} points</strong><p>{a.comment}</p><small>{a.awarded_by} · {new Date(a.created_at).toLocaleString()}</small></li>)}</ul></details>}
                  <div className="team-card-actions">
                  <button type="button" className="primary" disabled={busy} onClick={() => { setMessage(""); setError(""); setGiftTeam(t); }}>Gift points</button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setSelected(t)}
                  >
                    Disband team
                  </button>
                  </div>
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
      {giftTeam && <GiftPointsDialog team={giftTeam} onClose={() => setGiftTeam(null)} onSaved={async (points) => {
        await load();
        setMessage(`Gifted ${points.toLocaleString()} points to ${giftTeam.name}.`);
      }}/>}
      <TeamPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        selected={viewedTeam}
        onSelect={setViewedTeam}
        onRead={() => {}}
      />
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
              earned points stay saved. Team point gifts are removed with the team.
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

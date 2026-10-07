"use client";
import { useEffect, useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import ScoreboardControls from "../scoreboard-controls";
import TeamPanel from "@/app/team-panel";
import type { TeamFeatures } from "@/app/team-panel";
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
    [visibility, setVisibility] = useState("team"),
    [features, setFeatures] = useState<TeamFeatures>({
      names: true,
      scores: true,
      messaging: true,
      everyone: { names: true, scores: true, messaging: true },
      revision: 0,
    }),
    [presenceRevision, setPresenceRevision] = useState(0),
    [viewedTeam, setViewedTeam] = useState<string | null>(null),
    [panelOpen, setPanelOpen] = useState(false),
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
    const presenceResponse = await fetch("/api/admin/presence"),
      presence = (await presenceResponse.json()) as {
        error?: string;
        visibility: string;
        revision: number;
      };
    if (!presenceResponse.ok)
      throw Error(presence.error || "Could not load player visibility.");
    setVisibility(presence.visibility);
    setPresenceRevision(presence.revision);
    const featuresResponse = await fetch("/api/admin/team-social"),
      flags = (await featuresResponse.json()) as TeamFeatures & {
        error?: string;
      };
    if (!featuresResponse.ok)
      throw Error(flags.error || "Could not load team features.");
    setFeatures(flags);
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
  async function saveVisibility(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility, revision: presenceRevision }),
        }),
        d = (await r.json()) as { error?: string; revision: number };
      if (!r.ok) throw Error(d.error);
      setPresenceRevision(d.revision);
      setMessage("Player visibility saved. Active games update automatically.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveFeatures(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/team-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(features),
        }),
        d = (await r.json()) as TeamFeatures & { error?: string };
      if (!r.ok) throw Error(d.error);
      setFeatures(d);
      setMessage("Team features saved. Active games update automatically.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-studio">
      <header>
        <a className="brand" href="/">
          CTF-RPG <b>STUDIO</b>
        </a>
        <nav className="admin-header-links">
          <a href="/admin/theme">Theme</a>
          <a href="/admin/notifications">Notifications</a>
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
            <ScoreboardControls />
            <form className="team-limit admin-editor" onSubmit={saveVisibility}>
              <label>
                Players visible on the map
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger aria-label="Player visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">Teammates only</SelectItem>
                    <SelectItem value="all">All players</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <p>
                Shows active explorers on the same map. Positions update every 3
                seconds; hidden tabs pause updates.
              </p>
              <button className="primary" disabled={busy}>
                Save player visibility
              </button>
            </form>
            <form className="team-limit admin-editor" onSubmit={saveFeatures}>
              <h2>Team cards &amp; messages</h2>
              <fieldset className="team-feature-scope">
                <legend>Your team</legend>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.names}
                    onCheckedChange={(value) =>
                      setFeatures({ ...features, names: value === true })
                    }
                  />
                  Show your team’s name
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.scores}
                    onCheckedChange={(value) =>
                      setFeatures({ ...features, scores: value === true })
                    }
                  />
                  Show your team’s score
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.messaging}
                    onCheckedChange={(value) =>
                      setFeatures({ ...features, messaging: value === true })
                    }
                  />
                  Enable messages within your team
                </label>
              </fieldset>
              <fieldset className="team-feature-scope">
                <legend>Other teams · All players</legend>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.everyone.names}
                    onCheckedChange={(value) =>
                      setFeatures({
                        ...features,
                        everyone: {
                          ...features.everyone,
                          names: value === true,
                        },
                      })
                    }
                  />
                  Show other teams’ names
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.everyone.scores}
                    onCheckedChange={(value) =>
                      setFeatures({
                        ...features,
                        everyone: {
                          ...features.everyone,
                          scores: value === true,
                        },
                      })
                    }
                  />
                  Show other teams’ scores
                </label>
                <label className="admin-checkbox">
                  <Checkbox
                    checked={features.everyone.messaging}
                    onCheckedChange={(value) =>
                      setFeatures({
                        ...features,
                        everyone: {
                          ...features.everyone,
                          messaging: value === true,
                        },
                      })
                    }
                  />
                  Enable messages between teams
                </label>
              </fieldset>
              <p>
                Other-team controls apply in the team list and when clicking
                players from another team in All players mode. Your-team
                controls apply to each student’s own team. Hidden names use a
                team reference. Disabled conversations stay saved.
              </p>
              <button className="primary" disabled={busy}>
                Save team features
              </button>
            </form>
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

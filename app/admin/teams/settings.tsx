"use client";
import AdminHeader from "../admin-header";
import TeamsNav from "./teams-nav";
import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { TeamFeatures } from "@/app/team-panel";
export default function TeamSettings({ section }: { section: "configuration" | "players" }) {
  const [max, setMax] = useState(4),
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
    [presenceRevision, setPresenceRevision] = useState(0);
  const load = useCallback(async () => {
    if (section === "configuration") {
      const r = await fetch("/api/admin/teams"),
        d = (await r.json()) as { error?: string; maxMembers: number };
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      setMax(d.maxMembers);
      setAllowed(true);
      return;
    }
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
    setAllowed(true);
  }, [section]);
  useEffect(() => {
    void Promise.resolve().then(() => load())
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  async function saveLimit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/admin/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({maxMembers: max}),
        }),
        d = (await r.json()) as {
          error?: string;
          maxMembers: number;
          };
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      setMax(d.maxMembers);
      setMessage("Team limit saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
      <AdminHeader active="teams" />
      <section className="admin-workspace">
        <TeamsNav active={section} />
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>{section === "configuration" ? "Team size" : "Players & messages"}</h1>
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
          <p>Loading settings…</p>
        ) : !allowed ? (
          <a href="/admin">Sign in as an admin</a>
        ) : (
          <>
            {section === "configuration" && <form
              className="team-limit admin-editor"
              onSubmit={saveLimit}
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
            </form>}
            {section === "players" && <>
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
            </>}
          </>
        )}
      </section>
    </main>
  );
}

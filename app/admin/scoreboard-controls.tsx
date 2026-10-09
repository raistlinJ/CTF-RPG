"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
type Settings = {
  visibility: "admins" | "all";
  mode: "team" | "individual";
  revision: number;
};
export default function ScoreboardControls() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/scoreboard")
      .then(async (r) => {
        const d = (await r.json()) as Settings & { error?: string };
        if (!r.ok)
          throw Error(d.error || "Could not load scoreboard settings.");
        if (live) setSettings(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const r = await fetch("/api/admin/scoreboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const d = (await r.json()) as Settings & { error?: string };
      if (!r.ok) throw Error(d.error || "Could not save scoreboard settings.");
      setSettings(d);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="team-limit admin-editor" onSubmit={save}>
      <h2>Scoreboard</h2>
      <p>Players see team scores. Admins can switch between user and team scores.</p>
      {settings && (
        <>
          <label>
            Who can see the scoreboard
            <select
              aria-label="Scoreboard visibility"
              value={settings.visibility}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  visibility: e.target.value as Settings["visibility"],
                });
                setSaved(false);
              }}
            >
              <option value="all">All signed-in players</option>
              <option value="admins">Administrators only</option>
            </select>
          </label>
          <label>
            Default admin scores
            <select
              aria-label="Default admin scores"
              value={settings.mode}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  mode: e.target.value as Settings["mode"],
                });
                setSaved(false);
              }}
            >
              <option value="individual">User scores</option>
              <option value="team">Team scores</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save scoreboard settings"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Scoreboard settings saved.</p>}
    </form>
  );
}

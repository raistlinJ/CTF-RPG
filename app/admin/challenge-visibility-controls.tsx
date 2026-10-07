"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
type Settings = {
  visibility: "admins" | "all";
  revision: number;
};
export default function ChallengeVisibilityControls() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/challenge-visibility")
      .then(async (r) => {
        const d = (await r.json()) as Settings & { error?: string };
        if (!r.ok)
          throw Error(d.error || "Could not load challenge visibility settings.");
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
      const r = await fetch("/api/admin/challenge-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const d = (await r.json()) as Settings & { error?: string };
      if (!r.ok) throw Error(d.error || "Could not save challenge visibility settings.");
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
      <h2>Challenge visibility</h2>
      <p>Admins-only hides every challenge from students. All shows challenges marked Visible; admins can always see and test hidden challenges.</p>
      {settings && (
        <>
          <label>
            Who can see challenges
            <select
              aria-label="Global challenge visibility"
              value={settings.visibility}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  visibility: e.target.value as Settings["visibility"],
                });
                setSaved(false);
              }}
            >
              <option value="all">All</option>
              <option value="admins">Admins-only</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save challenge visibility settings"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Challenge visibility settings saved.</p>}
    </form>
  );
}

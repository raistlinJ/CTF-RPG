"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { useEffect, useState } from "react";
type Settings = { visibility: "admins" | "all"; revision: number };
export default function ChallengeVisibilityControls() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/admin/challenge-visibility")
      .then(async (r) => {
        const d = await r.json() as Settings & {error?: string};
        if (!r.ok) throw Error(d.error || "Could not load challenge availability.");
        if (live) setSettings(d);
      })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  async function save(visibility: Settings["visibility"]) {
    if (!settings || busy || settings.visibility === visibility) return;
    setBusy(true);
    setError("");
    setStatus("Saving…");
    try {
      const r = await fetch("/api/admin/challenge-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, visibility }),
      });
      const d = await r.json() as Settings & {error?: string};
      if (!r.ok) {
        if (r.status === 409) {
          const latest = await fetch("/api/admin/challenge-visibility");
          if (latest.ok) setSettings(await latest.json() as Settings);
        }
        throw Error(d.error || "Could not save challenge availability.");
      }
      setSettings(d);
      setStatus("Saved");
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
    } finally { setBusy(false); }
  }
  return (
    <div className="challenge-availability">
      <label>
        <span>Challenges Availability</span>
        <select aria-label="Challenges Availability" value={settings?.visibility || "all"}
          disabled={!settings || busy}
          title="All makes Visible challenges available to students. Admins-only restricts all challenges to admins."
          onChange={(e) => void save(e.target.value as Settings["visibility"])}>
          <option value="all">All</option>
          <option value="admins">Admins-only</option>
        </select>
      </label>
      {status && <small role="status">{status}</small>}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

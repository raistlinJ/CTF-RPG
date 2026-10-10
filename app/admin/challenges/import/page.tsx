"use client";
import { useCallback, useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ChallengeNav from "../challenge-nav";
import CtfdImporter from "../../theme/import-export/ctfd-importer";

export default function ChallengeImportPage() {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/packs");
    if (!r.ok) {
      const data = await r.json() as { error?: string };
      throw Error(data.error || "Administrator access required.");
    }
    setAllowed(true);
  }, []);
  useEffect(() => { void Promise.resolve().then(load).catch(e => setError(e.message)); }, [load]);
  return <main className="admin-studio">
    <AdminHeader active="challenges" />
    <section className="admin-workspace">
      <ChallengeNav active="import" />
      <h1>Import from CTFd</h1>
      <p className="admin-page-description">Preview challenges, accounts, and teams before importing them into your current world.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {allowed ? <CtfdImporter onImported={load} /> : error ? <a href="/admin">Sign in as an admin</a> : <p>Loading importer…</p>}
    </section>
  </main>;
}

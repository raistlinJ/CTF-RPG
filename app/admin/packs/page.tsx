"use client";
import { useEffect, useState } from "react";
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
type State = {
  theme: {
    title: string;
    world: { maps: { id: string; name: string }[] };
    characters: { id: string; name: string }[];
  };
  themeRevision: number;
  contentRevision: number;
  challengeCount: number;
};
export default function PacksAdmin() {
  const [state, setState] = useState<State | null>(null),
    [theme, setTheme] = useState<File | null>(null),
    [content, setContent] = useState<File | null>(null),
    [paired, setPaired] = useState<File | null>(null),
    [pending, setPending] = useState<"theme" | "content" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    const r = await fetch("/api/admin/packs"),
      d = (await r.json()) as State & { error?: string };
    if (!r.ok) throw Error(d.error || "Administrator access required.");
    setState(d);
  }
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function apply() {
    if (!pending || !state) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData();
    form.set("file", pending === "theme" ? theme! : content!);
    if (pending === "theme" && paired) form.set("content", paired);
    form.set("themeRevision", String(state.themeRevision));
    form.set("contentRevision", String(state.contentRevision));
    try {
      const r = await fetch("/api/admin/packs?kind=" + pending, {
          method: "POST",
          body: form,
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "Could not import pack.");
      await load();
      setMessage(
        "Import complete. Reload the game and map editor to use the updated packs.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }
  function choose(file: File | undefined, set: (f: File | null) => void) {
    setError("");
    if (file && file.size > 8 * 1024 * 1024) {
      set(null);
      setError("Each ZIP must be at most 8 MB.");
    } else set(file || null);
  }
  return (
    <main className="admin-studio">
      <header>
        <a className="brand" href="/">
          QUEST <b>STUDIO</b>
        </a>
        <nav className="admin-header-links">
          <a href="/admin/teams">Manage</a>
          <a href="/admin">Challenges</a>
          <a href="/admin/users">Accounts</a>
          <a href="/">Game</a>
        </nav>
      </header>
      <section className="admin-workspace">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Themes &amp; content</h1>
            <p>Reuse your world and your challenges independently.</p>
          </div>
          {state && (
            <a className="secondary-button" href="/api/admin/backup">
              Full backup
            </a>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {loading ? (
          <p>Loading packs…</p>
        ) : !state ? (
          <a href="/admin">Sign in as an admin</a>
        ) : (
          <>
            <div className="pack-grid">
              <section className="admin-editor">
                <span className="eyebrow">THEME PACK</span>
                <h2>{state.theme.title}</h2>
                <p>
                  {state.theme.world.maps.length} maps ·{" "}
                  {state.theme.characters.length} characters
                </p>
                <p>
                  Map layouts and artwork, entrances, collision rules, character
                  names and sprites, and music.
                </p>
                <a
                  className="secondary-button"
                  href="/api/admin/packs?kind=theme"
                >
                  Export theme ZIP
                </a>
                <label>
                  Import theme ZIP
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => choose(e.target.files?.[0], setTheme)}
                  />
                </label>
                <label>
                  Matching content ZIP (optional)
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => choose(e.target.files?.[0], setPaired)}
                  />
                </label>
                <small>
                  Include matching content when the new maps change challenge
                  locations. Both are checked and applied together.
                </small>
                <button
                  className="primary"
                  disabled={busy || !theme}
                  onClick={() => setPending("theme")}
                >
                  Import theme
                </button>
              </section>
              <section className="admin-editor">
                <span className="eyebrow">CONTENT PACK</span>
                <h2>Challenge collection</h2>
                <p>{state.challengeCount} challenges</p>
                <p>
                  Challenge text, flags, points, hints and their costs, map
                  locations, and downloadable files.
                </p>
                <a
                  className="secondary-button"
                  href="/api/admin/packs?kind=content"
                >
                  Export content ZIP
                </a>
                <label>
                  Import content ZIP
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(e) => choose(e.target.files?.[0], setContent)}
                  />
                </label>
                <small>
                  Replaces the challenge collection. Use different challenge and
                  hint IDs for a new activity to keep past awards and hint
                  purchases distinct.
                </small>
                <button
                  className="primary"
                  disabled={busy || !content}
                  onClick={() => setPending("content")}
                >
                  Import content
                </button>
              </section>
            </div>
            <p className="pack-note">
              Theme and content packs exclude accounts, passwords, teams, and
              scores. Use Full backup to preserve the complete system. Local
              files are bundled; HTTPS download links keep pointing to their
              original hosts.
            </p>
          </>
        )}
      </section>
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {pending} pack?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "theme"
                ? "This replaces the active world, characters, sprites, and music."
                : "This replaces the active challenge collection."}
              {pending === "theme" && paired
                ? " The selected content pack replaces challenges in the same operation."
                : ""}{" "}
              Accounts, teams, and recorded points stay saved. Export the
              current pack first if you want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
            >
              {busy ? "Importing…" : "Apply import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

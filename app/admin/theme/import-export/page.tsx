"use client";
import AdminHeader from "../../admin-header";
import { useEffect, useState } from "react";
import CtfdImporter from "./ctfd-importer";
import ThemeNav from "../theme-nav";
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
  presets: {
    id: string;
    title: string;
    description: string;
    preview: string;
  }[];
};
type Placement = {
  kept: number;
  moved: {
    id: string;
    object: string;
    from: { map: string; x: number; y: number };
    to: { map: string; x: number; y: number };
  }[];
  excluded: { id: string; object: string }[];
};
export default function PacksAdmin() {
  const [state, setState] = useState<State | null>(null),
    [theme, setTheme] = useState<File | null>(null),
    [content, setContent] = useState<File | null>(null),
    [paired, setPaired] = useState<File | null>(null),
    [pending, setPending] = useState<"theme" | "content" | null>(null),
    [overflow, setOverflow] = useState<Placement | null>(null),
    [result, setResult] = useState<Placement | null>(null),
    [preparingPreset, setPreparingPreset] = useState<string | null>(null),
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
  async function apply(dropOverflow = false) {
    if (!pending || !state) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData();
    form.set("file", pending === "theme" ? theme! : content!);
    if (pending === "theme" && paired) form.set("content", paired);
    if (dropOverflow) form.set("dropOverflow", "true");
    form.set("themeRevision", String(state.themeRevision));
    form.set("contentRevision", String(state.contentRevision));
    let awaitingDecision = false;
    try {
      const r = await fetch("/api/admin/packs?kind=" + pending, {
          method: "POST",
          body: form,
        }),
        d = (await r.json()) as {
          error?: string;
          needsDecision?: boolean;
          placement?: Placement;
        };
      if (!r.ok) throw Error(d.error || "Could not import pack.");
      if (d.needsDecision && d.placement) {
        awaitingDecision = true;
        setOverflow(d.placement);
        return;
      }
      setResult(d.placement || null);
      setOverflow(null);
      await load();
      setMessage(
        "Import complete. Reload the game and map editor to use the updated packs.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (!awaitingDecision) {
        setPending(null);
        setOverflow(null);
      }
    }
  }
  async function usePreset(id: string) {
    setPreparingPreset(id);
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/admin/packs?kind=theme&preset=" + encodeURIComponent(id),
      );
      if (!r.ok) {
        const d = (await r.json()) as { error?: string };
        throw Error(d.error || "Could not load theme.");
      }
      setTheme(
        new File([await r.blob()], id + ".zip", { type: "application/zip" }),
      );
      setPaired(null);
      setOverflow(null);
      setPending("theme");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparingPreset(null);
      setBusy(false);
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
      <AdminHeader active="theme" />
      <section className="admin-workspace">
        <ThemeNav active="import-export" />
        <div className="roster-heading">
          <div>
            <span className="eyebrow">ADMIN STUDIO</span>
            <h1>Import / Export</h1>
            <p>Reuse your world and your challenges independently.</p>
          </div>
          {state && (
            <a className="secondary-button" href="/api/admin/backup">
              Full backup
            </a>
          )}
        </div>
        {state && <CtfdImporter onImported={load}/>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {message &&
          result &&
          (result.moved.length > 0 || result.excluded.length > 0) && (
            <section aria-label="Placement report">
              <p>
                {result.kept} challenges placed · {result.moved.length} moved ·{" "}
                {result.excluded.length} excluded.
              </p>
              <details>
                <summary>View placement changes</summary>
                <ul>
                  {result.moved.map((c) => (
                    <li key={c.id}>
                      {c.object} ({c.id}): {c.from.map} ({c.from.x}, {c.from.y})
                      → {c.to.map} ({c.to.x}, {c.to.y})
                    </li>
                  ))}
                  {result.excluded.map((c) => (
                    <li key={c.id}>
                      Excluded: {c.object} ({c.id})
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        {loading ? (
          <p>Loading packs…</p>
        ) : !state ? (
          <a href="/admin">Sign in as an admin</a>
        ) : (
          <>
            {state.presets?.map((p) => (
              <section className="preset-card" key={p.id}>
                <img src={p.preview} alt={p.title + " world preview"} />
                <div>
                  <span className="eyebrow">COURSE THEME</span>
                  <h2>{p.title}</h2>
                  <p>{p.description}</p>
                  <p>
                    Reasoning Core · Tool Workshop · Memory Lab · API Gateway ·
                    Evaluation Lab · Safety Lab
                  </p>
                  <div className="admin-actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void usePreset(p.id)}
                    >
                      {preparingPreset === p.id
                        ? "Preparing theme…"
                        : "Use this theme"}
                    </button>
                    <a
                      className="secondary-button"
                      href={"/api/admin/packs?kind=theme&preset=" + p.id}
                    >
                      Download theme ZIP
                    </a>
                  </div>
                  {preparingPreset === p.id && (
                    <p role="status">
                      Loading the theme. A confirmation will appear when it is
                      ready.
                    </p>
                  )}
                  <small>
                    Changes the world and explorers. Your current questions,
                    accounts, and scores stay saved.
                  </small>
                </div>
              </section>
            ))}
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
                  Invalid or overlapping positions move to the nearest free,
                  reachable tile. If all maps fill up, you choose whether to
                  exclude the extras or cancel.
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
          if (!open && !busy) {
            setPending(null);
            setOverflow(null);
          }
        }}
      >
        <AlertDialogContent
          style={{
            background: "#10222c",
            color: "#e4eff1",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {overflow
                ? "Not every challenge fits"
                : `Import ${pending} pack?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {overflow
                ? `${overflow.kept} challenges fit; ${overflow.excluded.length} have no available reachable tile. Nothing has changed yet. Cancel to choose a larger theme or adjust your content, or explicitly import only the challenges that fit. Existing accounts, responses, and points stay saved. Keep your original content pack or export the current content before excluding questions.`
                : pending === "theme"
                  ? "This replaces the active world, characters, sprites, and music."
                  : "This replaces the active challenge collection."}
              {!overflow && pending === "theme" && paired
                ? " The selected content pack replaces challenges in the same operation."
                : ""}{" "}
              {!overflow &&
                "Accounts, teams, and recorded points stay saved. Export the current pack first if you want to keep it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {overflow && (
            <div className="max-h-48 overflow-y-auto">
              <p>Questions that would be excluded:</p>
              <ul>
                {overflow.excluded.map((c) => (
                  <li key={c.id}>
                    {c.object} ({c.id})
                  </li>
                ))}
              </ul>
              <p>
                {overflow.moved.length} other questions will move automatically.
              </p>
              <a href="/api/admin/packs?kind=content">
                Export current content first
              </a>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              style={{
                background: "#57cbbb",
                color: "#07151c",
                padding: "10px 16px",
                height: "auto",
                whiteSpace: "normal",
              }}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void apply(!!overflow);
              }}
            >
              {busy
                ? "Importing…"
                : overflow
                  ? `Import ${overflow.kept} and exclude ${overflow.excluded.length}`
                  : "Apply import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

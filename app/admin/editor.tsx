"use client";
import { useEffect, useState } from "react";
import {
  Snowflake,
  Plus,
  Save,
  Download,
  MapPin,
  LockKeyhole,
} from "lucide-react";
import { World } from "../page";
import {
  MAP_IDS,
  mapName,
  canPlaceChallenge,
  configureWorld,
  activeWorld,
  mapInfo,
} from "@/lib/world-data.mjs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
type Hint = { id: string; label: string; text: string; cost: number };
type FileLink = { name: string; url: string; filename?: string };
type Definition = {
  id: string;
  map: string;
  object: string;
  location: { x: number; y: number };
  region: string;
  text: string;
  flags: string[];
  grading: "automatic" | "manual";
  caseSensitive: boolean;
  points: number;
  hints: Hint[];
  downloads: FileLink[];
};
type Draft = Omit<Definition, "flags"> & { flagsText: string };
const explorer = {
  id: "web",
  name: "Map editor",
  subtitle: "",
  sprite: null,
  fallback: "web" as const,
};
const noop = () => {};
const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const fresh = (map = "town", x = 18, y = 20): Draft => ({
  id: "treasure-" + randomId(),
  map,
  object: "",
  location: { x, y },
  region: mapName(map),
  text: "",
  flagsText: "",
  grading: "automatic",
  caseSensitive: false,
  points: 100,
  hints: [],
  downloads: [],
});
const toDraft = (c: Definition): Draft => ({
  ...c,
  grading: c.grading || "automatic",
  hints: c.hints.map((h) => ({ ...h })),
  downloads: c.downloads.map((f) => ({ ...f })),
  flagsText: (c.flags || []).join("\n"),
});
export default function Admin() {
  const [access, setAccess] = useState<"loading" | "login" | "ready">(
      "loading",
    ),
    [catalog, setCatalog] = useState<Definition[]>([]),
    [revision, setRevision] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [editingId, setEditingId] = useState<string | undefined>(),
    [initial, setInitial] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [firstHero, setFirstHero] = useState("web");
  const dirty =
    !!draft &&
    Boolean(
      editingId ||
        draft.object.trim() ||
        draft.text.trim() ||
        draft.flagsText.trim() ||
        draft.hints.length ||
        draft.downloads.length,
    ) &&
    JSON.stringify(draft) !== initial;
  function choose(c: Draft, id?: string) {
    setDraft(c);
    setEditingId(id);
    setInitial(JSON.stringify(c));
    setError("");
    setMessage("");
  }
  async function load(keepSelection = false) {
    const r = await fetch("/api/admin/challenges");
    const d = (await r.json()) as {
      challenges: Definition[];
      revision: number;
      theme: { world: typeof activeWorld };
      error?: string;
    };
    if (r.status === 401 || r.status === 403) {
      setAccess("login");
      if (r.status === 403)
        setError(d.error || "This account is not an administrator.");
      return;
    }
    if (!r.ok) throw Error(d.error || "Challenge management is unavailable.");
    configureWorld(d.theme.world);
    setCatalog(d.challenges);
    setRevision(d.revision);
    setAccess("ready");
    const selected = keepSelection
      ? d.challenges.find((c) => c.id === editingId)
      : undefined;
    choose(
      selected
        ? toDraft(selected)
        : fresh(
            activeWorld.startMap,
            mapInfo(activeWorld.startMap)!.spawn.x,
            mapInfo(activeWorld.startMap)!.spawn.y,
          ),
      selected?.id,
    );
  }
  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        if (r.ok) {
          const c = (await r.json()) as { characters: { id: string }[] };
          setFirstHero(c.characters[0]?.id || "web");
        }
      })
      .catch(() => {});
    void load().catch((e) => {
      setError(e.message);
      setAccess("login");
    });
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  function patch(values: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...values } : d));
    setMessage("");
  }
  function canDiscard() {
    return !dirty || window.confirm("Discard your unsaved edits?");
  }
  function newChallenge() {
    if (canDiscard())
      choose(fresh(draft?.map, draft?.location.x, draft?.location.y));
  }
  function selectTile(x: number, y: number) {
    if (!draft) return;
    const existing = catalog.find(
      (c) => c.map === draft.map && c.location.x === x && c.location.y === y,
    );
    if (existing && existing.id !== editingId) {
      if (canDiscard()) choose(toDraft(existing), existing.id);
    } else patch({ location: { x, y } });
  }
  function selectExisting(c: Definition) {
    if (c.id === editingId) return;
    if (canDiscard()) choose(toDraft(c), c.id);
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "login",
          username,
          password,
          hero: firstHero,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "Sign-in failed.");
      setPassword("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { flagsText, ...definition } = draft;
      const challenge = {
        ...definition,
        flags:
          draft.grading === "manual"
            ? []
            : flagsText
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean),
      };
      const r = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, revision, editingId }),
      });
      const d = (await r.json()) as {
        error?: string;
        challenges: Definition[];
        revision: number;
      };
      if (!r.ok) throw Error(d.error || "Your changes could not be saved.");
      setCatalog(d.challenges);
      setRevision(d.revision);
      const saved = d.challenges.find((c) => c.id === draft.id)!;
      choose(toDraft(saved), saved.id);
      setMessage(
        "Saved. Students will see this challenge when they next load their expedition.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const validLocation =
    !!draft && canPlaceChallenge(draft.map, draft.location.x, draft.location.y);
  return (
    <main className="admin-studio">
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Snowflake size={24} />
          </span>
          QUEST <b>STUDIO</b>
        </a>
        <div className="header-right">
          <span className="edition">ADMIN STUDIO</span>
          <a className="admin-link" href="/admin/review">
            Review answers
          </a>
          <a className="admin-link" href="/admin/packs">
            Themes &amp; content
          </a>
          <a className="admin-link" href="/admin/teams">
            Teams
          </a>
          <a className="admin-link" href="/admin/users">
            Accounts
          </a>
          <a className="admin-link" href="/scoreboard">
            Scores
          </a>
          <a className="admin-link" href="/">
            Back to game
          </a>
        </div>
      </header>
      {access === "loading" ? (
        <p className="admin-loading" role="status">
          Opening challenge studio…
        </p>
      ) : access === "login" ? (
        <section className="admin-login">
          <LockKeyhole size={28} />
          <h1>Administrator sign-in</h1>
          <p>Use the admin account your server owner configured.</p>
          <form onSubmit={login}>
            <label>
              Admin username
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Admin password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to manage challenges"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        draft && (
          <section className="admin-workspace">
            <div className="admin-heading">
              <div>
                <span className="eyebrow">BUILD THE TREASURE HUNT</span>
                <h1>Challenge studio</h1>
                <p>
                  Choose a map, click a tile, and give your discovery a
                  challenge.
                </p>
              </div>
              <div className="admin-actions">
                <a href="/api/admin/backup" className="secondary-button">
                  <Download size={17} />
                  Full backup
                </a>
                <a
                  href="/api/admin/challenges?format=yaml"
                  className="secondary-button"
                >
                  <Download size={17} />
                  Export YAML
                </a>
                <button
                  className="primary"
                  type="button"
                  onClick={newChallenge}
                >
                  <Plus size={17} />
                  New challenge
                </button>
              </div>
            </div>
            <div className="admin-columns">
              <div className="admin-map-panel">
                <div className="admin-map-toolbar">
                  <label>
                    Map
                    <Select
                      value={draft.map}
                      onValueChange={(map) => {
                        if (canDiscard())
                          choose(
                            fresh(
                              map,
                              mapInfo(map)!.spawn.x,
                              mapInfo(map)!.spawn.y,
                            ),
                          );
                      }}
                    >
                      <SelectTrigger aria-label="Select map">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAP_IDS.map((map) => (
                          <SelectItem key={map} value={map}>
                            {mapName(map)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <span
                    className={validLocation ? "tile-valid" : "tile-invalid"}
                  >
                    <MapPin size={16} />
                    {draft.location.x}, {draft.location.y} ·{" "}
                    {validLocation ? "Available ground" : "Choose clear ground"}
                  </span>
                </div>
                <World
                  hero={explorer}
                  map={draft.map}
                  pos={draft.location}
                  challenges={catalog
                    .filter((c) => c.map === draft.map)
                    .map((c) => ({
                      ...c,
                      remainingPoints: c.points,
                      awardedPoints: null,
                      submission: null,
                      hintCost: 0,
                      hints: c.hints.map((h) => ({ ...h, unlocked: false })),
                    }))}
                  solved={[]}
                  onMove={noop}
                  onSearch={noop}
                  onSelect={selectTile}
                />
                <p className="admin-map-help">
                  Gold sparkles mark saved challenges. Click a sparkle to edit
                  it; click clear ground to place or move your selected
                  challenge. Arrow keys also select tiles.
                </p>
                <div className="admin-list-heading">
                  <h2>Saved discoveries</h2>
                  <span>
                    {catalog.filter((c) => c.map === draft.map).length} on this
                    map
                  </span>
                </div>
                <div className="admin-challenge-list">
                  {catalog
                    .filter((c) => c.map === draft.map)
                    .map((c) => (
                      <button
                        className={c.id === editingId ? "active" : ""}
                        key={c.id}
                        onClick={() => selectExisting(c)}
                      >
                        <span>✦</span>
                        <div>
                          <b>{c.object}</b>
                          <small>
                            {c.region} · {c.location.x}, {c.location.y}
                          </small>
                        </div>
                        <strong>{c.points} pts</strong>
                      </button>
                    ))}
                  {!catalog.some((c) => c.map === draft.map) && (
                    <p>No challenges here yet. Pick a tile to add the first.</p>
                  )}
                </div>
              </div>
              <form className="admin-editor" onSubmit={save}>
                <div className="admin-editor-title">
                  <h2>{editingId ? "Edit discovery" : "New discovery"}</h2>
                  <span>
                    {dirty ? "Unsaved edits" : editingId ? "Saved" : "Draft"}
                  </span>
                </div>
                <label>
                  Discovery name
                  <input
                    required
                    maxLength={120}
                    value={draft.object}
                    onChange={(e) => patch({ object: e.target.value })}
                    placeholder="e.g. Santa’s missing star"
                  />
                </label>
                <label>
                  Location name
                  <input
                    required
                    maxLength={120}
                    value={draft.region}
                    onChange={(e) => patch({ region: e.target.value })}
                    placeholder="e.g. By the castle throne"
                  />
                </label>
                <div className="admin-coordinate-fields">
                  <label>
                    X coordinate
                    <input
                      type="number"
                      min={0}
                      max={39}
                      required
                      value={draft.location.x}
                      onChange={(e) =>
                        patch({
                          location: {
                            ...draft.location,
                            x: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Y coordinate
                    <input
                      type="number"
                      min={0}
                      max={27}
                      required
                      value={draft.location.y}
                      onChange={(e) =>
                        patch({
                          location: {
                            ...draft.location,
                            y: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    Points
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      required
                      value={draft.points}
                      onChange={(e) =>
                        patch({ points: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                {!validLocation && (
                  <p className="error">
                    Choose reachable ground or floor, away from furniture and
                    doorways.
                  </p>
                )}
                <label>
                  Challenge text
                  <textarea
                    aria-label="Challenge text"
                    required
                    maxLength={20000}
                    rows={5}
                    value={draft.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    placeholder="What should students discover or solve?"
                  />
                </label>
                <label>
                  Answer checking
                  <Select
                    value={draft.grading}
                    onValueChange={(grading) =>
                      patch({ grading: grading as "automatic" | "manual" })
                    }
                  >
                    <SelectTrigger aria-label="Answer checking">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual grading</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {draft.grading === "automatic" ? (
                  <>
                    <label>
                      Accepted flags{" "}
                      <small>
                        One answer per line; students won’t see these.
                      </small>
                      <textarea
                        aria-label="Accepted flags"
                        required
                        maxLength={50000}
                        rows={3}
                        value={draft.flagsText}
                        onChange={(e) => patch({ flagsText: e.target.value })}
                        placeholder={"FLAG{north_pole}\nnorth pole"}
                      />
                    </label>
                    <label className="admin-checkbox">
                      <Checkbox
                        checked={draft.caseSensitive}
                        onCheckedChange={(v) =>
                          patch({ caseSensitive: v === true })
                        }
                      />
                      Case-sensitive flags
                    </label>
                  </>
                ) : (
                  <p>
                    Students submit written responses. Admins review them, award
                    points, and provide feedback from Review answers.
                  </p>
                )}
                <section className="admin-repeaters">
                  <div>
                    <h3>Hints</h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        patch({
                          hints: [
                            ...draft.hints,
                            {
                              id: "hint-" + randomId(),
                              label: `Hint ${draft.hints.length + 1}`,
                              text: "",
                              cost: 0,
                            },
                          ],
                        })
                      }
                      disabled={draft.hints.length >= 20}
                    >
                      Add hint
                    </button>
                  </div>
                  <p>Each hint reduces this challenge’s reward once.</p>
                  {draft.hints.map((h, i) => (
                    <div className="admin-repeater" key={h.id}>
                      <div className="admin-repeater-top">
                        <label>
                          Hint label
                          <input
                            required
                            value={h.label}
                            onChange={(e) =>
                              patch({
                                hints: draft.hints.map((v, j) =>
                                  j === i ? { ...v, label: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Cost
                          <input
                            type="number"
                            min={0}
                            max={draft.points}
                            required
                            value={h.cost}
                            onChange={(e) =>
                              patch({
                                hints: draft.hints.map((v, j) =>
                                  j === i
                                    ? { ...v, cost: Number(e.target.value) }
                                    : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Remove hint ${i + 1}`}
                          onClick={() =>
                            patch({
                              hints: draft.hints.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <label>
                        Hint text
                        <textarea
                          aria-label={`Hint text ${i + 1}`}
                          required
                          maxLength={10000}
                          rows={2}
                          value={h.text}
                          onChange={(e) =>
                            patch({
                              hints: draft.hints.map((v, j) =>
                                j === i ? { ...v, text: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </section>
                <section className="admin-repeaters">
                  <div>
                    <h3>Challenge files</h3>
                    <button
                      type="button"
                      className="text-button"
                      disabled={draft.downloads.length >= 20}
                      onClick={() =>
                        patch({
                          downloads: [
                            ...draft.downloads,
                            { name: "", url: "" },
                          ],
                        })
                      }
                    >
                      Add file link
                    </button>
                  </div>
                  <p>
                    Link to a hosted file or a file in your server’s downloads
                    folder.
                  </p>
                  {draft.downloads.map((file, i) => (
                    <div className="admin-repeater" key={i}>
                      <div className="admin-repeater-top">
                        <label>
                          File name
                          <input
                            required
                            value={file.name}
                            onChange={(e) =>
                              patch({
                                downloads: draft.downloads.map((v, j) =>
                                  j === i ? { ...v, name: e.target.value } : v,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Remove file ${i + 1}`}
                          onClick={() =>
                            patch({
                              downloads: draft.downloads.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <label>
                        File URL
                        <input
                          required
                          value={file.url}
                          onChange={(e) =>
                            patch({
                              downloads: draft.downloads.map((v, j) =>
                                j === i ? { ...v, url: e.target.value } : v,
                              ),
                            })
                          }
                          placeholder="/downloads/puzzle.pdf or https://…"
                        />
                      </label>
                      <label>
                        Download filename <small>Optional</small>
                        <input
                          value={file.filename || ""}
                          onChange={(e) =>
                            patch({
                              downloads: draft.downloads.map((v, j) =>
                                j === i
                                  ? {
                                      ...v,
                                      filename: e.target.value || undefined,
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </section>
                <div className="admin-save">
                  <p>
                    {draft.points - draft.hints.reduce((s, h) => s + h.cost, 0)}{" "}
                    points after all hints
                  </p>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  {message && (
                    <p className="success" role="status">
                      {message}
                    </p>
                  )}
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !validLocation ||
                      draft.hints.reduce((s, h) => s + h.cost, 0) > draft.points
                    }
                  >
                    <Save size={17} />
                    {busy ? "Saving…" : "Save challenge"}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (canDiscard())
                        void load(true).catch((e) => setError(e.message));
                    }}
                  >
                    Reload saved version
                  </button>
                  <small>Saving keeps previously earned student points.</small>
                </div>
              </form>
            </div>
          </section>
        )
      )}
    </main>
  );
}

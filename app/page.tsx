"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MidiPlayer, type MusicConfig } from "@/lib/midi-player";
import {
  Compass,
  Snowflake,
  Trophy,
  Volume2,
  VolumeX,
  LogOut,
  Sparkles,
  MapPin,
  Flag,
} from "lucide-react";
type Hero = string;
type Character = {
  id: string;
  name: string;
  subtitle: string;
  sprite: string | null;
  fallback: "web" | "thunder" | "shield";
};
type GameConfig = {
  characters: Character[];
  audio: MusicConfig;
  allowRegistration: boolean;
};
type Challenge = {
  id: string;
  object: string;
  location: { x: number; y: number };
  region: string;
  prompt: string;
  points: number;
  hint: string;
};
function useSprite(path: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!path) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live) setImage(img);
    };
    img.onerror = () => {
      if (live) setImage(null);
    };
    img.src = path;
    return () => {
      live = false;
    };
  }, [path]);
  return image;
}
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  character: Character,
  image: HTMLImageElement | null,
  size: number,
) {
  if (image) {
    const ratio = image.width / image.height;
    const h = size,
      w = size * ratio;
    ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
  } else sprite(ctx, x, y, character.fallback, size / 32);
}
const trees = [
  [3, 3],
  [5, 5],
  [6, 11],
  [3, 14],
  [5, 22],
  [8, 24],
  [12, 25],
  [34, 23],
  [36, 20],
  [34, 15],
  [37, 10],
  [33, 5],
  [31, 3],
  [25, 3],
  [13, 3],
  [11, 6],
  [15, 9],
  [4, 8],
  [35, 8],
  [23, 24],
  [20, 25],
  [16, 23],
  [32, 11],
  [2, 23],
  [36, 25],
  [8, 3],
  [17, 2],
  [24, 8],
];
const buildings = [
  { x: 15, y: 3, w: 7, h: 4 },
  { x: 8, y: 12, w: 5, h: 4 },
  { x: 25, y: 11, w: 5, h: 4 },
];
function blocked(x: number, y: number) {
  return (
    x < 1 ||
    y < 1 ||
    x > 38 ||
    y > 26 ||
    trees.some(([a, b]) => a === x && b === y) ||
    buildings.some(
      (b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
    ) ||
    (x >= 23 && x <= 31 && y >= 17 && y <= 23)
  );
}
function sprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hero: Hero,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const rect = (c: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  rect("#163340", -7, 12, 18, 4);
  if (hero === "thunder") {
    rect("#b9434d", -7, -3, 14, 15);
    rect("#ebd887", -7, -15, 14, 12);
    rect("#f2c9a0", -4, -12, 8, 8);
    rect("#91a6b1", -6, 0, 12, 9);
    rect("#a7c4ce", 9, -6, 7, 6);
    rect("#695348", 11, 0, 2, 10);
  } else {
    rect(hero === "web" ? "#d94c57" : "#438ac4", -6, -15, 12, 12);
    rect("#f4f5df", -4, -11, 3, 3);
    rect("#f4f5df", 2, -11, 3, 3);
    rect(hero === "web" ? "#d94c57" : "#438ac4", -7, -2, 14, 10);
    rect("#d94c57", -4, 3, 8, 3);
    if (hero === "shield") {
      rect("#da6464", 6, 0, 10, 10);
      rect("#eee1b9", 8, 2, 6, 6);
      rect("#438ac4", 10, 4, 2, 2);
    } else {
      rect("#263956", -3, -1, 6, 6);
    }
  }
  rect("#253e65", -6, 8, 5, 6);
  rect("#253e65", 2, 8, 5, 6);
  ctx.restore();
}
function World({
  hero,
  pos,
  challenges,
  solved,
  onMove,
  onSearch,
}: {
  hero: Character;
  pos: { x: number; y: number };
  challenges: Challenge[];
  solved: string[];
  onMove: (x: number, y: number) => void;
  onSearch: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSprite(hero.sprite);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const t = 24;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 960, 672);
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 40; x++) {
        ctx.fillStyle = (x * 7 + y * 13) % 11 === 0 ? "#c9e5e9" : "#dfedef";
        ctx.fillRect(x * t, y * t, t, t);
        if ((x * 11 + y * 3) % 9 === 0) {
          ctx.fillStyle = "#b6d7df";
          ctx.fillRect(x * t + 7, y * t + 14, 3, 2);
        }
      }
    ctx.fillStyle = "#bdd1cf";
    ctx.fillRect(17 * t, 7 * t, 3 * t, 20 * t);
    ctx.fillRect(8 * t, 16 * t, 22 * t, 3 * t);
    ctx.fillRect(6 * t, 7 * t, 27 * t, 2 * t);
    ctx.fillStyle = "#9ec6d1";
    ctx.fillRect(23 * t, 17 * t, 9 * t, 7 * t);
    ctx.fillStyle = "#77afc3";
    ctx.fillRect(24 * t, 18 * t, 7 * t, 5 * t);
    ctx.fillStyle = "#bfe3e7";
    for (let i = 0; i < 7; i++)
      ctx.fillRect((24 + i) * t, (18 + (i % 4)) * t, 20, 3);
    for (const b of buildings) {
      const x = b.x * t,
        y = b.y * t;
      ctx.fillStyle = "#adc4cb";
      ctx.fillRect(x + 8, y + 12, b.w * t, b.h * t);
      ctx.fillStyle = "#744b4b";
      ctx.fillRect(x, y + 24, b.w * t, b.h * t - 24);
      ctx.fillStyle = "#4c353d";
      ctx.fillRect(x - 6, y + 12, b.w * t + 12, 30);
      ctx.fillStyle = "#fff7e6";
      ctx.fillRect(x - 6, y + 8, b.w * t + 12, 12);
      ctx.fillStyle = "#d9e9e7";
      ctx.fillRect(x + 8, y, b.w * t - 16, 12);
      ctx.fillStyle = "#f5c677";
      ctx.fillRect(x + 14, y + 50, 18, 18);
      ctx.fillRect(x + b.w * t - 32, y + 50, 18, 18);
      ctx.fillStyle = "#483a43";
      ctx.fillRect(x + (b.w * t) / 2 - 10, y + b.h * t - 28, 20, 28);
      ctx.fillStyle = "#cf7180";
      ctx.fillRect(x + b.w * t - 26, y - 8, 12, 22);
    }
    for (const [x, y] of trees) {
      const a = x * t + 12,
        b = y * t + 10;
      ctx.fillStyle = "#aecbd2";
      ctx.fillRect(a - 12, b + 10, 29, 10);
      ctx.fillStyle = "#745a52";
      ctx.fillRect(a - 3, b + 3, 6, 16);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ["#21585c", "#2e7775", "#438a83"][i];
        ctx.fillRect(a - 15 + i * 4, b - 4 - i * 9, 30 - i * 8, 13);
        ctx.fillStyle = "#edf5eb";
        ctx.fillRect(a - 10 + i * 3, b - 5 - i * 9, 20 - i * 6, 4);
      }
    }
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#526e7c";
    ctx.fillText("SANTA’S WORKSHOP", 18.5 * t, 2 * t);
    ctx.fillText("EVERGREEN GROVE", 8 * t, 5 * t);
    ctx.fillText("AURORA RIDGE", 29 * t, 5 * t);
    ctx.fillText("FROSTBITE LAKE", 27.5 * t, 24.5 * t);
    ctx.fillText("LANTERN LANE", 10.5 * t, 18 * t);
    for (const q of challenges) {
      if (solved.includes(q.id)) continue;
      const a = q.location.x * t + 12,
        b = q.location.y * t + 12;
      const distance =
        Math.abs(pos.x - q.location.x) + Math.abs(pos.y - q.location.y);
      ctx.fillStyle = distance <= 3 ? "#d6a44e" : "#bed5db";
      ctx.fillRect(a - 2, b - 6, 4, 12);
      ctx.fillRect(a - 6, b - 2, 12, 4);
      ctx.fillStyle = "#fff6cc";
      ctx.fillRect(a - 2, b - 2, 4, 4);
    }
    // Trail markers and lamplights.
    for (const x of [14, 21]) {
      ctx.fillStyle = "#677c83";
      ctx.fillRect(x * t, 16 * t - 15, 3, 30);
      ctx.fillStyle = "#ffe6a1";
      ctx.fillRect(x * t - 3, 16 * t - 18, 9, 9);
    }
    drawCharacter(ctx, pos.x * t + 12, pos.y * t + 12, hero, image, 42);
    ctx.fillStyle = "#264954";
    ctx.fillRect(pos.x * t + 9, pos.y * t + 34, 6, 3);
  }, [hero, image, pos, challenges, solved]);
  return (
    <div className="world">
      <canvas
        ref={ref}
        width={960}
        height={672}
        aria-label="North Pole exploration map. Use arrow keys or WASD to move, and E to search."
      />
      <div className="map-label">
        <span className="live-dot" /> NORTH POLE{" "}
        <span>38° BELOW · CLEAR SKIES</span>
      </div>
      <div className="map-bottom">
        <span>
          <MapPin size={15} /> {pos.x}, {pos.y}
        </span>
        <button onClick={onSearch}>
          <Sparkles size={16} /> Search nearby <kbd>E</kbd>
        </button>
      </div>
      <div className="dpad">
        <button aria-label="Move north" onClick={() => onMove(0, -1)}>
          ▲
        </button>
        <div>
          <button aria-label="Move west" onClick={() => onMove(-1, 0)}>
            ◀
          </button>
          <button aria-label="Move south" onClick={() => onMove(0, 1)}>
            ▼
          </button>
          <button aria-label="Move east" onClick={() => onMove(1, 0)}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
function Portrait({ hero }: { hero: Character }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const image = useSprite(hero.sprite);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 100, 100);
    drawCharacter(c, 50, 50, hero, image, 85);
  }, [hero, image]);
  return (
    <canvas
      ref={ref}
      width={100}
      height={100}
      className="portrait"
      aria-label={hero.name}
    />
  );
}
export default function Game() {
  const [user, setUser] = useState<{ username: string; hero: Hero } | null>(
      null,
    ),
    [loading, setLoading] = useState(true),
    [hero, setHero] = useState<Hero>("web"),
    [mode, setMode] = useState("register"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [challenges, setChallenges] = useState<Challenge[]>([]),
    [solved, setSolved] = useState<string[]>([]),
    [score, setScore] = useState(0),
    [pos, setPos] = useState({ x: 18, y: 20 }),
    [active, setActive] = useState<Challenge | null>(null),
    [answer, setAnswer] = useState(""),
    [feedback, setFeedback] = useState(""),
    [hint, setHint] = useState(false),
    [notice, setNotice] = useState(
      "Follow the paths. Look for a glimmer in the snow.",
    ),
    [muted, setMuted] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const music = useRef<MidiPlayer | null>(null);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [audioError, setAudioError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const heroes = config?.characters || [];
  async function loadGame() {
    const r = await fetch("/api/game");
    const d = (await r.json()) as {
      error?: string;
      user: { username: string; hero: Hero };
      challenges: Challenge[];
      solved: string[];
      score: number;
      correct: boolean;
    };
    if (!r.ok) throw Error(d.error || "Could not load expedition.");
    setChallenges(d.challenges);
    setSolved(d.solved);
    setScore(d.score);
  }
  useEffect(() => {
    Promise.all([
      fetch("/api/config").then(async (r) => {
        if (!r.ok) throw Error("Configuration is unavailable.");
        return (await r.json()) as GameConfig;
      }),
      fetch("/api/auth").then(
        async (r) =>
          (await r.json()) as {
            error?: string;
            user: { username: string; hero: Hero } | null;
          },
      ),
    ])
      .then(async ([settings, d]) => {
        setConfig(settings);
        setHero(settings.characters[0].id);
        setMode(settings.allowRegistration ? "register" : "login");
        if (d.error) throw Error(d.error);
        if (d.user) {
          setUser(d.user);
          await loadGame();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      music.current?.dispose();
      if (audio.current) void audio.current.close();
    };
  }, []);
  async function toggleMusic() {
    if (audioBusy) return;
    setAudioError("");
    setAudioBusy(true);
    try {
      if (!muted) {
        await music.current?.mute();
        if (audio.current) await audio.current.suspend();
        setMuted(true);
      } else {
        if (!config?.audio.midi)
          throw Error("No background music is configured.");
        music.current ??= new MidiPlayer(config.audio);
        await music.current.play();
        if (audio.current) await audio.current.resume();
        setMuted(false);
      }
    } catch (e) {
      music.current?.dispose();
      music.current = null;
      setMuted(true);
      setAudioError((e as Error).message);
    } finally {
      setAudioBusy(false);
    }
  }
  function sound() {
    if (muted) return;
    audio.current ??= new AudioContext();
    const o = audio.current.createOscillator(),
      g = audio.current.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(660, audio.current.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      990,
      audio.current.currentTime + 0.15,
    );
    g.gain.setValueAtTime(0.05, audio.current.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.current.currentTime + 0.3);
    o.connect(g);
    g.connect(audio.current.destination);
    o.start();
    o.stop(audio.current.currentTime + 0.3);
  }
  function move(dx: number, dy: number) {
    if (active) return;
    setPos((p) =>
      blocked(p.x + dx, p.y + dy) ? p : { x: p.x + dx, y: p.y + dy },
    );
  }
  function search() {
    const q = challenges.find(
      (c) =>
        !solved.includes(c.id) &&
        Math.abs(c.location.x - pos.x) + Math.abs(c.location.y - pos.y) <= 2,
    );
    if (q) {
      setActive(q);
      setAnswer("");
      setFeedback("");
      setHint(false);
      sound();
    } else
      setNotice(
        solved.length === challenges.length
          ? "All treasures found! Your expedition is complete."
          : "Nothing here yet. Search near a sparkle in the snow.",
      );
  }
  useEffect(() => {
    if (!user) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea") || active) return;
      const dirs: Record<string, number[]> = {
        ArrowUp: [0, -1],
        w: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
      };
      const d = dirs[e.key];
      if (d) {
        e.preventDefault();
        move(d[0], d[1]);
      }
      if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user, active, pos, challenges, solved]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, hero, mode }),
      });
      const d = (await r.json()) as {
        error?: string;
        user: { username: string; hero: Hero };
        challenges: Challenge[];
        solved: string[];
        score: number;
        correct: boolean;
      };
      if (!r.ok) throw Error(d.error);
      setUser(d.user);
      setPassword("");
      await loadGame();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      const r = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id, answer }),
      });
      const d = (await r.json()) as {
        error?: string;
        user: { username: string; hero: Hero };
        challenges: Challenge[];
        solved: string[];
        score: number;
        correct: boolean;
      };
      if (!r.ok) throw Error(d.error || "Please sign in again.");
      if (d.correct) {
        await loadGame();
        sound();
        setFeedback(`Treasure collected! +${active.points} points`);
        setNotice(`${active.object} collected. Keep exploring!`);
      } else setFeedback("Not quite. Take another look and try again.");
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            opts: { signal: AbortSignal },
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "read_expedition",
          description:
            "Read current explorer position, score, and collected treasures.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("Expected an empty object");
            return {
              signedIn: !!user,
              position: pos,
              score,
              collected: solved,
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [user, pos, score, solved]);
  const chosen = heroes.find((h) => h.id === (user?.hero || hero)) || heroes[0];
  return (
    <main>
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Snowflake size={24} />
          </span>{" "}
          NORTH POLE <b>QUEST</b>
        </a>
        <div className="header-right">
          <span className="edition">THE WINTER EXPEDITION</span>
          <button
            className="icon-button"
            aria-label={muted ? "Enable sound" : "Mute sound"}
            onClick={toggleMusic}
            disabled={audioBusy || !config?.audio.midi}
          >
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          {user && (
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  const r = await fetch("/api/auth", { method: "DELETE" });
                  if (!r.ok) throw Error();
                  setUser(null);
                  setPos({ x: 18, y: 20 });
                  setError("");
                } catch {
                  setError("Could not sign out. Please retry.");
                }
              }}
            >
              <LogOut size={19} />
            </button>
          )}
        </div>
      </header>
      {audioError && (
        <p role="status" className="audio-error">
          {audioError}
        </p>
      )}
      {!user || !chosen ? (
        <section className="start">
          <div className="start-heading">
            <span className="eyebrow">A LITTLE WONDER. A BIG ADVENTURE.</span>
            <h1>
              Your expedition
              <br />
              starts here<span>✦</span>
            </h1>
            <p>
              Hidden treasures. Curious challenges. One snowy world to explore.
            </p>
          </div>
          <form onSubmit={login} className="start-panel">
            <div className="form-top">
              <h2>
                {mode === "register"
                  ? "Choose your explorer"
                  : "Welcome back, explorer"}
              </h2>
              {config?.allowRegistration && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode(mode === "register" ? "login" : "register");
                    setError("");
                  }}
                >
                  {mode === "register"
                    ? "Already have an account?"
                    : "Create an account"}
                </button>
              )}
            </div>
            {
              <div className="heroes">
                {heroes.map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    className={"hero-card " + (hero === h.id ? "selected" : "")}
                    onClick={() => setHero(h.id)}
                    aria-pressed={hero === h.id}
                  >
                    <Portrait hero={h} />
                    <span>{h.name}</span>
                    <small>{h.subtitle}</small>
                    <b>{hero === h.id ? "SELECTED" : "CHOOSE HERO"}</b>
                  </button>
                ))}
              </div>
            }
            <div className="account-fields">
              <label>
                Explorer username
                <input
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. snowexplorer"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <button className="primary" disabled={busy || loading || !config}>
                {loading
                  ? "Preparing expedition…"
                  : busy
                    ? "Opening expedition…"
                    : mode === "register"
                      ? "Begin expedition"
                      : "Continue expedition"}
              </button>
            </div>
            <p className="save-note">
              {mode === "register"
                ? "Your hero stays with your account. Your points are saved as you explore."
                : "Use your teacher-provided account. Your choice applies on first sign-in; a saved or assigned hero takes priority."}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
          <footer>
            <span>
              <Compass size={16} /> EXPLORE AT YOUR OWN PACE
            </span>
            <span>Built for curious minds</span>
          </footer>
        </section>
      ) : (
        <section className="game-layout">
          <div className="play-column">
            <div className="play-heading">
              <div>
                <span className="eyebrow">EXPEDITION 01</span>
                <h1>The North Pole</h1>
              </div>
              <span className="region-pill">
                <Snowflake size={16} /> Winter village
              </span>
            </div>
            <World
              hero={chosen}
              pos={pos}
              challenges={challenges}
              solved={solved}
              onMove={move}
              onSearch={search}
            />
            <div className="controls">
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> or arrow keys to move
              </span>
              <span>
                <kbd>E</kbd> search nearby
              </span>
              <span>Look for ✦ sparkles</span>
            </div>
            <div className="message" role="status">
              <span className="message-icon">✦</span>
              <div>
                <b>
                  {solved.length === challenges.length && challenges.length
                    ? "Expedition complete"
                    : "A note from the North Pole"}
                </b>
                <p>{notice}</p>
              </div>
            </div>
            {error && (
              <div className="error">
                {error}{" "}
                <button
                  onClick={() =>
                    loadGame()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
                  }
                >
                  Retry expedition
                </button>
              </div>
            )}
          </div>
          <aside>
            <div className="explorer">
              <span className="eyebrow">YOUR EXPLORER</span>
              <div className="explorer-info">
                <Portrait hero={chosen} />
                <div>
                  <h2>{chosen.name}</h2>
                  <p>@{user.username}</p>
                  <span className="small-pill">LEVEL 01 · EXPLORER</span>
                </div>
              </div>
            </div>
            <div className="score-panel">
              <Trophy size={22} />
              <span>Expedition points</span>
              <strong>{score.toLocaleString()}</strong>
              <small>Every discovery counts.</small>
            </div>
            <div className="journal">
              <div className="journal-title">
                <h2>Treasure journal</h2>
                <span>
                  {solved.length} / {challenges.length}
                </span>
              </div>
              <div className="progress">
                <i
                  style={{
                    width: `${challenges.length ? (solved.length / challenges.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <p>
                Find an object. Solve its challenge.
                <br />
                Add a little magic to your journey.
              </p>
              {challenges.map((q, i) => (
                <div
                  className={
                    "journal-item " + (solved.includes(q.id) ? "found" : "")
                  }
                  key={q.id}
                >
                  <span className="item-icon">
                    {solved.includes(q.id)
                      ? "✦"
                      : String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <b>
                      {solved.includes(q.id)
                        ? q.object
                        : "Undiscovered treasure"}
                    </b>
                    <small>{q.region}</small>
                  </div>
                  <span>{solved.includes(q.id) ? "✓" : `+${q.points}`}</span>
                </div>
              ))}
            </div>
            <div className="tip">
              <Flag size={20} />
              <div>
                <b>A tip for the trail</b>
                <p>
                  Get close to a sparkle, then search. There’s no penalty for
                  trying again.
                </p>
              </div>
            </div>
          </aside>
        </section>
      )}
      <Dialog
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="challenge-modal">
          <span className="eyebrow">A TREASURE IN THE SNOW</span>
          <DialogTitle>{active?.object}</DialogTitle>
          <div className="challenge-meta">
            <span>{active?.region}</span>
            <span>+{active?.points} points</span>
          </div>
          <p className="question">{active?.prompt}</p>
          <form onSubmit={submit}>
            <label>
              Your answer
              <input
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                required
                maxLength={500}
                disabled={!!active && solved.includes(active.id)}
                placeholder="What do you think?"
              />
            </label>
            {active && solved.includes(active.id) ? (
              <button
                className="primary"
                type="button"
                onClick={() => setActive(null)}
              >
                Keep exploring
              </button>
            ) : (
              <button className="primary" disabled={busy}>
                {busy ? "Checking…" : "Check answer"}
              </button>
            )}
          </form>
          <button className="text-button" onClick={() => setHint(!hint)}>
            {" "}
            {hint ? "Hide hint" : "Need a hint?"}
          </button>
          {hint && <p className="hint">{active?.hint}</p>}
          {feedback && (
            <p
              role="status"
              className={
                active && solved.includes(active.id) ? "success" : "error"
              }
            >
              {feedback}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

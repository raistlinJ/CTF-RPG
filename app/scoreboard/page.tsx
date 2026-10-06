"use client";
import { useEffect, useState } from "react";
import { Snowflake, Trophy, RefreshCw } from "lucide-react";
type Player = {
  rank: number;
  username: string;
  hero: string;
  score: number;
  completed: number;
  isYou: boolean;
};
export default function Scoreboard() {
  const [title, setTitle] = useState("Quest");
  const [players, setPlayers] = useState<Player[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [heroes, setHeroes] = useState<Record<string, string>>({});
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/scoreboard");
      const d = (await r.json()) as { players: Player[]; error?: string };
      if (!r.ok) throw Error(d.error || "Could not load scores.");
      setPlayers(d.players);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void fetch("/api/config")
      .then(async (r) => {
        if (r.ok) {
          const d = (await r.json()) as {
            characters: { id: string; name: string }[];
            theme: { title: string };
          };
          setTitle(d.theme.title);
          setHeroes(
            Object.fromEntries(d.characters.map((c) => [c.id, c.name])),
          );
        }
      })
      .catch(() => {});
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return (
    <main>
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Snowflake size={24} />
          </span>
          {title}
        </a>
        <a className="admin-link" href="/">
          Back to game
        </a>
      </header>
      <section className="scoreboard-page">
        <div className="roster-heading">
          <div>
            <span className="eyebrow">THE WINTER EXPEDITION</span>
            <h1>Explorer scoreboard</h1>
            <p>
              Every discovery counts. Points include the cost of any hints used.
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh scores
          </button>
        </div>
        {error ? (
          <div className="roster-empty">
            <Trophy size={28} />
            <p role="alert">{error}</p>
            <a className="admin-link" href="/">
              Sign in to play
            </a>
          </div>
        ) : loading ? (
          <p role="status">Loading expedition scores…</p>
        ) : !players.length ? (
          <div className="roster-empty">
            <Trophy size={28} />
            <h2>The expedition is just beginning</h2>
            <p>Student explorers will appear here as accounts are created.</p>
          </div>
        ) : (
          <div className="scoreboard-list">
            {players.map((p) => (
              <div
                className={"scoreboard-row " + (p.isYou ? "is-you" : "")}
                key={p.username}
              >
                <span className={"rank rank-" + p.rank}>
                  {p.rank <= 3 ? <Trophy size={20} /> : p.rank}
                  <small>{p.rank <= 3 ? `#${p.rank}` : ""}</small>
                </span>
                <div>
                  <h2>
                    {p.username}
                    {p.isYou && <span>You</span>}
                  </h2>
                  <p>
                    {heroes[p.hero] || p.hero} · {p.completed}{" "}
                    {p.completed === 1 ? "treasure" : "treasures"}
                  </p>
                </div>
                <strong>
                  {p.score.toLocaleString()}
                  <small>points</small>
                </strong>
              </div>
            ))}
          </div>
        )}
        <p className="roster-note">
          Tied scores share a rank. Admins and disabled accounts are excluded.
        </p>
      </section>
    </main>
  );
}

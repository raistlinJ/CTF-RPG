"use client";
import { useState } from "react";
import type { Team } from "./team-setup";
export default function TeamPointGifts({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!team.pointAwards?.length) return null;
  return <section className="team-point-gifts" aria-label="Team point gifts">
    <h2>Team point gifts</h2>
    <p>{team.name} · +{team.pointAwards.reduce((sum, a) => sum + a.points, 0).toLocaleString()} points</p>
    <ul>{team.pointAwards.map((a) => <li key={a.id}>
      <button type="button" className="point-gift-label" aria-expanded={expanded === a.id} aria-controls={`gift-${a.id}`} aria-describedby={`gift-${a.id}`} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
        +{a.points.toLocaleString()} pts added
      </button>
      <p id={`gift-${a.id}`} className={"point-gift-comment" + (expanded === a.id ? " expanded" : "")}>{a.comment}</p>
    </li>)}</ul>
  </section>;
}

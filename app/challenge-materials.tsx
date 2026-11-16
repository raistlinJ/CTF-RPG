import { Check, Download, Lightbulb, LockKeyhole, Package } from "lucide-react";
import { hintCostLabel } from "@/lib/inventory-data.mjs";
import ChallengeMarkdown from "./challenge-markdown";

type ChallengeFile = { name: string; url: string; filename?: string };
type ChallengeHint = {
  id: string;
  label: string;
  cost: number;
  rewardCost: { keys: string[]; incantationCount: number };
  available: boolean;
  unlocked: boolean;
  text?: string;
};

export function ChallengeBriefing({ text, downloads, rewards }: {
  text: string;
  downloads: ChallengeFile[];
  rewards?: { keys: string[]; incantationCount: number };
}) {
  return <>
    <section className="challenge-briefing" aria-label="Challenge brief">
      <h3 className="challenge-section-title">Challenge brief</h3>
      <ChallengeMarkdown className="question">{text}</ChallengeMarkdown>
    </section>
    {!!downloads.length && <section className="challenge-downloads" aria-label="Challenge files">
      <h3 className="challenge-section-title"><Download size={18} aria-hidden="true" /> Challenge files</h3>
      <div className="challenge-download-links">{downloads.map((file, index) => <a
        key={`${file.url}:${index}`}
        href={file.url}
        download={file.filename || file.name}
        target={file.url.startsWith("https:") ? "_blank" : undefined}
        rel="noopener noreferrer"
      ><Download size={16} aria-hidden="true" /><span>{file.name}</span></a>)}</div>
    </section>}
    {rewards && (rewards.keys.length > 0 || rewards.incantationCount > 0) && <div className="challenge-inventory-rewards">
      <Package size={18} aria-hidden="true" /><p><b>Inventory rewards</b><span>{[
        ...rewards.keys.map(color => `${color} key`),
        ...(rewards.incantationCount ? [`${rewards.incantationCount} incantation${rewards.incantationCount === 1 ? "" : "s"}`] : []),
      ].join(" · ")}</span></p>
    </div>}
  </>;
}

export function ChallengeHints({ hints, locked, busy, completed, submitted, message, onUnlock }: {
  hints: ChallengeHint[];
  locked?: boolean;
  busy: boolean;
  completed: boolean;
  submitted: boolean;
  message: string;
  onUnlock: (id: string) => void;
}) {
  if (!hints.length) return null;
  return <section className="challenge-hints" aria-label="Challenge hints">
    <div className="challenge-hints-heading">
      <h3 className="challenge-section-title"><Lightbulb size={20} aria-hidden="true" /> Hints</h3>
      <span>{hints.filter(h => h.unlocked).length} of {hints.length} unlocked</span>
    </div>
    <p className="challenge-hints-help">Hints unlock for your whole team. Each cost is deducted once from your team’s completion points and rewards.</p>
    {locked && !submitted && !completed && <p className="hint-notice">Hints are locked because a teammate has submitted an answer.</p>}
    <div className="challenge-hint-list">{hints.map(h => {
      const cost = hintCostLabel(h.cost, h.rewardCost);
      return <article className={`challenge-hint${h.unlocked ? " is-unlocked" : ""}`} key={h.id}>
        <div className="hint-title">
          <h4>{h.unlocked ? <Check size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}{h.label}</h4>
          {h.unlocked ? <span className="hint-unlocked">Unlocked · {cost}</span> : <button
            type="button"
            disabled={busy || completed || submitted || locked || !h.available}
            onClick={() => onUnlock(h.id)}
            aria-label={`${cost === "Free" ? "Reveal free hint" : `Unlock hint for ${cost}`}: ${h.label}`}
          >{cost === "Free" ? "Reveal free hint" : `Unlock · ${cost}`}</button>}
        </div>
        {!h.unlocked && !h.available && !completed && !submitted && <p className="hint-notice">A reward required by this hint has already been used for another hint.</p>}
        {h.unlocked && <ChallengeMarkdown className="hint-content">{h.text}</ChallengeMarkdown>}
      </article>;
    })}</div>
    {message && <p className="hint-status" role="status">{message}</p>}
  </section>;
}

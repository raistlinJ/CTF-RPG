"use client";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  Users,
  Send,
  Trophy,
  ChevronLeft,
  RefreshCw,
} from "lucide-react";
export type TeamFeatures = {
  everyone: { names: boolean; scores: boolean; messaging: boolean };
  names: boolean;
  scores: boolean;
  messaging: boolean;
  revision: number;
};
type TeamCard = {
  id: string;
  label: string;
  name?: string;
  score?: number;
  members: number;
  isYourTeam: boolean;
  canMessage: boolean;
  canReadMessages: boolean;
};
type Message = {
  id: string;
  sender: string;
  fromTeam: TeamCard | null;
  toTeam: TeamCard;
  text: string;
  createdAt: number;
  outgoing: boolean;
};
type ResponseData = {
  features: TeamFeatures;
  ownTeam: string | null;
  teams?: TeamCard[];
  team?: TeamCard;
  messages?: Message[];
  latestMessageAt: number;
  error?: string;
};
export default function TeamPanel({
  open,
  onOpenChange,
  selected,
  onSelect,
  onRead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRead: (at: number) => void;
}) {
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState("");
  const request = useRef({ id: "", text: "", team: "" }),
    generation = useRef(0),
    messageList = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    sendFailed = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  async function load(silent = false) {
    const target = selected,
      version = generation.current;
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
          "/api/team-social" +
            (target ? "?team=" + encodeURIComponent(target) : ""),
        ),
        d = (await r.json()) as ResponseData;
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      if (version === generation.current && target === selectedRef.current) {
        setData(d);
        if (!sendFailed.current) setError("");
        if (target === d.ownTeam) onRead(d.latestMessageAt);
      }
    } catch (e) {
      if (version === generation.current && target === selectedRef.current)
        setError((e as Error).message);
    } finally {
      if (version === generation.current && !silent) setLoading(false);
    }
  }
  useEffect(() => {
    generation.current++;
    nearBottom.current = true;
    sendFailed.current = false;
    setData(null);
    setError("");
    setText("");
    request.current = { id: "", text: "", team: "" };
    if (!open) return;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load(true);
    }, 5000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [open, selected]);
  useEffect(() => {
    if (nearBottom.current && messageList.current)
      messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [selected, data?.messages?.at(-1)?.id]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !selected || !text.trim()) return;
    setBusy(true);
    sendFailed.current = false;
    setError("");
    const target = selected,
      body = text.trim(),
      version = generation.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      if (request.current.team !== target || request.current.text !== body)
        request.current = { id: clientUuid(), team: target, text: body };
      const r = await fetch("/api/team-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.current),
          signal: controller.signal,
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || "Could not send message.");
      if (version === generation.current) {
        setText("");
        request.current = { id: "", text: "", team: "" };
        void load(true);
      }
    } catch (e) {
      if (version === generation.current) {
        sendFailed.current = true;
        setError(
          controller.signal.aborted
            ? "Sending timed out. Your text is preserved; retry to safely check or send this message."
            : (e as Error).message,
        );
      }
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="team-dialog">
        <div className="team-dialog-heading">
          <div>
            <span className="eyebrow">EXPEDITION TEAMS</span>
            <DialogTitle>
              {selected ? data?.team?.label || "Team details" : "Teams"}
            </DialogTitle>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh team details"
            onClick={() => void load()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <DialogDescription className="sr-only">
          Team information and conversations.
        </DialogDescription>
        {selected && (
          <button
            className="text-button team-back"
            onClick={() => onSelect(null)}
          >
            <ChevronLeft size={16} />
            All teams
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading && !data ? (
          <p role="status">Loading teams…</p>
        ) : (
          data && (
            <>
              {!selected ? (
                <div className="team-directory">
                  {data.teams?.map((t) => (
                    <button key={t.id} onClick={() => onSelect(t.id)}>
                      <div>
                        <b>{t.label}</b>
                        <small>
                          {t.isYourTeam ? "Your team · " : ""}
                          {t.members} explorers
                        </small>
                      </div>
                      {t.score !== undefined && (
                        <strong>
                          {t.score?.toLocaleString()}
                          <small>points</small>
                        </strong>
                      )}
                      {t.canMessage && <MessageCircle size={19} />}
                    </button>
                  ))}
                  {!data.teams?.length && <p>No teams yet.</p>}
                </div>
              ) : (
                <>
                  <div className="team-card-stats">
                    <span>
                      <Users size={17} />
                      {data.team?.members} explorers
                      {data.team?.isYourTeam ? " · Your team" : ""}
                    </span>
                    {data.team?.score !== undefined && (
                      <strong>
                        <Trophy size={19} />
                        {data.team?.score?.toLocaleString()} points
                      </strong>
                    )}
                  </div>
                  {data.team?.canReadMessages ? (
                    <>
                      <h3>
                        {data.team?.isYourTeam
                          ? "Team inbox"
                          : "Conversation with your team"}
                      </h3>
                      <div
                        ref={messageList}
                        onScroll={(e) => {
                          const list = e.currentTarget;
                          nearBottom.current =
                            list.scrollHeight -
                              list.scrollTop -
                              list.clientHeight <
                            48;
                        }}
                        className="team-message-list"
                        aria-label="Team messages"
                      >
                        {data.messages?.map((m) => (
                          <article
                            key={m.id}
                            className={m.outgoing ? "outgoing" : ""}
                          >
                            <div>
                              <b>{m.sender}</b>
                              <span>
                                {m.fromTeam?.label || "Instructor"}
                                {m.toTeam.id !== data.ownTeam
                                  ? " → " + m.toTeam.label
                                  : ""}
                              </span>
                              <time
                                dateTime={new Date(m.createdAt).toISOString()}
                              >
                                {new Date(m.createdAt).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>
                            <p>{m.text}</p>
                            {data.team?.isYourTeam &&
                              m.fromTeam &&
                              m.fromTeam.id !== data.ownTeam && (
                                <button
                                  className="text-button"
                                  onClick={() => onSelect(m.fromTeam!.id)}
                                >
                                  Reply to {m.fromTeam.label}
                                </button>
                              )}
                          </article>
                        ))}
                        {!data.messages?.length && (
                          <p className="empty-messages">No messages yet.</p>
                        )}
                      </div>
                      {data.team?.canMessage ? (
                        <form className="team-message-form" onSubmit={send}>
                          <label>
                            Message{" "}
                            {data.team?.isYourTeam
                              ? "your team"
                              : data.team?.label}
                            <textarea
                              required
                              maxLength={1000}
                              rows={3}
                              value={text}
                              onChange={(e) => setText(e.target.value)}
                              placeholder="Write a message…"
                              disabled={busy}
                            />
                          </label>
                          <div>
                            <small>
                              {text.length}/1000 · visible to team members
                            </small>
                            <button
                              className="primary"
                              aria-busy={busy}
                              disabled={busy || !text.trim()}
                            >
                              <Send size={16} />
                              {busy ? "Sending…" : "Send message"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="team-muted">
                          Messaging within your team is turned off by your
                          instructor.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="team-muted">
                      {data.team?.isYourTeam
                        ? "Team messaging is turned off by your instructor."
                        : "Messaging other teams is turned off by your instructor."}
                    </p>
                  )}
                </>
              )}
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

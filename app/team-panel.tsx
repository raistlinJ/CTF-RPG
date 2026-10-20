"use client";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { PersonalMuteButton, PersonalMuteControls, type PersonalMutes } from "./personal-mutes";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from "@/components/ui/alert-dialog";
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
  text: string | null;
  canPersonalMute?: boolean;
  personalMuted?: boolean;
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
  muted?: boolean;
  isAdmin?: boolean;
};
export default function TeamPanel({
  open,
  onOpenChange,
  selected,
  onSelect,
  onRead,
  personalMutes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRead: (at: number) => void;
  personalMutes?: PersonalMutes;
}) {
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [confirmClear, setConfirmClear] = useState(false),
    [clearing, setClearing] = useState(false),
    [clearNotice, setClearNotice] = useState("");
  const request = useRef({ id: "", text: "", team: "" }),
    generation = useRef(0),
    messageList = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    sendFailed = useRef(false);
  const loadRequest = useRef<{version:number;controller:AbortController}|null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  async function load(silent = false, signal?: AbortSignal) {
    const target = selected,
      version = generation.current;
    if (loadRequest.current?.version === version) return true;
    loadRequest.current?.controller.abort();
    const controller = new AbortController();
    loadRequest.current = {version,controller};
    const abort = () => controller.abort();
    signal?.addEventListener("abort",abort,{once:true});
    if(signal?.aborted)controller.abort();
    const timeout = setTimeout(abort,12000);
    if (!silent) setLoading(true);
    try {
      const r = await fetch(
          "/api/team-social" +
            (target ? "?team=" + encodeURIComponent(target) : ""),
          {signal:controller.signal},
        ),
        d = (await r.json()) as ResponseData;
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      if (!controller.signal.aborted && version === generation.current && target === selectedRef.current) {
        setData(d);
        if (!sendFailed.current) setError("");
        if (target === d.ownTeam || target === "instructors")
          onRead(d.latestMessageAt);
      }
      return true;
    } catch (e) {
      if (!signal?.aborted && version === generation.current && target === selectedRef.current)
        setError((e as Error).message);
      return false;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort",abort);
      if (loadRequest.current?.controller === controller) loadRequest.current = null;
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
    let first = true;
    const poller = startPolling(async(signal:AbortSignal) => {
      const silent = !first; first = false;
      if (!await load(silent,signal)) throw Error("Could not refresh messages.");
    },{interval:5000});
    return () => {
      generation.current++;
      poller.stop();
      loadRequest.current?.controller.abort();
    };
  }, [open, selected]);
  useEffect(() => { if (open) void load(true); }, [personalMutes?.settings?.revision]);
  useEffect(() => {
    if (nearBottom.current && messageList.current)
      messageList.current.scrollTop = messageList.current.scrollHeight;
  }, [selected, data?.messages?.at(-1)?.id]);
  async function clearChats() {
    if (clearing || busy) return;
    setClearing(true);
    setError("");
    const version = generation.current;
    try {
      const r = await fetch("/api/chat-history", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"clear-all"})});
      const result = await r.json() as {error?:string;clearedThrough:number};
      if (!r.ok) throw Error(result.error || "Could not clear your chats.");
      onRead(result.clearedThrough);
      setClearNotice("Your chat history has been cleared. New messages will appear here.");
      if (version === generation.current) {
        generation.current++;
        setData(current => current ? {...current,messages:[],latestMessageAt:0} : current);
        void load(true);
      }
    } catch(e) {setError((e as Error).message);} finally {setClearing(false);setConfirmClear(false);}
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || clearing || !selected || !text.trim()) return;
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="team-dialog">
        <div className="team-dialog-heading">
          <div>
            <span className="eyebrow">{selected ? "MESSAGES & TEAM DETAILS" : "EXPEDITION TEAMS"}</span>
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
        <DialogDescription className="team-message-help">
          Reopen this conversation anytime with Messages in the game header or press M while exploring.
        </DialogDescription>
        {personalMutes && <PersonalMuteControls controls={personalMutes} />}
        {selected && (
          <button
            className="text-button team-back"
            onClick={() => onSelect(null)}
          >
            <ChevronLeft size={16} />
            All teams
          </button>
        )}
        {clearNotice && <p role="status">{clearNotice}</p>}
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
                          {t.id === "instructors"
                            ? "Shared inbox for all administrators"
                            : `${t.isYourTeam ? "Your team · " : ""}${t.members} explorers`}
                        </small>
                      </div>
                      {t.score !== undefined && (
                        <strong>
                          {t.score?.toLocaleString()}
                          <small>points</small>
                        </strong>
                      )}
                      {t.canReadMessages && <span className="team-open-messages"><MessageCircle size={17} aria-hidden="true" /> Open messages</span>}
                    </button>
                  ))}
                  {!data.teams?.length && <p>No teams yet.</p>}
                </div>
              ) : (
                <>
                  <div className="team-card-stats">
                    <span>
                      <Users size={17} />
                      {selected === "instructors"
                        ? "Your team and administrators"
                        : `${data.team?.members} explorers${data.team?.isYourTeam ? " · Your team" : ""}`}
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
                        {selected === "instructors"
                          ? "Instructor conversation"
                          : data.team?.isYourTeam
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
                            {m.personalMuted ? <p className="personal-muted-message">Message hidden — you muted this player.</p> : <p>{m.text}</p>}
                            <div className="team-message-actions">
                              {m.canPersonalMute && personalMutes && <PersonalMuteButton controls={personalMutes} username={m.sender} muted={m.personalMuted} />}
                              {data.team?.isYourTeam && !data.isAdmin && !m.fromTeam && !m.outgoing && (
                                <button className="text-button" onClick={() => onSelect("instructors")}>Reply to instructors</button>
                              )}
                              {(data.team?.isYourTeam ||
                                (data.isAdmin && selected === "instructors")) &&
                                m.fromTeam &&
                                (data.isAdmin ||
                                  m.fromTeam.id !== data.ownTeam) && (
                                  <button
                                    className="text-button"
                                    onClick={() => onSelect(m.fromTeam!.id)}
                                  >
                                    Reply to {m.fromTeam.label}
                                  </button>
                                )}
                            </div>
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
                              {text.length}/1000 ·{" "}
                              {selected === "instructors"
                                ? "visible to your team and administrators"
                                : "visible to team members"}
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
                          {data.muted
                            ? "Chat is muted for your account or team. You can still read messages."
                            : selected === "instructors" && data.isAdmin
                              ? "Select Reply on a message to open that team’s conversation."
                              : "Messaging is turned off by your instructor."}
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
        <div className="team-message-footer">{data && <button type="button" className="secondary-button" disabled={clearing||busy} onClick={()=>setConfirmClear(true)}>Clear my chats</button>}<button type="button" className="secondary-button" onClick={() => onOpenChange(false)}>Close messages</button></div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmClear} onOpenChange={value=>{if(!clearing)setConfirmClear(value);}}><AlertDialogContent className="chat-confirmation"><AlertDialogHeader><AlertDialogTitle>Clear your chat history?</AlertDialogTitle><AlertDialogDescription>This hides all past sent and received chats from your view, across every team and the instructor conversation. Your teammates, recipients, and administrators keep their copies. New messages will still appear. You cannot undo this clear.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel><button type="button" className="secondary-button danger-button" disabled={clearing} onClick={()=>void clearChats()}>{clearing?"Clearing…":"Clear my chats"}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}

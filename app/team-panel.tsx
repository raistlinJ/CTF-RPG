"use client";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import { clientUuid } from "@/lib/client-uuid.mjs";
import { PersonalMuteButton, PersonalMuteControls, type PersonalMutes } from "./personal-mutes";
import { useEffect, useRef, useState } from "react";
import { PlayerEmotePicker } from "./player-emotes";
import { isPlayerEmote } from "@/lib/player-emotes.mjs";
import type { SentTeamEmoji } from "./team-emoji-effects";
import type { ConversationInbox } from "./use-conversation-inbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from "@/components/ui/alert-dialog";
import {
  MessageCircle,
  Send,
  ChevronLeft,
  Smile,
  Plus,
  Settings,
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
  toUser?: string | null;
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
  onEmojiSent,
  inbox,
  initialMode = "emoji",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onRead: (at: number) => void;
  personalMutes?: PersonalMutes;
  onEmojiSent?: (event: SentTeamEmoji) => void;
  inbox: ConversationInbox;
  initialMode?: "text" | "emoji";
}) {
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [selectedEmoji, setSelectedEmoji] = useState(""),
    [view, setView] = useState<"inbox" | "new" | "settings">("inbox"),
    [search, setSearch] = useState(""),
    [sendNotice, setSendNotice] = useState(""),
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
  const sending = useRef(false);
  const canSendTeamEmoji = !!data?.team?.canMessage;
  selectedRef.current = selected;
  function markConversationRead(target: string, response: ResponseData) {
    const through = new Map<string, number>();
    for (const message of response.messages || []) {
      if (message.personalMuted) continue;
      const id = response.isAdmin && target === "instructors" ? message.fromTeam?.id : target;
      if (id) through.set(id, Math.max(through.get(id) || 0, message.createdAt));
    }
    for (const [id, at] of through) inbox.markRead(id, at);
  }
  async function load(silent = false, signal?: AbortSignal, force = false) {
    const target = selected,
      version = generation.current;
    if (loadRequest.current?.version === version && !force) return true;
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
            (target ? "?view=conversation&team=" + encodeURIComponent(target) : ""),
          {signal:controller.signal},
        ),
        d = (await r.json()) as ResponseData;
      if (!r.ok) throw Error(d.error || "Could not load teams.");
      if (!controller.signal.aborted && version === generation.current && target === selectedRef.current) {
        setData(d);
        if (!sendFailed.current) setError("");
        if (target && nearBottom.current) {
          markConversationRead(target, d);
        }
      }
      return true;
    } catch (e) {
      if (!controller.signal.aborted && !signal?.aborted && version === generation.current && target === selectedRef.current)
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
    setView("inbox");
    setSearch("");
    setSendNotice("");
    setSelectedEmoji(initialMode === "emoji" ? "👋" : "");
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
  }, [open, selected, initialMode]);
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
      for (const conversation of inbox.conversations) inbox.markRead(conversation.id, result.clearedThrough);
      inbox.refresh();
      setClearNotice("Your chat history has been cleared. New messages will appear here.");
      if (version === generation.current) {
        generation.current++;
        setData(current => current ? {...current,messages:[],latestMessageAt:0} : current);
        void load(true);
      }
    } catch(e) {setError((e as Error).message);} finally {setClearing(false);setConfirmClear(false);}
  }
  async function send(emoji = "") {
    if (emoji && !isPlayerEmote(emoji)) return;
    if (sending.current || busy || clearing || !selected || !data?.team?.canMessage || (!emoji && !text.trim())) return;
    sending.current = true;
    setBusy(true);
    setSendNotice("");
    sendFailed.current = false;
    setError("");
    const target = selected,
      body = emoji || text.trim(),
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
        if (emoji && target !== "instructors" && (data.isAdmin || target !== data.ownTeam)) onEmojiSent?.({ id: request.current.id, emoji, toTeam: { id: target, label: data.team.label } });
        if (!emoji) setText("");
        request.current = { id: "", text: "", team: "" };
        nearBottom.current = true;
        setSendNotice(emoji ? `Sent ${emoji}` : "Message sent");
        void load(true, undefined, true);
        inbox.refresh();
      }
    } catch (e) {
      if (version === generation.current) {
        sendFailed.current = true;
        setError(
          controller.signal.aborted
            ? "Sending timed out. Your message is preserved; retry to safely check or send this message."
            : (e as Error).message,
        );
      }
    } finally {
      clearTimeout(timeout);
      sending.current = false;
      setBusy(false);
    }
  }
  const query = search.trim().toLocaleLowerCase();
  const conversations = inbox.conversations.filter(conversation => !query || `${conversation.label} ${conversation.preview.text}`.toLocaleLowerCase().includes(query));
  const teams = (data?.teams || []).filter(team => (!data?.isAdmin || team.id !== "instructors") && (team.canReadMessages || team.canMessage) && (!query || team.label.toLocaleLowerCase().includes(query)));
  function back() { setView("inbox"); setSearch(""); if (selected) onSelect(null); }
  function readVisibleMessages() {
    if (selected && data && nearBottom.current) markConversationRead(selected, data);
  }
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`team-dialog phone-chat ${selected ? "phone-thread" : "phone-inbox"}`}>
        <div className="phone-chat-header">
          {(selected || view !== "inbox") && <button type="button" className="phone-icon-button" aria-label="Back to messages" onClick={back}><ChevronLeft size={23} /></button>}
          <div className="phone-chat-title">
            <DialogTitle>{selected ? data?.team?.label || "Conversation" : view === "new" ? "New message" : view === "settings" ? "Chat settings" : "Messages"}</DialogTitle>
            <DialogDescription>{selected ? (selected === "instructors" ? "Instructor conversation" : `${data?.team?.members ?? "…"} explorer${data?.team?.members === 1 ? "" : "s"}${data?.team?.isYourTeam ? " · Your team" : ""}`) : view === "inbox" ? inbox.unreadCount ? `${inbox.unreadCount} unread message${inbox.unreadCount === 1 ? "" : "s"}` : "All caught up" : view === "new" ? "Choose a team to message" : "Your inbox preferences"}</DialogDescription>
          </div>
          {!selected && view === "inbox" && <div className="phone-header-actions">
            <button type="button" className="phone-icon-button" aria-label="New message" onClick={() => { setView("new"); setSearch(""); }}><Plus size={21} /></button>
            <button type="button" className="phone-icon-button" aria-label="Chat settings" onClick={() => setView("settings")}><Settings size={19} /></button>
          </div>}
        </div>
        {(error || (!selected && inbox.error)) && <p className="phone-chat-alert error" role="alert">{error || inbox.error}</p>}
        {clearNotice && <p className="phone-chat-alert" role="status">{clearNotice}</p>}
        {!selected ? <div className="phone-inbox-body">
          {view !== "settings" && <label className="phone-chat-search"><span className="sr-only">{view === "new" ? "Search teams" : "Search conversations"}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={view === "new" ? "Search teams" : "Search messages"} /></label>}
          {view === "settings" ? <div className="phone-chat-settings">
            {personalMutes && <PersonalMuteControls controls={personalMutes} />}
            <section className="phone-history-settings"><h3>Chat history</h3><p>Clear your copy of past conversations. Other people keep theirs.</p><button type="button" className="text-button clear-chat-history" disabled={clearing || busy} onClick={() => setConfirmClear(true)}>Clear my chats</button></section>
          </div> : view === "new" ? <div className="phone-conversation-list" aria-label="Teams to message">
            {loading && !data && <p className="phone-empty">Loading teams…</p>}
            {teams.map(team => <button type="button" className="phone-conversation-row" key={team.id} onClick={() => onSelect(team.id)}>
              <span className={`phone-chat-avatar ${team.id === "instructors" ? "instructor" : ""}`} aria-hidden="true">{team.id === "instructors" ? "IN" : team.label.slice(0, 2).toUpperCase()}</span>
              <span className="phone-row-content"><strong>{team.label}</strong><span>{team.id === "instructors" ? "Message your instructors" : `${team.isYourTeam ? "Your team · " : ""}${team.members} explorers`}</span></span><MessageCircle size={18} aria-hidden="true" />
            </button>)}
            {data && !teams.length && <p className="phone-empty">No teams match your search.</p>}
          </div> : <div className="phone-conversation-list" aria-label="Conversations">
            {inbox.loading && <p className="phone-empty" role="status">Loading messages…</p>}
            {conversations.map(conversation => <button type="button" key={conversation.id} className={`phone-conversation-row ${conversation.unreadCount ? "unread" : ""}`} onClick={() => onSelect(conversation.id)} aria-label={`${conversation.label}${conversation.unreadCount ? `, ${conversation.unreadCount} unread messages` : ""}`}>
              <span className={`phone-chat-avatar ${conversation.id === "instructors" ? "instructor" : ""}`} aria-hidden="true">{conversation.id === "instructors" ? "IN" : conversation.label.slice(0, 2).toUpperCase()}</span>
              <span className="phone-row-content"><span className="phone-row-heading"><strong>{conversation.label}</strong><time dateTime={new Date(conversation.latestAt).toISOString()}>{new Date(conversation.latestAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></span><span className="phone-message-preview">{conversation.preview.mine ? "You" : conversation.preview.sender}: {conversation.preview.text}</span></span>
              {conversation.unreadCount > 0 && <span className="phone-unread-badge" aria-hidden="true">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}
            </button>)}
            {!inbox.loading && !conversations.length && <div className="phone-empty"><MessageCircle size={34} aria-hidden="true" /><h3>{query ? "No matching conversations" : "No messages yet"}</h3><p>{query ? "Try another name or message." : "Start a conversation with a team."}</p>{!query && <button type="button" className="secondary-button" onClick={() => setView("new")}>New message</button>}</div>}
          </div>}
        </div> : <>
          {loading && !data && <p className="phone-empty" role="status">Loading conversation…</p>}
          {data?.team?.canReadMessages ? <div ref={messageList} className="team-message-list phone-message-list" role="region" tabIndex={0} aria-label={`Messages with ${data.team.label}`} onScroll={event => { const list = event.currentTarget; nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48; if (nearBottom.current) readVisibleMessages(); }}>
            {data.messages?.map(message => <article key={message.id} className={`${message.outgoing ? "outgoing" : "incoming"}${isPlayerEmote(message.text) ? " emoji-message" : ""}`}>
              <div><b>{message.sender}</b>{message.toUser ? <span>To {message.toUser} · User only</span> : message.fromTeam && <span>{message.fromTeam.label}</span>}<time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
              {message.personalMuted ? <p className="personal-muted-message">Message hidden — you muted this player.</p> : <p className={isPlayerEmote(message.text) ? "phone-emoji-text" : undefined}>{message.text}</p>}
              <div className="team-message-actions">
                {message.canPersonalMute && personalMutes && <PersonalMuteButton controls={personalMutes} username={message.sender} muted={message.personalMuted} />}
                {data.isAdmin && selected === "instructors" && message.fromTeam && <button type="button" className="text-button" onClick={() => onSelect(message.fromTeam!.id)}>Reply to {message.fromTeam.label}</button>}
              </div>
            </article>)}
            {!data.messages?.length && <div className="phone-empty"><MessageCircle size={30} aria-hidden="true" /><p>Start with a wave 👋</p></div>}
          </div> : data && <p className="phone-empty">Messaging this team is turned off by your instructor.</p>}
          {data?.team?.canReadMessages && data.team.canMessage ? <form className="phone-composer" aria-label="Message composer" onSubmit={event => { event.preventDefault(); if (!selectedEmoji) void send(); }}>
            <div className="phone-compose-tabs" role="group" aria-label="Message type">
              <button type="button" aria-pressed={!!selectedEmoji} disabled={busy} onClick={() => setSelectedEmoji("👋")}><Smile size={17} aria-hidden="true" /> Emoji</button>
              <button type="button" aria-pressed={!selectedEmoji} disabled={busy} onClick={() => setSelectedEmoji("")}><MessageCircle size={17} aria-hidden="true" /> Text</button>
            </div>
            {selectedEmoji && canSendTeamEmoji ? <PlayerEmotePicker onSelect={emoji => void send(emoji)} disabled={busy || clearing} description="Tap an emoji to send" /> : <div className="phone-text-compose"><textarea required maxLength={1000} rows={2} value={text} aria-label={`Message ${data.team.label}`} placeholder="Write a message…" onChange={event => setText(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault();
                if (!event.repeat) event.currentTarget.form?.requestSubmit();
              }
            }} disabled={busy} /><button type="submit" className="phone-send-button" aria-label="Send message" disabled={busy || clearing || !text.trim()}><Send size={18} aria-hidden="true" /></button></div>}
            <small className="phone-send-status" role="status">{busy ? "Sending…" : sendNotice || (selectedEmoji ? "" : `${text.length}/1000 · Enter to send · Shift+Enter for a new line`)}</small>
          </form> : data?.team?.canReadMessages && <p className="phone-chat-alert">{data.muted ? "Your account or team is muted. You can still read messages." : selected === "instructors" && data.isAdmin ? "Tap Reply to open a team's conversation." : "Sending messages is turned off."}</p>}
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmClear} onOpenChange={value => { if (!clearing) setConfirmClear(value); }}><AlertDialogContent className="chat-confirmation"><AlertDialogHeader><AlertDialogTitle>Clear your chat history?</AlertDialogTitle><AlertDialogDescription>This hides past sent and received chats from your view. Your teammates, recipients, and administrators keep their copies. New messages will still appear.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel><button type="button" className="secondary-button danger-button" disabled={clearing} onClick={() => void clearChats()}>{clearing ? "Clearing…" : "Clear my chats"}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

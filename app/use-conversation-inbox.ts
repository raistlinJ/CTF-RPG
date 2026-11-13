"use client";
import { useEffect, useRef, useState } from "react";
import { startPolling } from "@/lib/adaptive-poll.mjs";
import { savedMessageReadAt } from "@/lib/message-inbox.mjs";
import { conversationReadKey, loadConversationReads, readConversation, saveConversationReads } from "@/lib/conversation-inbox.mjs";

export type Conversation = { id: string; label: string; unreadCount: number; latestAt: number; preview: { id: string; text: string; sender: string; mine: boolean }; isYourTeam: boolean };
export type ConversationInbox = { conversations: Conversation[]; unreadCount: number; loading: boolean; error: string; refresh: () => void; markRead: (id: string, at: number) => void };
export function useConversationInbox(username: string | undefined, scope: string | undefined, enabled: boolean): ConversationInbox {
  const owner = `${username}:${scope}`;
  const [snapshot, setSnapshot] = useState<{ owner: string; conversations: Conversation[]; unreadCount: number; error: string }>({ owner: "", conversations: [], unreadCount: 0, error: "" });
  const reads = useRef<{ baseline: number; through: Record<string, number> }>({ baseline: 0, through: {} });
  const revision = useRef(0);
  const poll = useRef<{ refresh: () => void } | null>(null);
  useEffect(() => {
    if (!username || !scope || !enabled) return;
    try { reads.current = loadConversationReads(localStorage, username, scope, savedMessageReadAt(localStorage, username)); }
    catch { reads.current = { baseline: 0, through: {} }; }
    let live = true;
    const poller = startPolling(async (signal: AbortSignal) => {
      const version = revision.current;
      const response = await fetch("/api/chat-conversations?read=" + encodeURIComponent(JSON.stringify(reads.current)), { signal });
      const data = await response.json() as { conversations: Conversation[]; unreadCount: number; error?: string };
      if (!response.ok) throw Error(data.error || "Could not load messages.");
      if (live && !signal.aborted && version === revision.current) setSnapshot({ owner, conversations: data.conversations, unreadCount: data.unreadCount, error: "" });
    }, { interval: 3000, onError: () => { if (live) setSnapshot(previous => ({ owner, conversations: previous.owner === owner ? previous.conversations : [], unreadCount: previous.owner === owner ? previous.unreadCount : 0, error: "Messages are reconnecting…" })); } });
    poll.current = poller;
    function storage(event: StorageEvent) {
      if (event.key !== conversationReadKey(username, scope)) return;
      reads.current = loadConversationReads(localStorage, username, scope);
      revision.current++;
      poller.refresh();
    }
    window.addEventListener("storage", storage);
    poller.refresh();
    return () => { live = false; poll.current = null; poller.stop(); window.removeEventListener("storage", storage); };
  }, [username, scope, enabled, owner]);
  function markRead(id: string, at: number) {
    if (!username || !scope) return;
    if (at <= (reads.current.through[id] ?? reads.current.baseline)) return;
    reads.current = readConversation(reads.current, id, at);
    try { saveConversationReads(localStorage, username, scope, reads.current); } catch {}
    revision.current++;
    setSnapshot(previous => {
      if (previous.owner !== owner) return previous;
      const conversations = previous.conversations.map(conversation => conversation.id === id && conversation.latestAt <= at ? { ...conversation, unreadCount: 0 } : conversation);
      return { ...previous, conversations, unreadCount: conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0) };
    });
    poll.current?.refresh();
  }
  return { conversations: snapshot.owner === owner && enabled ? snapshot.conversations : [], unreadCount: snapshot.owner === owner && enabled ? snapshot.unreadCount : 0, loading: enabled && snapshot.owner !== owner, error: snapshot.owner === owner ? snapshot.error : "", refresh: () => poll.current?.refresh(), markRead };
}

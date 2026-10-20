"use client";
import {useEffect,useState} from "react";
import AdminHeader from "../../admin-header";
import SocialNav from "../social-nav";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from "@/components/ui/alert-dialog";

type Chat={kind:"team"|"instructor";id:string;sender:string;username:string;from_name:string;to_name:string;text:string;created_at:number};
type History={messages:Chat[];total:number;allTotal:number;through:number;teams:{id:string;name:string}[]};
type Confirmation={kind:"one";chat:Chat}|{kind:"all";through:number;count:number};

export default function ChatsAdmin() {
  const [history,setHistory]=useState<History|null>(null),[search,setSearch]=useState(""),[query,setQuery]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setOffset(0);},250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    const controller=new AbortController();let live=true;setLoading(true);setError("");
    const params=new URLSearchParams({q:query,from,to,offset:String(offset)});
    void fetch(`/api/admin/chats?${params}`,{signal:controller.signal}).then(async r=>{
      const data=await r.json() as History & {error?:string};
      if(!r.ok)throw Error(data.error||"Could not load chats.");
      if(live){setHistory(data);if(offset>0&&offset>=data.total)setOffset(Math.max(0,Math.floor((data.total-1)/50)*50));}
    }).catch(e=>{if(live){setHistory(null);setError(e.message);}}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;controller.abort();};
  },[query,from,to,offset,refresh]);
  async function remove() {
    if(busy||!confirmation)return;
    setBusy(true);setError("");setNotice("");
    try {
      const body=confirmation.kind==="one"?{action:"delete",kind:confirmation.chat.kind,id:confirmation.chat.id}:{action:"clear-all",through:confirmation.through};
      const response=await fetch("/api/admin/chats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json() as {error?:string;deleted:number};
      if(!response.ok)throw Error(result.error||"Could not delete chats.");
      setNotice(`Deleted ${result.deleted} chat ${result.deleted===1?"message":"messages"}.`);setConfirmation(null);setRefresh(n=>n+1);
    } catch(e) {setError((e as Error).message);setConfirmation(null);} finally {setBusy(false);}
  }
  const unavailable=loading||busy||search!==query;
  const teams=history?.teams||[];
  return <main className="admin-studio"><AdminHeader active="social"/><section className="admin-workspace">
    <SocialNav active="chats"/>
    <div className="roster-heading"><div><h1>Chats</h1><p>View messages to and from teams and instructors, including history users have cleared for themselves.</p></div>
      <div className="social-chat-actions"><button className="secondary-button" disabled={loading||busy} onClick={()=>setRefresh(n=>n+1)}>Refresh</button><button className="secondary-button danger-button" disabled={unavailable||!history?.allTotal} onClick={()=>history&&setConfirmation({kind:"all",through:history.through,count:history.allTotal})}>Clear all chats</button></div>
    </div>
    <div className="social-chat-filters">
      <label>Search chats<input type="search" value={search} maxLength={1000} disabled={busy} placeholder="Sender, team, or message…" onChange={e=>setSearch(e.target.value)}/></label>
      <label>From<select value={from} disabled={busy} onChange={e=>{setFrom(e.target.value);setOffset(0);}}><option value="">All senders</option><option value="instructors">Instructors</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>To<select value={to} disabled={busy} onChange={e=>{setTo(e.target.value);setOffset(0);}}><option value="">All recipients</option><option value="instructors">Instructors</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {history&&<p>{history.total} matching messages · {history.total?offset+1:0}–{Math.min(offset+50,history.total)} · {history.allTotal} total</p>}
    {loading?<p role="status">Loading chats…</p>:history&&<div className="social-chat-list">{history.messages.map(chat=><article className="social-chat-message" key={`${chat.kind}:${chat.id}`}>
      <div className="social-chat-heading"><div><strong>From: {chat.from_name} → To: {chat.to_name}</strong><small>Sent by {chat.sender}{chat.username&&chat.username!==chat.sender?` (${chat.username})`:""} · {new Date(chat.created_at).toLocaleString()}</small></div><button className="secondary-button danger-button" disabled={busy} onClick={()=>setConfirmation({kind:"one",chat})} aria-label={`Delete message from ${chat.sender} to ${chat.to_name}`}>Delete</button></div>
      <p className="social-chat-body">{chat.text}</p>
    </article>)}{!history.messages.length&&<p>No chats in this view.</p>}</div>}
    <div className="review-pagination"><button className="secondary-button" disabled={unavailable||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button><button className="secondary-button" disabled={unavailable||!history||offset+50>=history.total} onClick={()=>setOffset(n=>n+50)}>Next</button></div>
  </section>
  <AlertDialog open={!!confirmation} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null);}}><AlertDialogContent className="chat-confirmation"><AlertDialogHeader>
    <AlertDialogTitle>{confirmation?.kind==="all"?"Clear all chat history?":"Delete this chat message?"}</AlertDialogTitle>
    <AlertDialogDescription>{confirmation?.kind==="all"?`Permanently delete all ${confirmation.count} chat messages loaded across every team and the instructor inbox, including messages outside your current filters. Messages arriving after this history was loaded will remain.`:"This permanently deletes the message for everyone, including its sender and recipients."} This cannot be undone. Notifications are separate.</AlertDialogDescription>
  </AlertDialogHeader>{confirmation?.kind==="one"&&<div className="social-chat-preview"><strong>{confirmation.chat.sender} · {confirmation.chat.from_name} → {confirmation.chat.to_name}</strong><p className="social-chat-body">{confirmation.chat.text}</p></div>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><button className="secondary-button danger-button" disabled={busy} onClick={()=>void remove()}>{busy?"Deleting…":confirmation?.kind==="all"?"Clear all chats":"Delete message"}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

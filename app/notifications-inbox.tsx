"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {startPolling} from '@/lib/adaptive-poll.mjs';
import {useEffect,useRef,useState} from 'react';
import {Bell} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
type Notice={id:string;title:string;body:string;author:string;created_at:number;read_at:number|null};
type Summary={unread:number;latestAt:number;historyVersion?:string};
export default function NotificationsInbox({username,summary,summaryPolling=false}:{username:string;summary?:Summary|null;summaryPolling?:boolean}){
 const [open,setOpen]=useState(false),[unread,setUnread]=useState(0),[rows,setRows]=useState<Notice[]>([]),[offset,setOffset]=useState(0),[error,setError]=useState(''),[fresh,setFresh]=useState(false),[historyVersion,setHistoryVersion]=useState('');
 const last=useRef<number|undefined>(undefined),loadVersion=useRef(0);
 function applySummary(d:Summary){setUnread(d.unread);if(d.historyVersion!==undefined)setHistoryVersion(d.historyVersion);if(last.current!==undefined&&d.latestAt>last.current)setFresh(true);last.current=d.latestAt;}
 useEffect(()=>{if(summary)applySummary(summary);},[summary]);
 useEffect(()=>{if(!fresh)return;const timer=setTimeout(()=>setFresh(false),5000);return()=>clearTimeout(timer);},[fresh]);
 useEffect(()=>{
  if(summaryPolling)return;
  const poller=startPolling(async(signal:AbortSignal)=>{const r=await fetch('/api/notifications?summary=true',{signal});if(!r.ok)throw Error('Could not refresh notifications.');const d=await r.json() as Summary;if(!signal.aborted)applySummary(d);},{interval:5000});
  return()=>poller.stop();
 },[username,summaryPolling]);
 async function load(){const version=++loadVersion.current;try{const r=await fetch('/api/notifications?offset='+offset);const d=await r.json() as {notifications:Notice[];unread:number;historyVersion?:string;error?:string};if(!r.ok)throw Error(d.error);if(version!==loadVersion.current)return;if(!d.notifications.length&&offset>0){setOffset(0);return;}setRows(d.notifications);setUnread(d.unread);if(d.historyVersion!==undefined)setHistoryVersion(d.historyVersion);setError('');}catch(e){if(version===loadVersion.current)setError((e as Error).message);}}
 useEffect(()=>{if(open)void load();return()=>{loadVersion.current++;};},[open,offset,unread,historyVersion]);
 async function read(id?:string){try{const r=await fetch('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{action:'read',id}:{action:'readAll'})});if(!r.ok)throw Error('Could not mark notifications read.');await load();}catch(e){setError((e as Error).message);}}
 return <><button className="notification-bell" aria-label={`Notifications (${unread} unread)`} onClick={()=>{setOpen(true);setFresh(false);}}><Bell size={19}/>{unread>0&&<span className="notification-count">{unread}</span>}</button>{fresh&&<span className="notification-toast" role="status">New notification</span>}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="notifications-modal"><DialogTitle>Notifications</DialogTitle><div className="notification-actions"><span>{unread} unread</span><button className="text-button" disabled={!unread} onClick={()=>void read()}>Mark all read</button><button className="text-button" onClick={()=>void load()}>Refresh</button></div>{error&&<p role="alert">{error}</p>}<div className="notification-list">{rows.map(n=><article key={n.id} className={n.read_at!==null?'read':'unread'}><h3>{n.title}</h3><small>{n.author} · {new Date(n.created_at).toLocaleString()}</small><p className="notification-body">{n.body}</p>{n.read_at===null&&<button className="text-button" onClick={()=>void read(n.id)}>Mark read</button>}</article>)}{!rows.length&&<p>No notifications here.</p>}</div><div className="review-pagination"><button className="secondary-button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button className="secondary-button" disabled={rows.length<50} onClick={()=>setOffset(offset+50)}>Next</button></div></DialogContent></Dialog></>;
}

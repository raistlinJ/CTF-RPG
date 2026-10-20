"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import AdminHeader from "../admin-header";
import SocialNav from "../social/social-nav";
import {useEffect,useRef,useState} from 'react';
import {clientUuid} from '@/lib/client-uuid.mjs';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';

type Notice={id:string;title:string;body:string;scope:string;created_at:number};
type State={users:string[];teams:{id:string;name:string}[];notifications:Notice[];total:number;through:number};
type Confirmation={kind:'one';notice:Notice}|{kind:'all';count:number;through:number};

export default function NotificationsAdmin(){
 const [state,setState]=useState<State|null>(null),[scope,setScope]=useState('all'),[targets,setTargets]=useState<string[]>([]),[title,setTitle]=useState(''),[body,setBody]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const pending=useRef<{key:string;id:string}|null>(null);
 useEffect(()=>{
  let live=true;const controller=new AbortController();setLoading(true);setError('');
  void fetch('/api/admin/notifications?offset='+offset,{signal:controller.signal}).then(async r=>{
   const data=await r.json() as State & {error?:string};if(!r.ok)throw Error(data.error||'Administrator access required.');
   if(live){setState(data);if(offset>0&&offset>=data.total)setOffset(Math.max(0,Math.floor((data.total-1)/50)*50));}
  }).catch(e=>{if(live){setState(null);setError(e.message);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[offset,refresh]);
 function reload(){setRefresh(n=>n+1);}
 async function send(e:React.FormEvent){
  e.preventDefault();if(busy||confirmation)return;
  setBusy(true);setError('');setMessage('');
  try{
   const payload={title,body,scope,targets},key=JSON.stringify(payload);if(pending.current?.key!==key)pending.current={key,id:clientUuid()};
   const r=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,id:pending.current!.id})});
   const data=await r.json() as {error?:string};if(!r.ok)throw Error(data.error||'Notification could not be sent.');
   pending.current=null;setTitle('');setBody('');setMessage('Notification sent.');setOffset(0);reload();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(){
  if(busy||!confirmation)return;setBusy(true);setError('');setMessage('');
  try{
   const payload=confirmation.kind==='one'?{action:'delete',id:confirmation.notice.id}:{action:'clear-all',through:confirmation.through};
   const r=await fetch('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await r.json() as {error?:string;deleted:number};if(!r.ok)throw Error(data.error||'Could not delete notifications.');
   setMessage(`Deleted ${data.deleted} ${data.deleted===1?'notification':'notifications'}.`);if(confirmation.kind==='all')setOffset(0);reload();
  }catch(e){setError((e as Error).message);}finally{setConfirmation(null);setBusy(false);}
 }
 const choices=scope==='users'?state?.users.map(username=>({id:username,name:username})):state?.teams;
 return <main className="admin-studio"><AdminHeader active="social"/><section className="admin-workspace"><SocialNav active="notifications"/>
  <div className="roster-heading"><div><h1>Notifications</h1><p>Send announcements to everyone, selected teams, or selected users.</p></div>
   <div className="social-chat-actions"><button className="secondary-button" disabled={busy||loading} onClick={reload}>Refresh</button><button className="secondary-button danger-button" disabled={busy||loading||!state?.total} onClick={()=>state&&setConfirmation({kind:'all',count:state.total,through:state.through})}>Clear all notifications</button></div>
  </div>
  {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
  {loading&&!state&&<p role="status">Loading notifications…</p>}
  {state&&<div className="roster-columns"><form className="admin-editor" onSubmit={send}><fieldset disabled={busy||!!confirmation}>
   <label>Recipients<select aria-label="Notification recipients" value={scope} onChange={e=>{setScope(e.target.value);setTargets([]);}}><option value="all">Everyone</option><option value="teams">Selected teams</option><option value="users">Selected users</option></select></label>
   {scope!=='all'&&<div className="notification-recipient-picker">{choices?.map(c=><label key={c.id}><input type="checkbox" checked={targets.includes(c.id)} onChange={e=>setTargets(e.target.checked?[...targets,c.id]:targets.filter(t=>t!==c.id))}/>{c.name}</label>)}{!choices?.length&&<p>No recipients available.</p>}</div>}
   <label>Title<input aria-label="Notification title" required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>Message<textarea aria-label="Notification message" required maxLength={5000} rows={6} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <button className="primary" disabled={scope!=='all'&&!targets.length}>{busy?'Working…':'Send notification'}</button>
  </fieldset></form>
  <section className="admin-editor"><h2>Sent notifications</h2><p>{state.total} notifications · {state.total?offset+1:0}–{Math.min(offset+50,state.total)}</p>
   {loading?<p role="status">Loading notifications…</p>:<div>{state.notifications.map(notice=><article className="notification-history" key={notice.id}>
    <div className="social-chat-heading"><div><h3>{notice.title}</h3><small>{notice.scope==='all'?'Everyone':notice.scope==='teams'?'Selected teams':'Selected users'} · {new Date(notice.created_at).toLocaleString()}</small></div><button type="button" className="secondary-button danger-button" disabled={busy} aria-label={`Delete notification: ${notice.title}`} onClick={()=>setConfirmation({kind:'one',notice})}>Delete</button></div>
    <p className="notification-body">{notice.body}</p>
   </article>)}{!state.notifications.length&&<p>No notifications sent yet.</p>}</div>}
   <div className="review-pagination"><button className="secondary-button" disabled={busy||loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Previous</button><button className="secondary-button" disabled={busy||loading||offset+50>=state.total} onClick={()=>setOffset(n=>n+50)}>Next</button></div>
  </section></div>}
 </section>
 <AlertDialog open={!!confirmation} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null);}}><AlertDialogContent className="chat-confirmation"><AlertDialogHeader>
  <AlertDialogTitle>{confirmation?.kind==='all'?'Clear all notifications?':'Delete this notification?'}</AlertDialogTitle>
  <AlertDialogDescription>{confirmation?.kind==='all'?`Permanently delete all ${confirmation.count} notifications in the loaded history, including other pages and announcements sent to selected teams or users. Notifications newer than the loaded history will remain.`:'Permanently delete this notification for everyone who received it.'} Delivery and read history are also removed. This cannot be undone. Chats are separate.</AlertDialogDescription>
 </AlertDialogHeader>{confirmation?.kind==='one'&&<div className="social-chat-preview"><strong>{confirmation.notice.title}</strong><p className="notification-body">{confirmation.notice.body}</p></div>}
 <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><button className="secondary-button danger-button" disabled={busy} onClick={()=>void remove()}>{busy?'Deleting…':confirmation?.kind==='all'?'Clear all notifications':'Delete notification'}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </main>;
}

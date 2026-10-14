"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import AdminHeader from "../admin-header";
import TeamsNav from "./teams-nav";
import GiftPointsDialog from "./gift-points-dialog";
import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import TeamPanel from "@/app/team-panel";
import type { Team } from "@/app/team-setup";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type ManagedTeam = Team & { revision: number; muted: number; disabled: number };
type Member = { team: string; username: string; disabled: number; muted: number };
type BulkAction = "mute" | "unmute" | "disable" | "enable" | "delete";
const actions: Record<BulkAction, string> = { mute: "Mute chat", unmute: "Unmute chat", disable: "Disable", enable: "Enable", delete: "Delete" };
export default function TeamsAdmin() {
  const [teams, setTeams] = useState<ManagedTeam[]>([]), [members, setMembers] = useState<Member[]>([]),
    [max, setMax] = useState(4), [allowed, setAllowed] = useState(false), [loading, setLoading] = useState(true),
    [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false),
    [viewedTeam, setViewedTeam] = useState<string | null>(null), [panelOpen, setPanelOpen] = useState(false),
    [giftTeam, setGiftTeam] = useState<Team | null>(null), [selectedIds, setSelectedIds] = useState<string[]>([]),
    [query, setQuery] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  async function load() {
    const r = await fetch("/api/admin/teams"), d = await r.json() as { error?: string; teams: ManagedTeam[]; members?: Member[]; maxMembers: number };
    if (!r.ok) throw Error(d.error || "Could not load teams.");
    setTeams(d.teams); setMembers(d.members || []); setMax(d.maxMembers); setAllowed(true);
    setSelectedIds(current => current.filter(id => d.teams.some(t => t.id === id)));
  }
  useEffect(() => { void Promise.resolve().then(load).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function refresh() {
    if (busy) return;
    setBusy(true); setError("");
    try { await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const names = (id: string) => members.filter(m => m.team === id).map(m => m.username + (m.disabled ? " (disabled)" : m.muted ? " (chat muted)" : "")).join(", ");
  const filtered = teams.filter(t => `${t.name} ${names(t.id)}`.toLowerCase().includes(query.toLowerCase().trim()));
  const selected = teams.filter(t => selectedIds.includes(t.id));
  const allShown = filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id));
  const someShown = filtered.some(t => selectedIds.includes(t.id));
  async function applyBulk(action: BulkAction) {
    if (busy || !selected.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/admin/teams", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({action, teams:selected.map(t => ({id:t.id,revision:t.revision}))}) });
      const d = await r.json() as {error?:string; updated:number};
      if (!r.ok) throw Error(d.error || "Could not update selected teams.");
      await load(); setSelectedIds([]);
      if (action === "delete" && selectedIds.includes(viewedTeam || "")) { setPanelOpen(false); setViewedTeam(null); }
      const descriptions = {mute:"muted in chat",unmute:"unmuted in chat",disable:"disabled",enable:"enabled",delete:"deleted. Members can choose a team again"};
      setMessage(`${d.updated} ${d.updated === 1 ? "team" : "teams"} ${descriptions[action]}.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setConfirmDelete(false); }
  }
  return <main className="admin-studio">
    <AdminHeader active="teams" />
    <section className="admin-workspace">
      <TeamsNav active="manage" />
      <div className="roster-heading"><div><span className="eyebrow">ADMIN STUDIO</span><h1>Manage teams</h1><p>Manage team access, chat, members and points.</p></div>
        {allowed && <a className="secondary-button" href="/api/admin/backup"><Download size={17}/>Full backup</a>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
      {loading ? <p role="status">Loading teams…</p> : !allowed ? <a href="/admin">Sign in as an admin</a> : <>
        <section className="user-bulk-actions" aria-label="Selected team actions">
          <div className="user-selection-heading">
            <label><Checkbox aria-label="Select all shown teams" disabled={busy || !filtered.length} checked={allShown ? true : someShown ? "indeterminate" : false} onCheckedChange={value => {
              const shown=filtered.map(t=>t.id);setSelectedIds(current=>value===true?[...new Set([...current,...shown])]:current.filter(id=>!shown.includes(id)));
            }}/>Select all shown teams</label>
            <span>{selected.length} selected</span><button type="button" className="text-button" disabled={busy || !selected.length} onClick={()=>setSelectedIds([])}>Clear selection</button>
          </div>
          <div className="admin-actions">{(Object.keys(actions) as BulkAction[]).map(action=><button key={action} type="button" className={`secondary-button${action==="delete"?" danger-button":""}`} disabled={busy || !selected.length} onClick={()=>action==="delete"?setConfirmDelete(true):void applyBulk(action)}>{actions[action]}</button>)}</div>
          <p>Mute blocks outgoing chat for all team members. Disable pauses their access and prevents new joins. Enable and unmute restore team access; individual user restrictions still apply.</p>
        </section>
        <section className="team-roster" aria-label="Team list">
          <div className="roster-tools"><label>Search teams<input type="search" placeholder="Team or member name" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" className="icon-button" aria-label="Refresh teams" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>
          <div className="roster-list users-roster-list">
            {filtered.map(t=><article key={t.id} className={`user-row team-row${selectedIds.includes(t.id)?" selected":""}${t.disabled?" disabled-account":""}`}>
              <input type="checkbox" aria-label={`Select ${t.name}`} checked={selectedIds.includes(t.id)} disabled={busy} onChange={e=>setSelectedIds(current=>e.target.checked?[...current,t.id]:current.filter(id=>id!==t.id))}/>
              <button type="button" className="team-row-summary" aria-label={`View ${t.name}`} disabled={busy} onClick={()=>{setViewedTeam(t.id);setPanelOpen(true);}}>
                <span className="account-avatar">{t.name.slice(0,2).toUpperCase()}</span>
                <div className="team-row-name"><b>{t.name}</b><small>{t.disabled?"Disabled":"Active"}{t.muted?" · Chat muted":""}</small></div>
                <div className="team-row-members"><b>{t.members} / {max} members</b><small>{names(t.id)||"No members"}</small></div>
                <span>{(t.score||0).toLocaleString()} pts<small>{(t.pointAwards?.reduce((sum,a)=>sum+a.points,0)||0).toLocaleString()} gifted</small></span>
              </button>
              <div className="team-row-actions"><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setMessage("");setError("");setGiftTeam(t);}}>Gift points</button></div>
              {!!t.pointAwards?.length && <details className="team-gift-history"><summary>Point gift history ({t.pointAwards.length})</summary><ul>{t.pointAwards.map(a=><li key={a.id}><strong>+{a.points.toLocaleString()} points</strong><p>{a.comment}</p><small>{a.awarded_by} · {new Date(a.created_at).toLocaleString()}</small></li>)}</ul></details>}
            </article>)}
            {!filtered.length && <p>{teams.length?"No teams match your search.":"No teams yet. Students create or join a team after signing in."}</p>}
          </div>
        </section>
      </>}
    </section>
    {giftTeam && <GiftPointsDialog team={giftTeam} onClose={()=>setGiftTeam(null)} onSaved={async points=>{await load();setMessage(`Gifted ${points.toLocaleString()} points to ${giftTeam.name}.`);}}/>}
    <TeamPanel open={panelOpen} onOpenChange={setPanelOpen} selected={viewedTeam} onSelect={setViewedTeam} onRead={()=>{}}/>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>Delete {selected.length} {selected.length===1?"team":"teams"}?</AlertDialogTitle>
      <AlertDialogDescription>Members will choose a team again. Their accounts, individual points and challenge progress stay saved. Team messages and point gifts are removed.</AlertDialogDescription>
      <ul className="bulk-delete-users">{selected.map(t=><li key={t.id}>{t.name}</li>)}</ul>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="danger-button" disabled={busy || !selected.length} onClick={()=>void applyBulk("delete")}>Delete teams</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

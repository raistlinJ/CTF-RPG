"use client";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import AdminHeader from "../../admin-header";
import ThemeNav from "../theme-nav";
import { BOSS_STYLES, themeBossStyles } from "@/lib/challenge-icon.mjs";
import { Portrait, AdminAvatarPreview } from "@/app/page";
import type { Character, Settings } from "../media/media-types";

type Tab = "players" | "entities" | "admins" | "bosses" | "maps";
type Addition = {name:string;sprite:string};
const tabs: {id:Tab;label:string}[] = [{id:"players",label:"Players"},{id:"entities",label:"Non-playable"},{id:"admins",label:"Admins"},{id:"bosses",label:"Bosses"},{id:"maps",label:"Map artwork"}];
const blank: Addition = {name:"",sprite:""};
function AppearancesPanel({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void}) {
  const [settings,setSettings] = useState<Settings|null>(null), [tab,setTab] = useState<Tab>("players");
  const [newPlayer,setNewPlayer] = useState<Addition>(blank), [newEntity,setNewEntity] = useState<Addition>(blank), [newBoss,setNewBoss] = useState<Addition>(blank), [newMap,setNewMap] = useState<Addition>(blank);
  const [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState(""), [message,setMessage] = useState("");
  useEffect(()=>{
    let live=true;
    void fetch("/api/admin/theme-media").then(async r=>{const d=await r.json() as Settings&{error?:string};if(!r.ok)throw Error(d.error||"Administrator access required.");if(live)setSettings(d);}).catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;};
  },[]);
  useEffect(()=>{const sync=()=>{const requested=new URLSearchParams(window.location.search).get("tab") || (window.location.hash==="#map-artwork"?"maps":"players");setTab(tabs.find(t=>t.id===requested)?.id||"players");};queueMicrotask(sync);window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
  useEffect(()=>{onDirtyChange(dirty);},[dirty,onDirtyChange]);
  const styles = settings ? themeBossStyles(settings) : [];
  const options = settings ? [...new Map([
    ...settings.media.map(item=>[item.src,item.name] as const), ...settings.suppliedMedia.map(item=>[item.src,item.name] as const),
    ...settings.characters.filter(c=>c.sprite).map(c=>[c.sprite!,c.name] as const), ...settings.maps.filter(m=>m.background).map(m=>[m.background!,m.name] as const),
    ...styles.filter(style=>style.sprite).map(style=>[style.sprite,style.label] as const),
  ]).entries()].map(([src,label])=>({src,label})) : [];
  const update=(next:Settings)=>{setSettings(next);setDirty(true);setMessage("");setError("");};
  const edit=(setter:(v:Addition)=>void,v:Addition)=>{setter(v);setDirty(true);setMessage("");setError("");};
  const additions=[newPlayer,newEntity,newBoss,newMap];
  const incomplete=additions.some(v=>!!v.name.trim()!==!!v.sprite) || !!settings?.bosses.some(b=>!settings.bossSprites[b.id]);
  function select(next:Tab){setTab(next);window.history.pushState(null,"",`/admin/theme/appearances?tab=${next}`);}
  async function save(){
    if(!settings||busy||incomplete)return;
    setBusy(true);setError("");setMessage("");
    try {
      const r=await fetch("/api/admin/theme-media",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        action:"assign",revision:settings.revision,characterSprites:Object.fromEntries(settings.characters.map(c=>[c.id,c.sprite])),adminSprite:settings.adminSprite,
        bossSprites:Object.fromEntries(styles.map(s=>[s.id,settings.bossSprites[s.id]||null])),mapBackgrounds:Object.fromEntries(settings.maps.map(m=>[m.id,m.background])),
        newAppearances:[...(newPlayer.name.trim()?[{...newPlayer,appearanceFor:"player"}]:[]),...(newEntity.name.trim()?[{...newEntity,appearanceFor:"entity"}]:[])],
        newBosses:newBoss.name.trim()?[newBoss]:[],newMaps:newMap.name.trim()?[{name:newMap.name,background:newMap.sprite}]:[],
      })});
      const d=await r.json() as Settings&{error?:string};if(!r.ok)throw Error(d.error||"Appearances could not be saved.");
      setSettings(d);setNewPlayer(blank);setNewEntity(blank);setNewBoss(blank);setNewMap(blank);setDirty(false);
      setMessage("Appearances and locations saved. Reload the game to use them.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function imagePicker(label:string,value:string|null,onChange:(src:string|null)=>void,fallback:string){return <label className="theme-media-picker"><span>{label}</span><select disabled={busy} value={value||""} onChange={e=>onChange(e.target.value||null)}><option value="">{fallback}</option>{options.map(o=><option key={o.src} value={o.src}>{o.label} · {o.src.split("/").at(-1)?.slice(0,14)}</option>)}</select></label>;}
  function addForm(title:string,value:Addition,setter:(v:Addition)=>void,disabled=false){return <fieldset className="theme-media-new" disabled={busy||disabled}><h3>{title}</h3><label>Name<input maxLength={80} value={value.name} onChange={e=>edit(setter,{...value,name:e.target.value})}/></label>{imagePicker("Image",value.sprite,src=>edit(setter,{...value,sprite:src||""}),"Choose an image")}{value.sprite&&<img className="new-appearance-preview" src={value.sprite} alt="New appearance preview"/>}{disabled&&<p>This catalog has reached its limit.</p>}</fieldset>;}
  function characterRows(role:"player"|"entity"){return settings && <div className="theme-media-assignments">{settings.characters.filter(c=>role==="player"?c.appearanceFor!=="entity":c.appearanceFor!=="player").map(c=><div className="theme-media-assignment" key={c.id}><Portrait hero={c}/><div><strong>{c.name}</strong><small>{c.appearanceFor==="both"?"Players and non-playable entities":role==="player"?"Player":"Non-playable entity"}</small></div>{imagePicker(`Image for ${c.name}`,c.sprite,src=>update({...settings,characters:settings.characters.map(item=>item.id===c.id?{...item,sprite:src}:item)}),"Use fallback sprite")}</div>)}</div>;}
  return <section aria-label="Appearance assignments">
    <p className="admin-page-description">Choose Players, Non-playable or Admins to manage character appearances. Bosses and Map artwork have their own catalogs. Upload images in the <a href="/admin/theme/media">Media Library</a>; all appearances travel with theme exports and backups.</p>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!settings?!error&&<p>Loading appearances…</p>:<div className="theme-media-page">
      <div className="theme-media-tabs" role="tablist" aria-label="Appearance categories" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const i=tabs.findIndex(t=>t.id===tab),next=e.key==="Home"?tabs[0]:e.key==="End"?tabs.at(-1)!:tabs[(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length];select(next.id);e.currentTarget.querySelector<HTMLButtonElement>(`#appearance-tab-${next.id}`)?.focus();}}>
        {tabs.map(t=><button type="button" role="tab" id={`appearance-tab-${t.id}`} key={t.id} aria-controls={`appearance-panel-${t.id}`} aria-selected={tab===t.id} tabIndex={tab===t.id?0:-1} onClick={()=>select(t.id)}>{t.label}</button>)}
      </div>
      <section id="appearance-panel-players" role="tabpanel" aria-labelledby="appearance-tab-players" hidden={tab!=="players"} className="admin-editor theme-media-section"><div id="selectable-characters"><h2>Players</h2><p>Selectable appearances for student accounts.</p>{characterRows("player")}{addForm("Add a player appearance",newPlayer,setNewPlayer,settings.characters.length>=30)}</div></section>
      <section id="appearance-panel-entities" role="tabpanel" aria-labelledby="appearance-tab-entities" hidden={tab!=="entities"} className="admin-editor theme-media-section"><h2>Non-playable</h2><p>Appearances for characters placed on maps. Place them and edit their dialogue in <a href="/admin/theme/maps?tab=entities">Maps &amp; transport</a>.</p>{characterRows("entity")}{addForm("Add a non-playable appearance",newEntity,setNewEntity,settings.characters.length>=30)}</section>
      <section id="appearance-panel-admins" role="tabpanel" aria-labelledby="appearance-tab-admins" hidden={tab!=="admins"} className="admin-editor theme-media-section"><h2>Admins</h2><p>This reserved appearance identifies administrator accounts in the game.</p><div className="theme-media-assignment theme-media-admin-avatar"><AdminAvatarPreview sprite={settings.adminSprite}/><div><strong>Admin wizard</strong><small>Administrator accounts only</small></div>{imagePicker("Image for admin wizard",settings.adminSprite,src=>update({...settings,adminSprite:src}),"Use built-in wizard")}</div></section>
      <section id="appearance-panel-bosses" role="tabpanel" aria-labelledby="appearance-tab-bosses" hidden={tab!=="bosses"} className="admin-editor theme-media-section"><h2>Bosses</h2><p>Choose these appearances when editing a boss challenge. Each can use a 1 × 1, 2 × 2 or 3 × 3 allocation.</p><div className="theme-media-assignments">{styles.map(style=><div className="theme-media-assignment" key={style.id}><img src={style.sprite || BOSS_STYLES[0].sprite} alt=""/><strong>{style.label}</strong>{imagePicker(`Image for ${style.label}`,settings.bossSprites[style.id]||null,src=>update({...settings,bossSprites:{...settings.bossSprites,[style.id]:src||""}}),BOSS_STYLES.some(s=>s.id===style.id)?"Built-in artwork":"Choose an image")}</div>)}</div>{addForm("Add a boss appearance",newBoss,setNewBoss,settings.bosses.length>=30)}</section>
      <section id="appearance-panel-maps" role="tabpanel" aria-labelledby="appearance-tab-maps" hidden={tab!=="maps"} className="admin-editor theme-media-section"><div id="map-artwork"><h2>Map artwork</h2><p>Assign backgrounds or add new locations. Each map uses a 40 × 28 tile grid.</p><div className="theme-media-assignments">{settings.maps.map(m=><div className="theme-media-assignment" key={m.id}>{m.background&&<img src={m.background} alt=""/>}<strong>{m.name}</strong>{imagePicker(`Background for ${m.name}`,m.background,src=>update({...settings,maps:settings.maps.map(item=>item.id===m.id?{...item,background:src}:item)}),"No background image")}<a className="text-button" href={`/admin/theme/maps?map=${encodeURIComponent(m.id)}`}>Edit ground, spawn &amp; transport</a>{Object.hasOwn(m,"originalBackground")&&<button type="button" className="text-button" disabled={busy} onClick={()=>update({...settings,maps:settings.maps.map(item=>item.id===m.id?{...item,background:item.originalBackground??null}:item)})}>Reset original artwork</button>}</div>)}</div>
        <p>New locations start with a center spawn and walkable ground. After saving, edit their ground and spawn, then add a transport from another map to connect them.</p>{addForm("Add a map location",newMap,setNewMap,settings.maps.length>=30)}</div></section>
      <div className="appearance-save"><button className="primary" type="button" disabled={busy||!dirty||incomplete} onClick={()=>void save()}>{busy?"Saving…":"Save appearances"}</button>{dirty&&<small>Changes in every tab are saved together.</small>}</div>
      {incomplete&&<p role="status">Finish each new name and image, and choose an image for every custom boss, before saving.</p>}
    </div>}
  </section>;
}
export default function AppearancesAdmin(){
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  return <main className="admin-studio"><AdminHeader active="theme"/><section className="admin-workspace"><ThemeNav active="appearances"/><h1>Appearances</h1>{dirty&&<p className="save-note" role="status">Save your appearance changes before leaving this page.</p>}<AppearancesPanel onDirtyChange={setDirty}/></section></main>;
}

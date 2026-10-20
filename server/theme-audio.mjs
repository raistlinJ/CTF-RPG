import { THEME_PACK_LIMIT, MUSIC_TRACK_LIMIT, MUSIC_UPLOAD_LIMIT } from "../lib/pack-limits.mjs";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import midiPackage from '@tonejs/midi';
const {Midi} = midiPackage;
import { parseTheme, themeNonMusicAssetPaths } from '../lib/theme-schema.mjs';
import { musicTracks } from '../lib/midi-playlist.mjs';
import { assertAsset, readAsset } from './packs.mjs';
export async function handleThemeAudio(req, {db, user, platformAdmin, theme, themeRevision, assetStore, readBaseAsset}) {
  const reply=(d,status=200)=>Response.json(d,{status,headers:{'Cache-Control':'no-store'}});
  const u=await user(req);
  if (!platformAdmin && u?.role!=='admin') return reply({error:'Administrator access required.'},u?403:401);
  const current=musicTracks(theme.audio);
  const maps=value=>value.world.maps.map(({id,name,music})=>({id,name,music}));
  if (req.method==='GET') return reply({audio:{...theme.audio,playlist:current},maps:maps(theme),revision:themeRevision});
  if (req.method!=='POST') return reply({error:'Method not allowed.'},405);
  try {
    const form=await req.formData();
    const revision=Number(form.get('revision'));
    if (!form.has('revision') || !Number.isInteger(revision) || revision!==themeRevision) return reply({error:'The theme changed. Reload audio before saving.'},409);
    const playlist=JSON.parse(String(form.get('playlist')));
    if (!Array.isArray(playlist) || playlist.length>MUSIC_TRACK_LIMIT || playlist.some(t=>!t || typeof t.name!=='string' || !current.some(c=>c.midi===t.midi))) throw Error('Keep only tracks from the current theme.');
    const uploads=form.getAll('files');
    if (uploads.length>MUSIC_UPLOAD_LIMIT) throw Error(`Upload at most ${MUSIC_UPLOAD_LIMIT} MIDI files at a time.`);
    const staged=[];
    const skipped=[];
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const retainedHashes=new Set();
    for(const track of playlist) {
      const bytes=await readAsset(track.midi,assetStore,readBaseAsset);
      if(!bytes) throw Error(`The playlist file "${track.name}" is unavailable.`);
      retainedHashes.add(await digest(bytes));
    }
    for (const file of uploads) {
      if (typeof file==='string') throw Error('Choose MIDI files to upload.');
      if (!/\.midi?$/i.test(file.name) || file.size<14) throw Error(`"${file.name}": choose a nonempty MIDI file.`);
      const bytes=new Uint8Array(await file.arrayBuffer());
      try {
        assertAsset(bytes,'mid');
        const midi=new Midi(bytes);
        if(!Number.isFinite(midi.duration) || midi.duration<=0) throw Error('MIDI must contain playable notes.');
      } catch(e) {throw Error(`"${file.name}": ${e.message || 'Invalid MIDI file.'}`);}
      const hash=await digest(bytes);
      const key=hash+'.mid', path='/api/assets/'+key;
      if(retainedHashes.has(hash)) {skipped.push(file.name);continue;}
      if(playlist.length>=MUSIC_TRACK_LIMIT) throw Error(`A playlist can contain at most ${MUSIC_TRACK_LIMIT} tracks. Remove a track before adding more.`);
      retainedHashes.add(hash);
      playlist.push({name:file.name.slice(0,120),midi:path});staged.push({key,path,bytes});
    }
    if(form.get('loop')!=='true' && form.get('loop')!=='false') throw Error('Choose a valid repeat setting.');
    const retained=new Set(playlist.map(track=>track.midi));
    const selections=form.has('maps') ? JSON.parse(String(form.get('maps'))) : null;
    if(selections!==null && (!selections || typeof selections!=='object' || Array.isArray(selections) ||
      Object.entries(selections).some(([id,src])=>!theme.world.maps.some(map=>map.id===id) || (src!==null && !retained.has(src)))))
      throw Error('Choose a playlist track or None for each map.');
    const next=parseTheme({...theme,
      world:{...theme.world,maps:theme.world.maps.map(map=>({...map,music:selections && Object.hasOwn(selections,map.id) ? selections[map.id] : map.music && retained.has(map.music) ? map.music : null}))},
      audio:{midi:null,playlist,loop:form.get('loop')==='true',volume:Number(form.get('volume'))}});
    let size=0;
    for(const path of themeNonMusicAssetPaths(next)) {
      const bytes=await readAsset(path,assetStore,readBaseAsset);
      if(!bytes) throw Error('A theme asset is unavailable.');
      size+=bytes.length; if(size>THEME_PACK_LIMIT) throw Error('Theme images and sound effects exceed the 32 MB asset limit.');
    }
    if(staged.length && !assetStore) throw Error('Audio storage is unavailable.');
    for(const s of staged) await assetStore.put(s.key,s.bytes,'audio/midi');
    const r=await db.prepare("INSERT INTO theme_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=theme_catalog.revision+1 WHERE theme_catalog.revision=?").bind(JSON.stringify(next),revision,revision).run();
    if(!(r.meta?.changes??r.changes)) return reply({error:'Another administrator changed the theme. Reload before saving.'},409);
    return reply({audio:next.audio,maps:maps(next),revision:revision+1,uploaded:staged.length,skipped});
  } catch(e) {return reply({error:e.issues?.map(i=>i.message).join('; ') || e.message || 'Audio could not be saved.'},400);}
}

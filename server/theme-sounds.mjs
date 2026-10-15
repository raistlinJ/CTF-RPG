// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { THEME_PACK_LIMIT, THEME_UPLOAD_LIMIT } from '../lib/pack-limits.mjs';
import { parseTheme, themeAssetPaths } from '../lib/theme-schema.mjs';
import { SOUND_EVENTS } from '../lib/sound-events.mjs';
import { musicTracks } from '../lib/midi-playlist.mjs';
import { assertAsset, assetTypes, readAsset } from './packs.mjs';

const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const extension = /\.(wav|mp3|ogg)$/i;
const MAX_CLIP_BYTES = 2 * 1024 * 1024;

export async function handleThemeSounds(req, {db, user, platformAdmin, theme, themeRevision, assetStore, readBaseAsset}) {
  const account = await user(req);
  if (!platformAdmin && account?.role !== 'admin') return reply({error:'Administrator access required.'}, account ? 403 : 401);
  const state = (value, revision) => ({sounds:value.sounds, maps:value.world.maps.map(({id,name,music})=>({id,name,music})), tracks:musicTracks(value.audio), events:SOUND_EVENTS, revision});
  if (req.method === 'GET') return reply(state(theme, themeRevision));
  if (req.method !== 'POST') return reply({error:'Method not allowed.'}, 405);
  try {
    if (Number(req.headers.get('content-length')) > THEME_UPLOAD_LIMIT) throw Error('Sound uploads must fit within the 32 MB theme limit.');
    let next, staged = [];
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await req.formData();
      if (!form.has('revision') || Number(form.get('revision')) !== themeRevision) return reply({error:'The theme changed. Reload Sounds before saving.'}, 409);
      const files = form.getAll('files');
      if (!files.length || files.length > 10 || theme.sounds.clips.length + files.length > 40) throw Error('Choose up to 10 files; a theme supports 40 sound clips.');
      if (!assetStore) throw Error('Sound storage is unavailable.');
      const clips = [...theme.sounds.clips];
      for (const file of files) {
        if (typeof file === 'string') throw Error('Choose sound files to upload.');
        const match = extension.exec(file.name);
        if (!match || file.size < 12 || file.size > MAX_CLIP_BYTES) throw Error(`"${file.name}": choose a WAV, MP3, or OGG file up to 2 MB.`);
        const ext = match[1].toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
        try { assertAsset(bytes, ext); } catch { throw Error(`"${file.name}" is not a valid ${ext.toUpperCase()} sound.`); }
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        const key = `${hash}.${ext}`, src = `/api/assets/${key}`;
        if (clips.some(clip => clip.src === src)) continue;
        clips.push({name:file.name.slice(0,120),src,source:'upload'});
        staged.push({key,src,bytes,type:assetTypes[ext]});
      }
      next = parseTheme({...theme,sounds:{...theme.sounds,clips}});
    } else {
      const body = await req.json();
      if (!Number.isInteger(body?.revision) || body.revision !== themeRevision) return reply({error:'The theme changed. Reload Sounds before saving.'}, 409);
      if (body.action === 'assign') {
        if (!body.maps || typeof body.maps !== 'object' || Array.isArray(body.maps) || !body.events || typeof body.events !== 'object' || Array.isArray(body.events)) throw Error('Choose valid sound assignments.');
        const selections = body.mapMusic;
        const tracks = new Set(musicTracks(theme.audio).map(track => track.midi));
        if (selections !== undefined && (!selections || typeof selections !== 'object' || Array.isArray(selections) ||
          Object.entries(selections).some(([id,src]) => !theme.world.maps.some(map => map.id === id) || (src !== null && !tracks.has(src)))))
          throw Error('Choose a playlist track or None for each map.');
        next = parseTheme({...theme,
          world:selections === undefined ? theme.world : {...theme.world,maps:theme.world.maps.map(map => ({...map,music:Object.hasOwn(selections,map.id) ? selections[map.id] : map.music}))},
          sounds:{...theme.sounds,maps:body.maps,events:body.events}});
      } else if (body.action === 'delete') {
        const item = theme.sounds.clips.find(clip => clip.src === body.src && clip.source === 'upload');
        if (!item) throw Error('Only sounds uploaded here can be deleted.');
        const clear = entries => Object.fromEntries(Object.entries(entries).map(([key,src]) => [key,src === item.src ? null : src]));
        next = parseTheme({...theme,sounds:{...theme.sounds,clips:theme.sounds.clips.filter(clip => clip.src !== item.src),maps:clear(theme.sounds.maps),events:clear(theme.sounds.events)}});
      } else throw Error('Unknown sound action.');
    }
    let total = 0;
    for (const path of themeAssetPaths(next)) {
      const bytes = staged.find(item => item.src === path)?.bytes || await readAsset(path, assetStore, readBaseAsset);
      if (!bytes) throw Error(`Theme asset is unavailable: ${path}`);
      total += bytes.length;
      if (total > THEME_PACK_LIMIT) throw Error('Theme images and audio exceed the 32 MB theme limit.');
    }
    for (const item of staged) await assetStore.put(item.key, item.bytes, item.type);
    const result = await db.prepare("INSERT INTO theme_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=theme_catalog.revision+1 WHERE theme_catalog.revision=?").bind(JSON.stringify(next),themeRevision,themeRevision).run();
    if (!(result.meta?.changes ?? result.changes)) return reply({error:'Another administrator changed the theme. Reload Sounds before saving.'},409);
    return reply({...state(next,themeRevision+1),uploaded:staged.length});
  } catch (e) { return reply({error:e.issues?.map(issue=>issue.message).join('; ') || e.message || 'Sounds could not be saved.'},400); }
}

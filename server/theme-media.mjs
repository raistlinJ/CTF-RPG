import {assetSize} from './asset-size.mjs';
import { THEME_PACK_LIMIT, THEME_UPLOAD_LIMIT } from "../lib/pack-limits.mjs";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { BOSS_STYLES, themeBossStyles } from '../lib/challenge-icon.mjs';
import { parseTheme, themeAssetPaths } from '../lib/theme-schema.mjs';
import { assertAsset, assetTypes } from './packs.mjs';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const imageExtension = /\.(png|jpe?g|webp|gif)$/i;

export async function handleThemeMedia(req, { db, user, platformAdmin, theme, themeRevision, assetStore, readBaseAsset }) {
  const account = await user(req);
  if (!platformAdmin && account?.role !== 'admin') return reply({ error: 'Administrator access required.' }, account ? 403 : 401);
  const state = (value, revision) => {
    const uploaded = new Set(value.media.filter(item => item.source === 'upload').map(item => item.src));
    const supplied = [
      ...value.media.filter(item => item.source === 'theme').map(item => ({ src: item.src, name: item.name })),
      ...value.characters.filter(c => c.sprite).map(c => ({ src: c.sprite, name: `${c.name} appearance` })),
      ...(value.adminSprite ? [{ src: value.adminSprite, name: 'Admin wizard appearance' }] : []),
      ...value.world.maps.flatMap(m => [m.background && { src: m.background, name: `${m.name} background` }, m.originalBackground && { src: m.originalBackground, name: `${m.name} original background` }]).filter(Boolean),
      ...themeBossStyles(value).map(style => ({ src: style.sprite, name: style.label })),
    ].filter(item => !uploaded.has(item.src));
    return { media: value.media, suppliedMedia: [...new Map(supplied.map(item => [item.src, item])).values()], characters: value.characters, adminSprite: value.adminSprite, bosses: value.bosses, bossSprites: value.bossSprites, maps: value.world.maps.map(({ id, name, background, originalBackground }) => ({ id, name, background, ...(originalBackground !== undefined ? {originalBackground} : {}) })), revision };
  };
  if (req.method === 'GET') return reply(state(theme, themeRevision));
  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  try {
    if (Number(req.headers.get('content-length')) > THEME_UPLOAD_LIMIT) throw Error('Images and the theme pack must fit within 32 MB.');
    let next, staged = [];
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await req.formData();
      const revision = Number(form.get('revision'));
      if (!form.has('revision') || !Number.isInteger(revision) || revision !== themeRevision) return reply({ error: 'The theme changed. Reload Media before saving.' }, 409);
      const files = form.getAll('files');
      if (!files.length || files.length > 10) throw Error('Choose 1 to 10 images to upload.');
      if (!assetStore) throw Error('Media storage is unavailable.');
      const media = [...theme.media];
      const existing = new Set(media.map(item => item.src));
      for (const file of files) {
        if (typeof file === 'string') throw Error('Choose image files to upload.');
        const match = imageExtension.exec(file.name);
        if (!match || file.size < 16 || file.size > 4 * 1024 * 1024) throw Error(`"${file.name}": choose a PNG, JPEG, WebP, or GIF image up to 4 MB.`);
        const ext = match[1].toLowerCase();
        const bytes = new Uint8Array(await file.arrayBuffer());
        try { assertAsset(bytes, ext); } catch { throw Error(`"${file.name}" is not a valid ${ext.toUpperCase()} image.`); }
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        const key = `${hash}.${ext}`, src = `/api/assets/${key}`;
        if (existing.has(src)) continue;
        existing.add(src);
        media.push({ id: `media-${crypto.randomUUID()}`, name: file.name.slice(0, 120), src, source: 'upload' });
        staged.push({ key, src, bytes, type: assetTypes[ext] });
      }
      next = parseTheme({ ...theme, media });
    } else {
      const body = await req.json();
      if (!Number.isInteger(body?.revision) || body.revision !== themeRevision) return reply({ error: 'The theme changed. Reload Media before saving.' }, 409);
      if (body.action === 'delete') {
        const item = theme.media.find(entry => entry.id === body.id && entry.source === 'upload');
        if (!item) throw Error('Only images uploaded here can be deleted.');
        const used = new Set([theme.adminSprite, ...theme.characters.map(c => c.sprite), ...Object.values(theme.bossSprites), ...theme.world.maps.flatMap(m => [m.background, m.originalBackground])]);
        if (used.has(item.src)) throw Error('This image is in use. Assign another image to its roles and save before deleting it.');
        next = parseTheme({ ...theme, media: theme.media.filter(entry => entry.id !== item.id) });
      } else if (body.action === 'backgrounds') {
        const maps = body.mapBackgrounds;
        if (!maps || typeof maps !== 'object' || Array.isArray(maps)) throw Error('Choose valid map backgrounds.');
        const allowed = new Set([...themeAssetPaths(theme).filter(p => imageExtension.test(p)), ...BOSS_STYLES.map(style => style.sprite)]);
        if (Object.entries(maps).some(([id, src]) => !theme.world.maps.some(map => map.id === id) || (src !== null && (typeof src !== 'string' || !allowed.has(src)))))
          throw Error('Choose images already in this theme.');
        next = parseTheme({ ...theme, world: { ...theme.world, maps: theme.world.maps.map(map => {
          if (!Object.hasOwn(maps, map.id) || maps[map.id] === map.background) return map;
          const updated = { ...map, background: maps[map.id], originalBackground: Object.hasOwn(map, 'originalBackground') ? map.originalBackground : map.background };
          if (updated.background === updated.originalBackground) delete updated.originalBackground;
          return updated;
        }) } });
      } else if (body.action === 'assign') {
      const changes = body.characterSprites, bosses = body.bossSprites, maps = body.mapBackgrounds;
      if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !bosses || typeof bosses !== 'object' || Array.isArray(bosses) || !maps || typeof maps !== 'object' || Array.isArray(maps)) throw Error('Invalid image assignments.');
      const additions = body.newAppearances || [], removed = body.removeMediaIds || [];
      const newBosses = body.newBosses || [], newMaps = body.newMaps || [];
      if (![newBosses,newMaps].every(items=>Array.isArray(items) && items.length<=10)) throw Error('Add at most 10 bosses or maps at a time.');
      if (!Array.isArray(additions) || additions.length > 10 || !Array.isArray(removed) || removed.some(id => typeof id !== 'string')) throw Error('Invalid appearance or media list.');
      const allowed = new Set([...themeAssetPaths(theme).filter(p => imageExtension.test(p)), ...BOSS_STYLES.map(style => style.sprite)]);
      const valid = src => src === null || (typeof src === 'string' && allowed.has(src));
      const adminSprite = Object.hasOwn(body, 'adminSprite') ? body.adminSprite : theme.adminSprite;
      if (!valid(adminSprite)) throw Error('Choose an admin wizard image already in this theme.');
      if (Object.keys(changes).some(id => !theme.characters.some(c => c.id === id) || !valid(changes[id])) ||
          Object.keys(bosses).some(id => !themeBossStyles(theme).some(s => s.id === id) || !valid(bosses[id])) ||
          Object.keys(maps).some(id => !theme.world.maps.some(m => m.id === id) || !valid(maps[id]))) throw Error('Choose images already in this theme.');
      const characters = theme.characters.map(c => ({ ...c, sprite: Object.hasOwn(changes, c.id) ? changes[c.id] : c.sprite }));
      for (const item of additions) {
        if (!item || typeof item.name !== 'string' || !item.name.trim() || !['player', 'entity', 'both'].includes(item.appearanceFor) || !valid(item.sprite) || item.sprite === null) throw Error('Choose a name, role, and image for each new appearance.');
        characters.push({ id: `media-${crypto.randomUUID()}`, name: item.name.trim(), subtitle: 'Ready for adventure.', sprite: item.sprite, fallback: 'web', appearanceFor: item.appearanceFor });
      }
      const bossSprites = { ...theme.bossSprites };
      const bossDefinitions = [...theme.bosses];
      for (const [id, src] of Object.entries(bosses)) { if (src === null) delete bossSprites[id]; else bossSprites[id] = src; }
      for (const item of newBosses) {
        if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length>80 || !valid(item.sprite) || item.sprite===null) throw Error('Choose a name and image for each new boss.');
        const id = `boss-${crypto.randomUUID()}`;
        bossDefinitions.push({id,label:item.name.trim()});bossSprites[id]=item.sprite;
      }
      const world = { ...theme.world, maps: theme.world.maps.map(m => {
        if (!Object.hasOwn(maps,m.id) || maps[m.id] === m.background) return m;
        const nextMap = { ...m, background: maps[m.id], originalBackground: Object.hasOwn(m,"originalBackground") ? m.originalBackground : m.background };
        if (nextMap.background === nextMap.originalBackground) delete nextMap.originalBackground;
        return nextMap;
      }) };
      for (const item of newMaps) {
        if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length>80 || !valid(item.background) || item.background===null) throw Error('Choose a name and background image for each new map location.');
        world.maps.push({id:`map-${crypto.randomUUID()}`,name:item.name.trim(),background:item.background,
          bounds:{left:0,right:39,top:0,bottom:27},spawn:{x:20,y:14},exit:null,floor:'#183440',wall:'#0d222c',obstacles:[],
          ground:Array.from({length:1120},(_,i)=>[i%40,Math.floor(i/40)])});
      }
      const removedSet = new Set(removed);
      if (removedSet.size !== removed.length || removed.some(id => !theme.media.some(item => item.id === id && item.source === 'upload'))) throw Error('Only images uploaded here can be deleted.');
      const media = theme.media.filter(item => !removedSet.has(item.id));
      next = parseTheme({ ...theme, characters, adminSprite, bosses:bossDefinitions, bossSprites, world, media });
      const used = new Set([next.adminSprite, ...next.characters.map(c => c.sprite), ...Object.values(next.bossSprites), ...next.world.maps.flatMap(m => [m.background, m.originalBackground])]);
      if (theme.media.some(item => removedSet.has(item.id) && used.has(item.src))) throw Error('Remove this image from its assigned roles before deleting it.');
      } else throw Error('Unknown media action.');
    }
    let size = 0;
    for (const path of themeAssetPaths(next)) {
      const length = staged.find(item => item.src === path)?.bytes.length ?? await assetSize(path, assetStore, readBaseAsset);
      if (length === null) throw Error(`Theme image is unavailable: ${path}`);
      size += length;
      if (size > THEME_PACK_LIMIT) throw Error('Theme images and audio exceed the 32 MB theme pack limit.');
    }
    for (const item of staged) await assetStore.put(item.key, item.bytes, item.type);
    const result = await db.prepare("INSERT INTO theme_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=theme_catalog.revision+1 WHERE theme_catalog.revision=?").bind(JSON.stringify(next), themeRevision, themeRevision).run();
    if (!(result.meta?.changes ?? result.changes)) return reply({ error: 'Another administrator changed the theme. Reload Media before saving.' }, 409);
    return reply({ ...state(next, themeRevision + 1), uploaded: staged.length });
  } catch (e) { return reply({ error: e.issues?.map(i => i.message).join('; ') || e.message || 'Media could not be saved.' }, 400); }
}

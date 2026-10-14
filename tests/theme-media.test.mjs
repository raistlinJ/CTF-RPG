// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';
import { parseGame } from '../lib/config-schema.mjs';
import { initializeSchema, createSQLiteAdapter } from '../server/sqlite.mjs';
import { createApi } from '../server/api.mjs';
import { exportFullBackup } from '../server/backup.mjs';
import { defaultTheme, parseTheme, themeAssetPaths, mapThemeAssets } from '../lib/theme-schema.mjs';

test('administrator artwork validates image paths and travels with theme assets', () => {
  const theme = defaultTheme(parseGame('characters:\n - id: web\n   name: Web'));
  assert.equal(theme.adminSprite, null);
  const image = '/sprites/thunder.png';
  const custom = parseTheme({ ...theme, adminSprite: image });
  assert.ok(themeAssetPaths(custom).includes(image));
  assert.equal(mapThemeAssets(custom, path => '/copied' + path).adminSprite, '/copied' + image);
  assert.equal(mapThemeAssets(theme, path => '/copied' + path).adminSprite, null);
  for (const adminSprite of ['https://example.com/wizard.png', '/sprites/wizard.svg', '/sprites/../wizard.png'])
    assert.throws(() => parseTheme({ ...theme, adminSprite }));
});

test('admins upload and assign theme media, and exports include the uploaded image', async () => {
  const sqlite = new DatabaseSync(':memory:'); initializeSchema(sqlite);
  try {
    const files = new Map();
    const options = {
      db: createSQLiteAdapter(sqlite),
      config: parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users: []'),
      challenges: [],
      assetStore: { get: async key => files.get(key), put: async (key, bytes) => files.set(key, bytes) },
      readBaseAsset: path => new Uint8Array(readFileSync('public' + path)),
    };
    const publicApi = createApi(options), adminApi = createApi({ ...options, platformAdmin: true });
    const url = 'https://quest.test/api/admin/theme-media';
    assert.equal((await publicApi(new Request(url))).status, 401);
    const initial = await (await adminApi(new Request(url))).json();
    const bytes = readFileSync('public/sprites/web.png');
    const unusedBytes = readFileSync('public/sprites/thunder.png');
    const form = new FormData();
    form.set('revision', String(initial.revision));
    form.append('files', new File([bytes], 'portrait.png', { type: 'image/png' }));
    form.append('files', new File([unusedBytes], 'unused.png', { type: 'image/png' }));
    const uploadedResponse = await adminApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test' }, body: form }));
    const uploaded = await uploadedResponse.json();
    assert.equal(uploadedResponse.status, 200, JSON.stringify(uploaded));
    assert.equal(uploaded.media.length, 2);
    assert.ok(uploaded.media.every(item => item.source === 'upload'));
    const src = uploaded.media[0].src, unusedSrc = uploaded.media[1].src;
    const edit = {
      action: 'assign', revision: uploaded.revision,
      characterSprites: { web: src }, bossSprites: { frost: src },
      adminSprite: unusedSrc,
      mapBackgrounds: { town: src },
      newAppearances: [{ name: 'Guide', appearanceFor: 'entity', sprite: src }],
      removeMediaIds: [],
    };
    const post = body => adminApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const savedResponse = await post(edit), saved = await savedResponse.json();
    assert.equal(savedResponse.status, 200, JSON.stringify(saved));
    assert.equal(saved.characters.find(c => c.id === 'web').sprite, src);
    assert.equal(saved.characters.find(c => c.name === 'Guide').appearanceFor, 'entity');
    assert.equal(saved.bossSprites.frost, src);
    assert.equal(saved.adminSprite, unusedSrc);
    assert.ok(!saved.characters.some(c => c.sprite === unusedSrc), 'admin artwork is kept outside player appearances');
    assert.equal(saved.maps.find(m => m.id === 'town').background, src);
    assert.equal((await post(edit)).status, 409);
    assert.equal((await post({ ...edit, revision: saved.revision, characterSprites: { web: '/api/assets/unknown.png' } })).status, 400);
    assert.equal((await post({ ...edit, revision: saved.revision, adminSprite: '/api/assets/unknown.png' })).status, 400);
    const game = await (await adminApi(new Request('https://quest.test/api/config'))).json();
    assert.equal(game.theme.bossSprites.frost, src);
    assert.equal(game.theme.adminSprite, unusedSrc);
    const archiveResponse = await adminApi(new Request('https://quest.test/api/admin/packs?kind=theme'));
    assert.equal(archiveResponse.status, 200);
    const archive = new Uint8Array(await archiveResponse.arrayBuffer());
    const entries = unzipSync(archive);
    assert.deepEqual(entries['assets' + src], new Uint8Array(bytes));
    assert.deepEqual(entries['assets' + unusedSrc], new Uint8Array(unusedBytes));
    const backupApi = createApi({ ...options, platformAdmin: true, exportBackup: exportFullBackup });
    const backupResponse = await backupApi(new Request('https://quest.test/api/admin/backup'));
    assert.equal(backupResponse.status, 200);
    const backup = unzipSync(new Uint8Array(await backupResponse.arrayBuffer()));
    assert.deepEqual(backup['data/pack-assets/' + src.slice(12)], new Uint8Array(bytes));
    assert.deepEqual(backup['data/pack-assets/' + unusedSrc.slice(12)], new Uint8Array(unusedBytes));
    assert.ok(JSON.parse(strFromU8(backup['backup.json'])).theme.media.every(item => item.source === 'upload'));
    assert.equal(JSON.parse(strFromU8(backup['backup.json'])).theme.adminSprite, unusedSrc);
    const second = new DatabaseSync(':memory:'); initializeSchema(second);
    try {
      const importedFiles = new Map();
      const importApi = createApi({ ...options, db: createSQLiteAdapter(second), assetStore: { get: async key => importedFiles.get(key), put: async (key, data) => importedFiles.set(key, data) }, platformAdmin: true });
      const importForm = new FormData();
      importForm.set('file', new File([archive], 'theme.zip'));
      importForm.set('themeRevision', '0'); importForm.set('contentRevision', '0');
      const importResponse = await importApi(new Request('https://quest.test/api/admin/packs?kind=theme', { method: 'POST', headers: { Origin: 'https://quest.test' }, body: importForm }));
      assert.equal(importResponse.status, 200, JSON.stringify(await importResponse.json()));
      const imported = await (await importApi(new Request(url))).json();
      assert.equal(imported.media[0].src, src);
      assert.ok(imported.media.every(item => item.source === 'theme'));
      assert.equal(imported.bossSprites.frost, src);
      assert.equal(imported.adminSprite, unusedSrc);
      assert.equal(imported.characters.find(c => c.name === 'Guide').sprite, src);
      const importedDelete = await importApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', revision: imported.revision, id: imported.media[1].id }) }));
      assert.equal(importedDelete.status, 400);
    } finally { second.close(); }
    const removeResponse = await post({ action: 'assign', revision: saved.revision, characterSprites: {}, bossSprites: {}, mapBackgrounds: {}, removeMediaIds: [saved.media[0].id] });
    assert.equal(removeResponse.status, 400);
    const invalid = new FormData(); invalid.set('revision', String(saved.revision)); invalid.append('files', new File(['not an image'], 'fake.png'));
    assert.equal((await adminApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test' }, body: invalid }))).status, 400);
    assert.equal((await post({ action: 'delete', revision: saved.revision, id: saved.media[0].id })).status, 400);
    assert.equal((await post({ action: 'delete', revision: saved.revision, id: saved.media[1].id })).status, 400, 'admin wizard image is in use');
    assert.equal((await post({ action: 'assign', revision: saved.revision, characterSprites: {}, bossSprites: {}, mapBackgrounds: {}, removeMediaIds: [saved.media[1].id] })).status, 400);
    const resetResponse = await post({ action: 'assign', revision: saved.revision, characterSprites: {}, bossSprites: {}, mapBackgrounds: {}, adminSprite: null });
    const reset = await resetResponse.json(); assert.equal(resetResponse.status, 200); assert.equal(reset.adminSprite, null);
    const deletedResponse = await post({ action: 'delete', revision: reset.revision, id: saved.media[1].id });
    const deleted = await deletedResponse.json();
    assert.equal(deletedResponse.status, 200, JSON.stringify(deleted));
    assert.equal(deleted.media.length, 1);
    const afterDelete = await adminApi(new Request('https://quest.test/api/admin/packs?kind=theme'));
    const afterEntries = unzipSync(new Uint8Array(await afterDelete.arrayBuffer()));
    assert.ok(!afterEntries['assets' + unusedSrc]);
    assert.ok(afterEntries['assets' + src]);
  } finally { sqlite.close(); }
});

test('Media artwork assignments retain the original image, reset it, and preserve geometry and entities',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 try {
  const assets=new Map(),api=createApi({db:createSQLiteAdapter(sqlite),config:parseGame('characters:\n - id: web\n   name: Web\naccounts:\n users: []'),challenges:[],platformAdmin:true,assetStore:{get:async key=>assets.get(key),put:async(key,value)=>assets.set(key,value)},readBaseAsset:path=>new Uint8Array(readFileSync('public'+path))});
  const url='https://quest.test/api/admin/theme-media';const get=async()=>await(await api(new Request(url))).json();
  const initial=await get(),before=await(await api(new Request('https://quest.test/api/admin/challenges'))).json(),map=initial.maps[0];
  const upload=new FormData();upload.set('revision',String(initial.revision));upload.append('files',new File([readFileSync('public/sprites/web.png')],'replacement.png'));
  const uploaded=await(await api(new Request(url,{method:'POST',headers:{Origin:'https://quest.test'},body:upload}))).json();const src=uploaded.media[0].src;
  const assign=async(revision,background)=>{const r=await api(new Request(url,{method:'POST',headers:{Origin:'https://quest.test','Content-Type':'application/json'},body:JSON.stringify({action:'assign',revision,characterSprites:{},bossSprites:{},mapBackgrounds:{[map.id]:background}})}));assert.equal(r.status,200);return r.json();};
  const replaced=await assign(uploaded.revision,src);assert.equal(replaced.maps[0].background,src);assert.equal(replaced.maps[0].originalBackground,map.background);
  const again=await assign(replaced.revision,uploaded.suppliedMedia.find(item=>item.src!==map.background&&item.src!==src).src);assert.equal(again.maps[0].originalBackground,map.background);
  const reset=await assign(again.revision,map.background);assert.equal(reset.maps[0].background,map.background);assert.equal(Object.hasOwn(reset.maps[0],'originalBackground'),false);
  const after=await(await api(new Request('https://quest.test/api/admin/challenges'))).json();assert.deepEqual(after.theme.world,before.theme.world);
 }finally{sqlite.close();}
});

test('Agentic Circuit can upload images past 8 MB and export/import the expanded theme',async()=>{
 const {themePresets}=await import('../lib/theme-presets.mjs');
 const {deflateSync}=await import('node:zlib');
 const {THEME_PACK_LIMIT,CONTENT_PACK_LIMIT}=await import('../lib/pack-limits.mjs');
 const theme=themePresets[0].theme,sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 function png(seed){
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const chunk=(type,data)=>{const head=Buffer.from(type),crcData=Buffer.concat([head,data]);let crc=0xffffffff;for(const byte of crcData)crc=crcTable[(crc^byte)&255]^(crc>>>8);const length=Buffer.alloc(4),tail=Buffer.alloc(4);length.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,head,data,tail]);};
  const width=512,raw=Buffer.alloc((width*4+1)*width);for(let y=0;y<width;y++)for(let x=0;x<width;x++){const p=y*(width*4+1)+1+x*4;for(let c=0;c<3;c++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;raw[p+c]=seed&255;}raw[p+3]=255;}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(width,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
 }
 try {
  sqlite.prepare("INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)").run(JSON.stringify(theme));
  const files=new Map(),config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n users: []'),store={get:async k=>files.get(k),put:async(k,v)=>files.set(k,v)},db=createSQLiteAdapter(sqlite),readBaseAsset=p=>new Uint8Array(readFileSync('public'+p));
  const api=createApi({db,config,challenges:[],platformAdmin:true,assetStore:store,readBaseAsset});
  const form=new FormData();form.set('revision','1');for(let i=1;i<=2;i++)form.append('files',new File([png(i)],`image-${i}.png`,{type:'image/png'}));
  const upload=await api(new Request('https://quest.test/api/admin/theme-media',{method:'POST',headers:{Origin:'https://quest.test'},body:form}));const uploaded=await upload.json();assert.equal(upload.status,200,JSON.stringify(uploaded));assert.equal(uploaded.uploaded,2);
  const exported=await api(new Request('https://quest.test/api/admin/packs?kind=theme'));assert.equal(exported.status,200);const bytes=new Uint8Array(await exported.arrayBuffer());assert.ok(bytes.length>CONTENT_PACK_LIMIT);assert.ok(bytes.length<THEME_PACK_LIMIT);
  const other=new DatabaseSync(':memory:');initializeSchema(other);try{
   const newFiles=new Map(),target=createApi({db:createSQLiteAdapter(other),config,challenges:[],platformAdmin:true,assetStore:{get:async k=>newFiles.get(k),put:async(k,v)=>newFiles.set(k,v)},readBaseAsset});
   const importing=new FormData();importing.set('file',new File([bytes],'theme.zip'));importing.set('themeRevision','0');importing.set('contentRevision','0');
   const imported=await target(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:importing}));assert.equal(imported.status,200,JSON.stringify(await imported.json()));
   const media=await(await target(new Request('https://quest.test/api/admin/theme-media'))).json();assert.equal(media.media.length,2);assert.equal(media.characters.length,theme.characters.length);
  }finally{other.close();}
 }finally{sqlite.close();}
});

test('appearance catalogs add playable and non-playable looks, custom bosses and standalone map locations with export/import support',async()=>{
 const {createWorld}=await import('../lib/world-data.mjs');
 const {themeBossStyles}=await import('../lib/challenge-icon.mjs');
 const {validateSnapshot}=await import('../server/backup.mjs');
 const {parse}=await import('yaml');
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 try {
  const files=new Map(),config=parseGame('characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users: []'),assetStore={get:async key=>files.get(key),put:async(key,bytes)=>files.set(key,bytes)};
  const options={db:createSQLiteAdapter(sqlite),config,challenges:[],assetStore,readBaseAsset:path=>new Uint8Array(readFileSync('public'+path)),exportBackup:exportFullBackup};
  const api=createApi({...options,platformAdmin:true}),guest=createApi(options),url='https://quest.test/api/admin/theme-media';
  const send=(path,body)=>api(new Request('https://quest.test'+path,{method:'POST',headers:{Origin:'https://quest.test','Content-Type':'application/json'},body:JSON.stringify(body)}));
  const initial=await(await api(new Request(url))).json();
  const payload={action:'assign',revision:initial.revision,characterSprites:{},bossSprites:{},mapBackgrounds:{},
   newAppearances:[{name:'Student look',appearanceFor:'player',sprite:'/sprites/web.png'},{name:'Guide look',appearanceFor:'entity',sprite:'/sprites/web.png'}],
   newBosses:[{name:'Gateway guardian',sprite:'/sprites/boss-frost.png'}],newMaps:[{name:'Server room',background:'/sprites/boss-frost.png'}]};
  assert.equal((await guest(new Request(url,{method:'POST',headers:{Origin:'https://quest.test','Content-Type':'application/json'},body:JSON.stringify(payload)}))).status,401);
  const response=await send('/api/admin/theme-media',payload),saved=await response.json();assert.equal(response.status,200,JSON.stringify(saved));
  assert.equal(saved.characters.find(c=>c.name==='Student look').appearanceFor,'player');assert.equal(saved.characters.find(c=>c.name==='Guide look').appearanceFor,'entity');
  assert.equal(saved.adminSprite,null,'admin wizard stays reserved');
  const boss=saved.bosses[0];assert.match(boss.id,/^boss-/);assert.equal(boss.label,'Gateway guardian');assert.equal(saved.bossSprites[boss.id],'/sprites/boss-frost.png');
  const map=saved.maps.find(m=>m.name==='Server room');assert.ok(map);
  let state=await(await api(new Request('https://quest.test/api/admin/challenges'))).json();
  assert.equal(state.theme.world.buildings.length,initial.maps.length-1);
  const location=state.theme.world.maps.find(m=>m.id===map.id);assert.equal(location.exit,null);assert.equal(location.ground.length,1120);assert.deepEqual(location.spawn,{x:20,y:14});
  assert.ok(themeBossStyles(state.theme).some(s=>s.id===boss.id&&s.sprite===saved.bossSprites[boss.id]));
  assert.equal(createWorld(state.theme.world).canSpawn(map.id,20,14),true);
  const challenge={id:'custom-boss-question',map:map.id,object:'Gateway',region:'Server room',location:{x:25,y:15},text:'Answer.',flags:['flag'],points:10,icon:'boss',bossStyle:boss.id,iconSize:3};
  const challengeResponse=await send('/api/admin/challenges',{revision:0,themeRevision:saved.revision,challenge});assert.equal(challengeResponse.status,200,JSON.stringify(await challengeResponse.json()));
  state=await(await api(new Request('https://quest.test/api/admin/challenges'))).json();
  const world=createWorld(state.theme.world),town=state.theme.world.maps.find(m=>m.id==='town'),ground=[];
  for(let y=0;y<28;y++)for(let x=0;x<40;x++)if(!world.terrainBlocked('town',x,y))ground.push([x,y]);
  const form=new FormData();form.set('map',JSON.stringify({id:'town',ground}));form.set('themeRevision',String(state.themeRevision));form.set('contentRevision',String(state.revision));form.set('transports',JSON.stringify([{id:'server-room-route',map:'town',location:{x:18,y:21},to:map.id}]));
  const linked=await api(new Request('https://quest.test/api/admin/maps',{method:'POST',headers:{Origin:'https://quest.test'},body:form}));assert.equal(linked.status,200,JSON.stringify(await linked.json()));
  state=await(await api(new Request('https://quest.test/api/admin/challenges'))).json();const engine=createWorld(state.theme.world);
  const arrived=engine.step({map:'town',pos:{x:18,y:20}},0,1);assert.equal(arrived.map,map.id);assert.deepEqual(arrived.pos,location.spawn);
  const returned=engine.step(engine.step(arrived,0,1),0,-1);assert.equal(returned.map,'town');
  // The custom appearance is loaded through the player's ordinary theme config.
  let cookie='';const player=async(path,body)=>{const r=await guest(new Request('https://quest.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://quest.test',Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}));if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};};
  assert.equal((await player('/api/auth',{mode:'register',username:'alice',password:'student-password',hero:'web'})).status,200);
  const playerState=(await player('/api/game')).data;assert.equal(playerState.challenges.find(c=>c.id===challenge.id).bossStyle,boss.id);
  assert.equal((await player('/api/config')).data.theme.bossSprites[boss.id],state.theme.bossSprites[boss.id]);
  const themeExport=await api(new Request('https://quest.test/api/admin/packs?kind=theme'));assert.equal(themeExport.status,200);const themeBytes=new Uint8Array(await themeExport.arrayBuffer());
  const contentExport=await api(new Request('https://quest.test/api/admin/packs?kind=content'));assert.equal(contentExport.status,200);const contentBytes=new Uint8Array(await contentExport.arrayBuffer());
  const packed=parseTheme(parse(strFromU8(unzipSync(themeBytes)['theme.yaml'])));assert.deepEqual(packed.bosses,[boss]);assert.ok(packed.world.maps.some(m=>m.id===map.id));
  const backup=await api(new Request('https://quest.test/api/admin/backup'));assert.equal(backup.status,200);const entries=unzipSync(new Uint8Array(await backup.arrayBuffer()));
  const snapshot=validateSnapshot(JSON.parse(strFromU8(entries['backup.json'])));assert.deepEqual(snapshot.theme.bosses,[boss]);assert.ok(snapshot.theme.world.maps.some(m=>m.id===map.id));
  const other=new DatabaseSync(':memory:');initializeSchema(other);try{
   const stored=new Map(),target=createApi({...options,db:createSQLiteAdapter(other),platformAdmin:true,assetStore:{get:async key=>stored.get(key),put:async(key,bytes)=>stored.set(key,bytes)}});
   const pack=new FormData();pack.set('file',new File([themeBytes],'theme.zip'));pack.set('content',new File([contentBytes],'content.zip'));pack.set('themeRevision','0');pack.set('contentRevision','0');
   const imported=await target(new Request('https://quest.test/api/admin/packs?kind=theme',{method:'POST',headers:{Origin:'https://quest.test'},body:pack}));assert.equal(imported.status,200,JSON.stringify(await imported.json()));
   const restored=await(await target(new Request('https://quest.test/api/admin/challenges'))).json();assert.deepEqual(restored.theme.bosses,[boss]);assert.equal(restored.challenges[0].bossStyle,boss.id);assert.ok(restored.theme.world.maps.some(m=>m.id===map.id));
  }finally{other.close();}
 }finally{sqlite.close();}
});

test('new bosses and maps reject invalid images, incomplete names, catalog overflow and stale revisions atomically',async()=>{
 const sqlite=new DatabaseSync(':memory:');initializeSchema(sqlite);
 try {
  const config=parseGame('characters:\n - id: web\n   name: Web'),db=createSQLiteAdapter(sqlite),api=createApi({db,config,challenges:[],platformAdmin:true,readBaseAsset:path=>new Uint8Array(readFileSync('public'+path))});
  const send=body=>api(new Request('https://quest.test/api/admin/theme-media',{method:'POST',headers:{Origin:'https://quest.test','Content-Type':'application/json'},body:JSON.stringify({action:'assign',revision:0,characterSprites:{},bossSprites:{},mapBackgrounds:{},...body})}));
  for(const body of [{newBosses:[{name:'',sprite:'/sprites/web.png'}]},{newBosses:[{name:'Boss',sprite:'/api/assets/unknown.png'}]},{newMaps:[{name:'Room',background:null}]},{newMaps:[{name:'Room',background:'https://example.org/image.png'}]},{newMaps:Array(11).fill({name:'Room',background:'/sprites/web.png'})}])assert.equal((await send(body)).status,400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM theme_catalog').get().n,0);
  const saved=await send({newBosses:[{name:'Boss',sprite:'/sprites/web.png'}]});assert.equal(saved.status,200);const state=await saved.json();
  assert.equal((await send({newMaps:[{name:'Room',background:'/sprites/web.png'}]})).status,409);
  const before=sqlite.prepare("SELECT payload FROM theme_catalog WHERE id='active'").get().payload;
  const tooMany={...JSON.parse(before),bosses:Array.from({length:31},(_,i)=>({id:`boss-overflow-${i}`,label:'Boss'})),bossSprites:Object.fromEntries(Array.from({length:31},(_,i)=>[`boss-overflow-${i}`,'/sprites/web.png']))};assert.throws(()=>parseTheme(tooMany));
  const invalidCustom={...JSON.parse(before),bossSprites:{}};assert.throws(()=>parseTheme(invalidCustom));
  assert.equal(state.bosses.length,1);assert.equal(sqlite.prepare("SELECT payload FROM theme_catalog WHERE id='active'").get().payload,before);
 }finally{sqlite.close();}
});

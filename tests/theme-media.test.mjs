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
    assert.equal(saved.maps.find(m => m.id === 'town').background, src);
    assert.equal((await post(edit)).status, 409);
    assert.equal((await post({ ...edit, revision: saved.revision, characterSprites: { web: '/api/assets/unknown.png' } })).status, 400);
    const game = await (await adminApi(new Request('https://quest.test/api/config'))).json();
    assert.equal(game.theme.bossSprites.frost, src);
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
      assert.equal(imported.characters.find(c => c.name === 'Guide').sprite, src);
      const importedDelete = await importApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', revision: imported.revision, id: imported.media[1].id }) }));
      assert.equal(importedDelete.status, 400);
    } finally { second.close(); }
    const removeResponse = await post({ action: 'assign', revision: saved.revision, characterSprites: {}, bossSprites: {}, mapBackgrounds: {}, removeMediaIds: [saved.media[0].id] });
    assert.equal(removeResponse.status, 400);
    const invalid = new FormData(); invalid.set('revision', String(saved.revision)); invalid.append('files', new File(['not an image'], 'fake.png'));
    assert.equal((await adminApi(new Request(url, { method: 'POST', headers: { Origin: 'https://quest.test' }, body: invalid }))).status, 400);
    assert.equal((await post({ action: 'delete', revision: saved.revision, id: saved.media[0].id })).status, 400);
    const deletedResponse = await post({ action: 'delete', revision: saved.revision, id: saved.media[1].id });
    const deleted = await deletedResponse.json();
    assert.equal(deletedResponse.status, 200, JSON.stringify(deleted));
    assert.equal(deleted.media.length, 1);
    const afterDelete = await adminApi(new Request('https://quest.test/api/admin/packs?kind=theme'));
    const afterEntries = unzipSync(new Uint8Array(await afterDelete.arrayBuffer()));
    assert.ok(!afterEntries['assets' + unusedSrc]);
    assert.ok(afterEntries['assets' + src]);
  } finally { sqlite.close(); }
});

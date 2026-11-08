import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync, strFromU8 } from 'fflate';
import { parse, stringify } from 'yaml';
import { themePresets, presetCatalog } from '../lib/theme-presets.mjs';
import { parseTheme, themeAssetPaths } from '../lib/theme-schema.mjs';
import { parseChallenges, parseGame } from '../lib/config-schema.mjs';
import { createWorld } from '../lib/world-data.mjs';
import { themeContentValid } from '../server/packs.mjs';
import { createSQLiteAdapter, initializeSchema } from '../server/sqlite.mjs';
import { createApi } from '../server/api.mjs';
import { exportFullBackup } from '../server/backup.mjs';

const preset = themePresets.find(p => p.id === 'dynamic-sre-part1');
const source = JSON.parse(readFileSync('themes/dynamic-sre-part1/SOURCE.json', 'utf8'));

test('Dynamic SRE preserves all source questions, answer case rules, hints and the linked exercise', () => {
  const { theme, challenges } = preset;
  assert.equal(theme.world.maps.length, 4);
  assert.deepEqual(challenges.map(c => c.map), [
    'analysis-bunker', 'analysis-bunker', 'analysis-bunker',
    'debugging-floor', 'debugging-floor', 'debugging-floor',
    'patch-floor', 'patch-floor', 'patch-floor',
  ]);
  assert.equal(theme.world.maps.at(-1).id, 'celebration-hall');
  assert.match(theme.world.maps.at(-1).name, /Floor 4.*Congratulations/);
  assert.equal(presetCatalog().find(p => p.id === preset.id).contentLabel, 'assignment');
  assert.equal(challenges.length, 9);
  assert.equal(challenges.reduce((n, c) => n + c.points, 0), 37);
  assert.equal(challenges.reduce((n, c) => n + c.hints.length, 0), 5);
  assert.equal(challenges.reduce((n, c) => n + c.flagRules.length, 0), 20);
  assert.deepEqual(challenges.map(c => c.ctfd.challenge.id), source.challengeOrder);
  assert.deepEqual(source.challengeOrder, [18, 39, 40, 41, 42, 43, 44, 45, 24]);
  const world = createWorld(theme.world);
  themeContentValid(theme, challenges);
  for (const [index, c] of challenges.entries()) {
    assert.ok(world.reachable(c.map, c.location.x, c.location.y), c.id);
    assert.deepEqual(c.dependsOn, index ? [challenges[index - 1].id] : []);
    assert.equal(c.points, c.ctfd.challenge.value);
    assert.equal(c.grading, 'automatic');
    assert.equal(c.visibility, 'visible');
    assert.ok(c.ctfd.flags.every(f => f.type === 'static'));
    assert.deepEqual(c.flagRules, c.ctfd.flags.map(f => ({ value: f.content, caseSensitive: f.data !== 'case_insensitive' })));
    assert.deepEqual(c.hints.map(h => [h.text, h.cost]), c.ctfd.hints.map(h => [h.content, h.cost]));
  }
  const stack = challenges.find(c => c.ctfd.challenge.id === 44);
  assert.equal(stack.flagRules.filter(f => f.caseSensitive).length, 2);
  assert.match(challenges.at(-1).text, /Assignment-DynReverse1/);
  assert.equal(challenges.filter(c => c.downloads.length).length, 1);
  const exercise = readFileSync('public' + challenges[0].downloads[0].url);
  assert.equal(createHash('sha256').update(exercise).digest('hex'), source.exerciseSha256);

  const themeEntries = unzipSync(readFileSync('theme-packs/dynamic-sre-part1.zip'));
  assert.deepEqual(parseTheme(parse(strFromU8(themeEntries['theme.yaml']))), theme);
  assert.equal(Object.keys(themeEntries).length, themeAssetPaths(theme).length + 1);
  for (const path of themeAssetPaths(theme)) assert.ok(themeEntries['assets' + path]?.length, path);
  const contentEntries = unzipSync(readFileSync('theme-packs/dynamic-sre-part1-demo-content.zip'));
  const videoChallenges = challenges.filter(c => c.discoveryVideo || c.solveVideo);
  assert.deepEqual(videoChallenges.map(c => c.ctfd.challenge.id), [18, 42, 45, 24]);
  assert.ok(videoChallenges.every(c => c.discoveryVideo && c.solveVideo));
  const videoPaths = videoChallenges.flatMap(c => [c.discoveryVideo, c.solveVideo]);
  assert.equal(new Set(videoPaths).size, 8);
  assert.deepEqual(Object.keys(contentEntries).sort(), ['assets' + challenges[0].downloads[0].url, 'content.yaml', ...videoPaths.map(p => 'assets' + p)].sort());
  for (const path of videoPaths) {
    const video = readFileSync('public' + path);
    assert.ok(video.length > 1000 && video.length < 4 * 1024 * 1024, path);
    assert.equal(video.toString('ascii', 4, 8), 'ftyp');
    assert.deepEqual(Buffer.from(contentEntries['assets' + path]), video);
    assert.ok(!themeEntries['assets' + path], 'Challenge videos belong to the content pack.');
  }
  assert.deepEqual(Buffer.from(contentEntries['assets' + challenges[0].downloads[0].url]), exercise);
  assert.deepEqual(parseChallenges(stringify({ challenges: parse(strFromU8(contentEntries['content.yaml'])).challenges }), theme.world.maps.map(m => m.id)), challenges);
});

test('the four floors connect in order, return down the tower, and keep every guide reachable', () => {
  const world = createWorld(preset.theme.world);
  const ids = preset.theme.world.maps.map(m => m.id);
  assert.equal(preset.theme.world.transports.length, 3);
  let place = { map: ids[0], pos: { x: 5, y: 7 } };
  for (const [index, link] of preset.theme.world.transports.entries()) {
    assert.equal(link.map, ids[index]);
    assert.equal(link.to, ids[index + 1]);
    assert.ok(world.reachable(link.map, link.location.x, link.location.y));
    place = world.step({ ...place, pos: { x: 5, y: 7 } }, -1, 0);
    assert.equal(place.map, link.to);
    assert.deepEqual(place.pos, world.mapInfo(link.to).spawn);
    assert.equal(place.travel.length, index + 1);
  }
  for (let index = 2; index >= 0; index--) {
    const spawn = world.mapInfo(place.map).spawn;
    place = world.step(world.step({ ...place, pos: spawn }, 0, -1), 0, 1);
    assert.equal(place.map, ids[index]);
    assert.deepEqual(place.pos, preset.theme.world.transports[index].location);
  }
  assert.deepEqual(place.travel, []);
  for (const person of preset.theme.world.entities) {
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => world.reachable(person.map, person.location.x + dx, person.location.y + dy)), person.name);
    if (person.map === 'celebration-hall') assert.match(person.nodes[0].text, /congratulations|well done|great work/i);
  }
});

test('the paired assignment imports, enforces every prerequisite, and awards the original 37 points', async () => {
  const sqlite = new DatabaseSync(':memory:');
  initializeSchema(sqlite);
  try {
    const db = createSQLiteAdapter(sqlite);
    const config = parseGame('characters:\n - id: web\n   name: Analyst\naccounts:\n allowRegistration: true\n users: []');
    const blobs = new Map();
    const options = { db, config, challenges: [], assetStore: { get: async k => blobs.get(k), put: async (k, v) => blobs.set(k, v) }, readBaseAsset: p => new Uint8Array(readFileSync('public' + p)) };
    const admin = createApi({ ...options, platformAdmin: true });
    const form = new FormData();
    form.set('file', new File([readFileSync('theme-packs/dynamic-sre-part1-demo-theme.zip')], 'theme.zip'));
    form.set('content', new File([readFileSync('theme-packs/dynamic-sre-part1-demo-content.zip')], 'content.zip'));
    form.set('themeRevision', '0'); form.set('contentRevision', '0');
    const imported = await admin(new Request('https://quest.test/api/admin/packs?kind=theme', { method: 'POST', headers: { Origin: 'https://quest.test' }, body: form }));
    const result = await imported.json();
    assert.equal(imported.status, 200, JSON.stringify(result));
    assert.equal(result.placement.moved.length, 0);
    assert.equal(result.placement.excluded.length, 0);
    const api = createApi(options);
    let cookie = '';
    async function call(path, body) {
      const r = await api(new Request('https://quest.test' + path, { method: body ? 'POST' : 'GET', headers: { Origin: 'https://quest.test', Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
      if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return { status: r.status, data: await r.json() };
    }
    assert.equal((await call('/api/admin/packs?kind=content&preset=dynamic-sre-part1')).status, 401);
    assert.equal((await call('/api/auth', { mode: 'register', username: 'bunker-student', password: 'student-password', hero: 'web' })).status, 200);
    for (const c of preset.challenges.slice(1)) assert.ok((await call('/api/game', { id: c.id, answer: c.flags[0] })).status >= 400, c.id);
    const initial = (await call('/api/game')).data;
    assert.ok(!JSON.stringify(initial).includes('flagRules'));
    assert.ok(!JSON.stringify(initial).includes('"ctfd"'));
    for (const c of preset.challenges) {
      if (c.discoveryVideo) {
        assert.equal((await call('/api/game', { id: c.id, action: 'cutscene', phase: 'discovery' })).status, 403);
        assert.equal((await call('/api/game', { id: c.id, action: 'discover' })).status, 200);
        const pre = await call('/api/game', { id: c.id, action: 'cutscene', phase: 'discovery' });
        assert.equal(pre.status, 200);
        assert.equal(pre.data.play, true);
        assert.deepEqual(Buffer.from(blobs.get(pre.data.url.slice(12))), readFileSync('public' + c.discoveryVideo));
        assert.equal((await call('/api/game', { id: c.id, action: 'cutscene', phase: 'discovery' })).data.play, false);
        assert.equal((await call('/api/game', { id: c.id, action: 'cutscene', phase: 'solve' })).status, 403);
      }
      if (c.ctfd.challenge.id === 44) {
        const wrongCase = await call('/api/game', { id: c.id, answer: 'ESP+4H' });
        assert.equal(wrongCase.status, 200);
        assert.equal(wrongCase.data.correct, false);
      }
      const answer = await call('/api/game', { id: c.id, answer: c.ctfd.challenge.id === 44 ? 'esp+4h' : c.flags[0] });
      assert.equal(answer.status, 200, JSON.stringify(answer));
      assert.equal(answer.data.correct, true, c.id);
      if (c.solveVideo) {
        const post = await call('/api/game', { id: c.id, action: 'cutscene', phase: 'solve' });
        assert.equal(post.status, 200);
        assert.equal(post.data.play, true);
        assert.deepEqual(Buffer.from(blobs.get(post.data.url.slice(12))), readFileSync('public' + c.solveVideo));
        assert.equal((await call('/api/game', { id: c.id, action: 'cutscene', phase: 'solve' })).data.play, false);
        assert.equal((await call('/api/game', { id: c.id, action: 'cutscene', phase: 'solve', replay: true })).data.play, true);
      }
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM solved').get().n, 9);
    const backup = await exportFullBackup(options);
    const backupEntries = unzipSync(new Uint8Array(await backup.arrayBuffer()));
    assert.ok(backupEntries['themes/dynamic-sre-part1/theme.json']);
    for (const map of preset.theme.world.maps) assert.ok(backupEntries['public' + map.background]);
    assert.equal(JSON.parse(strFromU8(backupEntries['backup.json'])).solved.length, 9);
    assert.equal(JSON.parse(strFromU8(backupEntries['backup.json'])).cutscenes.length, 8);
    assert.equal(sqlite.prepare('SELECT SUM(points) n FROM solved').get().n, 37);

    const contentBefore = sqlite.prepare('SELECT payload FROM challenge_catalog').get().payload;
    const themeOnly = new FormData();
    themeOnly.set('file', new File([readFileSync('theme-packs/dynamic-sre-part1.zip')], 'theme.zip'));
    themeOnly.set('themeRevision', '1'); themeOnly.set('contentRevision', '1');
    const updated = await admin(new Request('https://quest.test/api/admin/packs?kind=theme', { method: 'POST', headers: { Origin: 'https://quest.test' }, body: themeOnly }));
    assert.equal(updated.status, 200, JSON.stringify(await updated.json()));
    assert.equal(sqlite.prepare('SELECT payload FROM challenge_catalog').get().payload, contentBefore);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM solved').get().n, 9);
  } finally { sqlite.close(); }
});

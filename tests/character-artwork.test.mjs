import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the same canvas renderer used by the map, portraits, and previews.
function loadTypeScript(path, require = () => { throw Error('Unexpected dependency'); }) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports);
  return module.exports;
}
const visible = loadTypeScript('lib/visible-sprite.ts');
const { drawCharacter, matchingSprite } = loadTypeScript('lib/character-artwork.ts', name => {
  assert.equal(name, './visible-sprite');
  return visible;
});

function canvas() {
  const fills = [], images = [];
  return {
    fills, images, fillStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, arc() {},
    fill() { fills.push(this.fillStyle); },
    fillRect() { fills.push(this.fillStyle); },
    drawImage(image) { images.push(image); },
  };
}

test('custom avatars use a neutral placeholder while loading or unavailable, including admins', () => {
  for (const fallback of ['web', 'thunder', 'shield']) {
    for (const administrator of [false, true]) {
      const ctx = canvas();
      drawCharacter(ctx, 50, 50, { sprite: '/themes/current/avatar.png', fallback, administrator }, null, 85);
      assert.deepEqual(new Set(ctx.fills), new Set(['#8faab5']));
      assert.equal(ctx.images.length, 0);
    }
  }
});

test('loaded theme artwork is drawn and explicit built-in appearances still work', () => {
  const image = { naturalWidth: 64, naturalHeight: 128 };
  const themed = canvas();
  drawCharacter(themed, 50, 50, { sprite: '/themes/current/avatar.png', fallback: 'web' }, image, 85);
  assert.deepEqual(themed.images, [image]);
  assert.equal(themed.fills.length, 0);
  const builtin = canvas();
  drawCharacter(builtin, 50, 50, { sprite: null, fallback: 'web' }, null, 85);
  assert.ok(builtin.fills.includes('#d94c57'));
  const admin = canvas();
  drawCharacter(admin, 50, 50, { sprite: null, fallback: 'shield', administrator: true }, null, 85);
  assert.ok(admin.fills.includes('#805dcc'));
});

test('switching avatar or map paths immediately rejects the previous image, even before loading effects run', () => {
  const old = { path: '/themes/old/avatar.png', image: { name: 'old avatar' } };
  const current = { path: '/themes/current/avatar.png', image: { name: 'current avatar' } };
  assert.equal(matchingSprite(old.path, old), old.image);
  assert.equal(matchingSprite(current.path, old), null);
  assert.equal(matchingSprite(current.path, null), null);
  assert.equal(matchingSprite(current.path, current), current.image);
  assert.equal(matchingSprite(current.path, { path: current.path, image: null }), null);
  assert.equal(matchingSprite(null, current), null);
  assert.equal(matchingSprite('/maps/current.png', { path: '/maps/old.png', image: old.image }), null);
});

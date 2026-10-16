import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import midiPackage from "@tonejs/midi";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "yaml";
import { themePresets, presetCatalog } from "../lib/theme-presets.mjs";
import { parseTheme, themeAssetPaths } from "../lib/theme-schema.mjs";
import { defaultGameConfig } from "../lib/runtime-config.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";

test("Halloween theme packs its original art, characters, boss, music, and cues", () => {
  const preset = themePresets.find(item => item.id === "halloween");
  assert.ok(preset);
  assert.equal(presetCatalog().find(item => item.id === "halloween").demoCount, 10);
  const theme = preset.theme;
  assert.equal(theme.world.maps.length, 7);
  assert.deepEqual(theme.characters.filter(c => c.appearanceFor === "player").map(c => c.id), ["web", "thunder", "shield"]);
  assert.equal(theme.bosses[0].id, "boss-pumpkin-wraith");
  assert.equal(theme.world.entities[0].characterId, "raven-guide");
  const entries = unzipSync(readFileSync("theme-packs/halloween.zip"));
  assert.deepEqual(parseTheme(parse(strFromU8(entries["theme.yaml"]))), theme);
  assert.ok(!entries["content.yaml"]);
  for (const path of themeAssetPaths(theme)) {
    assert.ok(entries[`assets${path}`]?.length, path);
    assert.ok(entries[`assets${path}`].length < 4 * 1024 * 1024, path);
  }
  for (const track of theme.audio.playlist) {
    const midi = new midiPackage.Midi(readFileSync(`public${track.midi}`));
    assert.ok(midi.tracks.some(item => item.notes.length > 0), track.name);
  }
});

test("Halloween preset exports reusable artwork and a separate paired demo", async () => {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  try {
    const files = new Map();
    const api = createApi({
      db: createSQLiteAdapter(sqlite),
      config: defaultGameConfig(),
      challenges: [],
      platformAdmin: true,
      assetStore: { get: async key => files.get(key), put: async (key, bytes) => files.set(key, bytes) },
      readBaseAsset: path => new Uint8Array(readFileSync(`public${path}`)),
    });
    const theme = await api(new Request("http://quest.test/api/admin/packs?kind=theme&preset=halloween"));
    assert.equal(theme.status, 200);
    const entries = unzipSync(new Uint8Array(await theme.arrayBuffer()));
    assert.equal(parseTheme(parse(strFromU8(entries["theme.yaml"]))).title, "Halloween Hollow");
    const form = new FormData();
    form.set("file", new File([readFileSync("theme-packs/halloween.zip")], "halloween.zip"));
    form.set("themeRevision", "0");
    form.set("contentRevision", "0");
    const imported = await api(new Request("http://quest.test/api/admin/packs?kind=theme", {
      method: "POST", headers: { Origin: "http://quest.test" }, body: form,
    }));
    assert.equal(imported.status, 200, JSON.stringify(await imported.json()));
    assert.equal((await api(new Request("http://quest.test/api/admin/packs?kind=content&preset=halloween"))).status, 200);
    assert.equal((await api(new Request("http://quest.test/api/admin/packs?kind=theme&preset=halloween&demo=true"))).status, 200);
  } finally { sqlite.close(); }
});

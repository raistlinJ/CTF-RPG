import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "yaml";
import midiPackage from "@tonejs/midi";
import { themePresets } from "../lib/theme-presets.mjs";
import { themeAssetPaths, parseTheme } from "../lib/theme-schema.mjs";
import { createWorld, defaultWorld } from "../lib/world-data.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { createApi } from "../server/api.mjs";
import { createSQLiteAdapter, initializeSchema } from "../server/sqlite.mjs";
test("Agentic Circuit is a portable course theme with reachable doors, compatible locations, alpha sprites, and MIDI", () => {
  const theme = themePresets[0].theme,
    w = createWorld(theme.world);
  assert.equal(theme.title, "Agentic Circuit");
  assert.deepEqual(
    new Set(w.MAP_IDS),
    new Set(defaultWorld.maps.map((m) => m.id)),
  );
  assert.deepEqual(
    theme.characters.map((c) => c.id),
    ["web", "thunder", "shield"],
  );
  let size = 0;
  for (const path of themeAssetPaths(theme)) {
    const b = readFileSync("public" + path);
    size += b.length;
    assert.ok(b.length < 4 * 1024 * 1024);
    if (path.endsWith(".png")) {
      assert.deepEqual([...b.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      if (path.includes("/sprites/")) assert.equal(b[25], 6);
    }
  }
  assert.ok(size < 8 * 1024 * 1024);
  for (const c of parseChallenges(
    readFileSync("content/challenges.yaml", "utf8"),
  ))
    assert.ok(w.canPlaceChallenge(c.map, c.location.x, c.location.y), c.id);
  for (const building of theme.world.buildings) {
    const outside = {
        map: theme.world.startMap,
        pos: { x: building.door.x, y: building.door.y + 1 },
      },
      room = w.step(outside, 0, -1);
    assert.equal(room.map, building.id);
    assert.ok(!w.blocked(room.map, room.pos.x, room.pos.y));
    const exit = w.exitTile(room.map);
    assert.deepEqual(
      w.step({ map: room.map, pos: { x: exit.x, y: exit.y - 1 } }, 0, 1),
      outside,
    );
  }
  const midi = new midiPackage.Midi(readFileSync("public" + theme.audio.midi));
  assert.equal(midi.header.tempos[0].bpm, 96);
  assert.ok(midi.tracks.some((t) => t.notes.length > 0));
});
test("course preset downloads are admin-only and contain no challenges, accounts or responses", async () => {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const db = createSQLiteAdapter(sqlite),
    config = parseGame(readFileSync("content/game.yaml", "utf8")),
    challenges = parseChallenges(
      readFileSync("content/challenges.yaml", "utf8"),
    ),
    options = {
      db,
      config,
      challenges,
      readBaseAsset: (p) => new Uint8Array(readFileSync("public" + p)),
    };
  const anonymous = createApi(options),
    admin = createApi({ ...options, platformAdmin: true });
  let r = await anonymous(
    new Request(
      "http://quest.test/api/admin/packs?kind=theme&preset=agentic-circuit",
    ),
  );
  assert.equal(r.status, 401);
  r = await admin(
    new Request(
      "http://quest.test/api/admin/packs?kind=theme&preset=agentic-circuit",
    ),
  );
  assert.equal(r.status, 200);
  const entries = unzipSync(new Uint8Array(await r.arrayBuffer()));
  assert.equal(
    parseTheme(parse(strFromU8(entries["theme.yaml"]))).title,
    "Agentic Circuit",
  );
  assert.ok(!entries["content.yaml"]);
  assert.ok(!entries["backup.json"]);
  assert.equal(Object.keys(entries).length, 8);
  sqlite.close();
});

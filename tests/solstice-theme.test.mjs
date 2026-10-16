import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import midiPackage from "@tonejs/midi";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "yaml";
import { themePresets, presetCatalog } from "../lib/theme-presets.mjs";
import { parseTheme, themeAssetPaths } from "../lib/theme-schema.mjs";

test("Solstice Vanguard exports its original artwork, music, and distinct event cues", () => {
  const preset = themePresets.find(item => item.id === "solstice-vanguard");
  assert.ok(preset);
  assert.equal(presetCatalog().find(item => item.id === preset.id).demoCount, 10);
  const { theme } = preset;
  assert.equal(theme.world.maps.length, 7);
  assert.deepEqual(theme.characters.filter(c => c.appearanceFor === "player").map(c => c.name), [
    "Comet Courier", "Starforge Inventor", "Evergreen Guardian",
  ]);
  assert.equal(theme.bossSprites["boss-frost-eclipse"], "/themes/solstice-vanguard/sprites/frost-eclipse-construct.webp");

  const entries = unzipSync(readFileSync("theme-packs/solstice-vanguard.zip"));
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
  const cueHashes = theme.sounds.clips.map(({ src }) => createHash("sha256").update(readFileSync(`public${src}`)).digest("hex"));
  assert.equal(new Set(cueHashes).size, cueHashes.length);
});

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { once } from "node:events";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { stringify, parse } from "yaml";
import { createApi } from "../server/api.mjs";
import { initializeSchema, createSQLiteAdapter } from "../server/sqlite.mjs";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { defaultTheme } from "../lib/theme-schema.mjs";
import { createWorld } from "../lib/world-data.mjs";
import { exportFullBackup } from "../server/backup.mjs";
const baseline = parseChallenges(
  readFileSync("content/challenges.yaml", "utf8"),
);
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  initializeSchema(sqlite);
  const config = parseGame(
      "characters:\n - id: web\n   name: Web\naccounts:\n allowRegistration: true\n users:\n  - username: teacher\n    password: teacher-password\n    role: admin\n    hero: web",
    ),
    db = createSQLiteAdapter(sqlite),
    files = new Map(),
    assetStore = {
      async get(k) {
        return files.get(k) || null;
      },
      async put(k, v) {
        files.set(k, v);
      },
    },
    api = createApi({
      db,
      config,
      challenges: baseline,
      assetStore,
      readBaseAsset: (p) => {
        try {
          return new Uint8Array(readFileSync("public" + p));
        } catch {
          return null;
        }
      },
      exportBackup: exportFullBackup,
    });
  function client() {
    let cookie = "";
    return async (path, body, method = body ? "POST" : "GET") => {
      const headers = { Origin: "http://quest.test", Cookie: cookie };
      if (body && !(body instanceof FormData))
        headers["Content-Type"] = "application/json";
      const r = await api(
        new Request("http://quest.test" + path, {
          method,
          headers,
          body:
            body instanceof FormData
              ? body
              : body
                ? JSON.stringify(body)
                : undefined,
        }),
      );
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const bytes = new Uint8Array(await r.arrayBuffer());
      return {
        status: r.status,
        data: r.headers.get("content-type")?.includes("json")
          ? JSON.parse(strFromU8(bytes))
          : null,
        bytes,
      };
    };
  }
  return { sqlite, db, config, api, files, client };
}
function custom(config) {
  const t = defaultTheme(config);
  t.title = "Island Quest";
  t.description = "Explore together";
  t.audio.midi = "/audio/north-pole.mid";
  t.world = {
    startMap: "island",
    renderer: "tiles",
    trees: [],
    buildings: [
      {
        id: "lodge",
        name: "Lodge",
        x: 20,
        y: 9,
        w: 3,
        h: 4,
        door: { x: 21, y: 12 },
        color: "#654321",
      },
    ],
    maps: [
      {
        id: "island",
        name: "Island",
        bounds: { left: 1, right: 38, top: 1, bottom: 26 },
        spawn: { x: 18, y: 20 },
        exit: null,
        background: "/maps/island.png",
        floor: "#aaddff",
        wall: "#112233",
        obstacles: [],
      },
      {
        id: "lodge",
        name: "Lodge",
        bounds: { left: 10, right: 29, top: 6, bottom: 24 },
        spawn: { x: 20, y: 22 },
        exit: { x: 20, y: 24 },
        background: null,
        floor: "#ffddaa",
        wall: "#112233",
        obstacles: [],
      },
    ],
  };
  return t;
}
const content = [
  {
    id: "island-question",
    map: "island",
    object: "Island clue",
    location: { x: 19, y: 20 },
    region: "Island",
    text: "Read the clue",
    flags: ["SECRET-FLAG"],
    caseSensitive: true,
    points: 50,
    hints: [{ id: "clue", label: "Clue", text: "Hidden hint", cost: 5 }],
    downloads: [
      { name: "Puzzle", url: "/downloads/puzzle.txt" },
      { name: "Capture", url: "/downloads/puzzle.pcap" },
    ],
  },
];
const themeZip = (t) =>
  zipSync({
    "assets/sprites/web.png": new Uint8Array(
      readFileSync("public/sprites/web.png"),
    ),
    "theme.yaml": strToU8(stringify(t)),
    "assets/maps/island.png": new Uint8Array(
      readFileSync("public/maps/town.png"),
    ),
    "assets/audio/north-pole.mid": new Uint8Array(
      readFileSync("public/audio/north-pole.mid"),
    ),
  });
const contentZip = (cs) =>
  zipSync({
    "content.yaml": strToU8(
      stringify({ format: "quest-content", version: 1, challenges: cs }),
    ),
    "assets/downloads/puzzle.txt": strToU8("A downloadable puzzle"),
    "assets/downloads/puzzle.pcap": new Uint8Array([0, 1, 2, 3, 4]),
  });
function form(file, state, paired) {
  const f = new FormData();
  f.set("file", new Blob([file], { type: "application/zip" }), "pack.zip");
  f.set("themeRevision", String(state.themeRevision));
  f.set("contentRevision", String(state.contentRevision));
  if (paired)
    f.set(
      "content",
      new Blob([paired], { type: "application/zip" }),
      "content.zip",
    );
  return f;
}
test("admin-only separate packs, paired world/content changes, assets, roundtrip and full restoration", async () => {
  const { sqlite, config, files, client } = setup(),
    admin = client(),
    student = client();
  for (const kind of ["theme", "content"]) {
    assert.equal((await student("/api/admin/packs?kind=" + kind)).status, 401);
    assert.equal(
      (
        await student(
          "/api/admin/packs?kind=" + kind,
          form(themeZip(custom(config)), {
            themeRevision: 0,
            contentRevision: 0,
          }),
        )
      ).status,
      401,
    );
  }
  await student("/api/auth", {
    mode: "register",
    username: "alice",
    password: "student-password",
    hero: "web",
  });
  await admin("/api/auth", {
    mode: "login",
    username: "teacher",
    password: "teacher-password",
    hero: "web",
  });
  assert.equal((await student("/api/admin/packs")).status, 403);
  assert.equal(
    (
      await student(
        "/api/admin/packs?kind=content",
        form(contentZip(content), { themeRevision: 0, contentRevision: 0 }),
      )
    ).status,
    403,
  );
  sqlite
    .prepare(
      "INSERT INTO solved(user,challenge,points) SELECT id,?,17 FROM students WHERE username=?",
    )
    .run("historical", "alice");
  let state = (await admin("/api/admin/packs")).data;
  const themeExport = await admin("/api/admin/packs?kind=theme"),
    baseTheme = parse(strFromU8(unzipSync(themeExport.bytes)["theme.yaml"]));
  assert.equal(themeExport.status, 200);
  assert.ok(baseTheme.world.maps.every((m) => m.background));
  assert.ok(
    !strFromU8(unzipSync(themeExport.bytes)["theme.yaml"]).includes("teacher"),
  );
  const contentExport = await admin("/api/admin/packs?kind=content");
  assert.ok(unzipSync(contentExport.bytes)["content.yaml"]);
  assert.ok(!unzipSync(contentExport.bytes)["theme.yaml"]);
  const t = custom(config);
  const result = await admin(
    "/api/admin/packs?kind=theme",
    form(themeZip(t), state, contentZip(content)),
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  state = (await admin("/api/admin/packs")).data;
  assert.equal(state.theme.title, "Island Quest");
  assert.equal(state.challengeCount, 1);
  assert.equal(state.themeRevision, 1);
  assert.equal(state.contentRevision, 1);
  const publicData = (await student("/api/config")).data;
  assert.equal(publicData.theme.world.startMap, "island");
  assert.ok(!JSON.stringify(publicData).includes("SECRET-FLAG"));
  const game = (await student("/api/game")).data;
  assert.equal(game.challenges[0].map, "island");
  assert.equal(game.score, 17);
  assert.ok(!JSON.stringify(game).includes("SECRET-FLAG"));
  const download = await student(game.challenges[0].downloads[0].url);
  assert.equal(download.status, 200);
  assert.equal(strFromU8(download.bytes), "A downloadable puzzle");
  assert.equal(game.challenges[0].downloads[1].filename, "puzzle.pcap");
  assert.deepEqual(
    (await student(game.challenges[0].downloads[1].url)).bytes,
    new Uint8Array([0, 1, 2, 3, 4]),
  );
  const w = createWorld(publicData.theme.world);
  assert.deepEqual(w.step({ map: "island", pos: { x: 21, y: 13 } }, 0, -1), {
    map: "lodge",
    pos: { x: 20, y: 22 },
  });
  assert.deepEqual(w.step({ map: "lodge", pos: { x: 20, y: 23 } }, 0, 1), {
    map: "island",
    pos: { x: 21, y: 13 },
  });
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=theme",
        form(
          themeZip(t),
          { themeRevision: 0, contentRevision: 0 },
          contentZip(content),
        ),
      )
    ).status,
    400,
  );
  const exportedTheme = await admin("/api/admin/packs?kind=theme"),
    exportedContent = await admin("/api/admin/packs?kind=content");
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=theme",
        form(exportedTheme.bytes, state, exportedContent.bytes),
      )
    ).status,
    200,
  );
  state = (await admin("/api/admin/packs")).data;
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=content",
        form(exportedContent.bytes, state),
      )
    ).status,
    200,
  );
  assert.equal(
    (await admin("/api/admin/packs")).data.themeRevision,
    state.themeRevision,
  );
  const backup = await admin("/api/admin/backup");
  assert.equal(backup.status, 200, JSON.stringify(backup.data));
  const entries = unzipSync(backup.bytes),
    snapshot = JSON.parse(strFromU8(entries["backup.json"]));
  assert.equal(snapshot.theme.title, "Island Quest");
  assert.ok(
    Object.keys(entries).some((k) => k.startsWith("data/pack-assets/")),
  );
  const folder = mkdtempSync(resolve(tmpdir(), "quest-pack-"));
  for (const [name, bytes] of Object.entries(entries)) {
    const p = resolve(folder, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
  }
  symlinkSync(resolve("node_modules"), resolve(folder, "node_modules"), "dir");
  const dbpath = resolve(folder, "data/quest.sqlite"),
    r = spawnSync(
      process.execPath,
      [resolve(folder, "server/restore.mjs"), resolve(folder, "backup.json")],
      { env: { ...process.env, DATABASE_PATH: dbpath }, encoding: "utf8" },
    );
  assert.equal(r.status, 0, r.stderr);
  const restored = new DatabaseSync(dbpath);
  assert.equal(
    JSON.parse(
      restored.prepare("SELECT payload FROM theme_catalog").get().payload,
    ).title,
    "Island Quest",
  );
  assert.equal(
    restored.prepare("SELECT COUNT(*) AS n FROM students").get().n,
    2,
  );
  restored.close();
  const processChild = spawn(
    process.execPath,
    [resolve(folder, "server/selfhost.mjs")],
    {
      cwd: folder,
      env: {
        ...process.env,
        DATABASE_PATH: dbpath,
        HOST: "127.0.0.1",
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    const url = await new Promise((res, rej) => {
      const timer = setTimeout(
        () => rej(Error("Restored server did not start")),
        5000,
      );
      processChild.stdout.on("data", (data) => {
        const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          res(match[0]);
        }
      });
      processChild.once("exit", (code) => {
        clearTimeout(timer);
        rej(Error("Restored server exited " + code));
      });
    });
    const c = await (await fetch(url + "/api/config")).json();
    assert.equal(c.theme.title, "Island Quest");
    assert.equal(
      (await fetch(url + c.theme.world.maps[0].background)).status,
      200,
    );
  } finally {
    if (processChild.exitCode === null && processChild.signalCode === null) {
      processChild.kill("SIGTERM");
      await once(processChild, "exit");
    }
    rmSync(folder, { recursive: true, force: true });
  }
  sqlite.close();
});
test("bad packs, unsafe assets, unknown heroes and malformed locations do not change active data", async () => {
  const { sqlite, config, client } = setup(),
    admin = client();
  await admin("/api/auth", {
    mode: "login",
    username: "teacher",
    password: "teacher-password",
    hero: "web",
  });
  const state = (await admin("/api/admin/packs")).data,
    t = custom(config),
    bad = [
      zipSync({
        "theme.yaml": strToU8(stringify(t)),
        "assets/../oops.txt": strToU8("bad"),
      }),
      zipSync({ "theme.yaml": strToU8("not: a theme") }),
      zipSync({
        "content.yaml": strToU8(
          "format: quest-content\nversion: 99\nchallenges: []",
        ),
      }),
    ];
  for (const file of bad)
    assert.equal(
      (await admin("/api/admin/packs?kind=theme", form(file, state))).status,
      400,
    );
  const unknown = structuredClone(t);
  unknown.characters[0].id = "other";
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=theme",
        form(themeZip(unknown), state, contentZip(content)),
      )
    ).status,
    400,
  );
  const blocked = structuredClone(content);
  blocked[0].location = { x: 0.5, y: 0 };
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=theme",
        form(themeZip(t), state, contentZip(blocked)),
      )
    ).status,
    400,
  );
  const fake = unzipSync(themeZip(t));
  fake["assets/maps/island.png"] = strToU8("<script>bad</script>");
  assert.equal(
    (
      await admin(
        "/api/admin/packs?kind=theme",
        form(zipSync(fake), state, contentZip(content)),
      )
    ).status,
    400,
  );
  assert.equal((await admin("/api/admin/packs")).data.themeRevision, 0);
  assert.equal((await admin("/api/admin/packs")).data.contentRevision, 0);
  sqlite.close();
});

test("simultaneous paired imports keep the winning theme and content together", async () => {
  const { sqlite, config, client } = setup(),
    a = client(),
    b = client();
  for (const call of [a, b])
    await call("/api/auth", {
      mode: "login",
      username: "teacher",
      password: "teacher-password",
      hero: "web",
    });
  const state = (await a("/api/admin/packs")).data,
    ta = custom(config),
    tb = custom(config),
    ca = structuredClone(content),
    cb = structuredClone(content);
  ta.title = "Island A";
  tb.title = "Island B";
  ca[0].id = "question-a";
  cb[0].id = "question-b";
  const results = await Promise.all([
    a("/api/admin/packs?kind=theme", form(themeZip(ta), state, contentZip(ca))),
    b("/api/admin/packs?kind=theme", form(themeZip(tb), state, contentZip(cb))),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const final = (await a("/api/admin/packs")).data,
    catalog = (await a("/api/admin/challenges")).data;
  assert.equal(final.themeRevision, 1);
  assert.equal(final.contentRevision, 1);
  assert.equal(
    catalog.challenges[0].id,
    final.theme.title === "Island A" ? "question-a" : "question-b",
  );
  sqlite.close();
});

test("theme-only imports relocate questions and require an explicit overflow decision without writing", async () => {
  const { sqlite, config, client, files } = setup(),
    admin = client();
  await admin("/api/auth", {
    mode: "login",
    username: "teacher",
    password: "teacher-password",
    hero: "web",
  });
  let state = (await admin("/api/admin/packs")).data;
  const moved = await admin(
    "/api/admin/packs?kind=theme",
    form(themeZip(custom(config)), state),
  );
  assert.equal(moved.status, 200);
  assert.equal(moved.data.placement.moved.length, baseline.length);
  state = (await admin("/api/admin/packs")).data;
  assert.equal(state.contentRevision, 1);
  assert.equal(state.challengeCount, baseline.length);
  const tiny = custom(config);
  tiny.world.buildings = [];
  tiny.world.maps = [tiny.world.maps[0]];
  Object.assign(tiny.world.maps[0], {
    bounds: { left: 1, right: 1, top: 1, bottom: 1 },
    spawn: { x: 1, y: 1 },
  });
  const beforeFiles = files.size;
  const preview = await admin(
    "/api/admin/packs?kind=theme",
    form(themeZip(tiny), state),
  );
  assert.equal(preview.data.needsDecision, true);
  assert.equal(preview.data.placement.kept, 1);
  assert.equal(preview.data.placement.excluded.length, baseline.length - 1);
  assert.equal(files.size, beforeFiles);
  assert.equal(
    (await admin("/api/admin/packs")).data.themeRevision,
    state.themeRevision,
  );
  const approved = form(themeZip(tiny), state);
  approved.set("dropOverflow", "true");
  const result = await admin("/api/admin/packs?kind=theme", approved);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.placement.excluded.length, baseline.length - 1);
  assert.equal((await admin("/api/admin/packs")).data.challengeCount, 1);
  assert.equal(
    (await admin("/api/admin/packs?kind=theme", approved)).status,
    400,
  );
  sqlite.close();
});

test("content imports repair duplicate, outside-grid, unknown-map and blocked placements", async () => {
  const { sqlite, config, client } = setup(),
    admin = client();
  await admin("/api/auth", {
    mode: "login",
    username: "teacher",
    password: "teacher-password",
    hero: "web",
  });
  const state = (await admin("/api/admin/packs")).data;
  const questions = [
    content[0],
    ...[
      { x: 19, y: 20 },
      { x: -40, y: 100 },
      { x: 21, y: 12 },
    ].map((location, i) => ({ ...content[0], id: `question-${i}`, location })),
    { ...content[0], id: "unknown", map: "missing" },
  ];
  const result = await admin(
    "/api/admin/packs?kind=theme",
    form(themeZip(custom(config)), state, contentZip(questions)),
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.placement.moved.length, 4);
  const exported = await admin("/api/admin/packs?kind=content");
  const saved = parse(
    strFromU8(unzipSync(exported.bytes)["content.yaml"]),
  ).challenges;
  assert.deepEqual(saved[0].location, content[0].location);
  assert.equal(
    new Set(saved.map((c) => `${c.map}:${c.location.x},${c.location.y}`)).size,
    5,
  );
  const world = createWorld(custom(config).world);
  assert.ok(
    saved.every((c) =>
      world.canPlaceChallenge(c.map, c.location.x, c.location.y),
    ),
  );
  assert.deepEqual(saved[1].flags, content[0].flags);
  sqlite.close();
});

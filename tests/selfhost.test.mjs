import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { parseGame, publicConfig } from "../lib/config-schema.mjs";
const config = `characters:
  - id: custom-hero
    name: Custom Hero
    sprite: /sprites/custom.png
    fallback: shield
  - id: snow-knight
    name: Snow Knight
    fallback: thunder
accounts:
  allowRegistration: false
  users:
    - username: student01
      password: configured-password
    - username: assigned01
      password: assigned-password
      hero: snow-knight
audio:
  midi: /audio/north-pole.mid
  loop: true
  volume: 0.2
`;
async function port() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function start(dir, p) {
  const process = spawn("node", ["server/selfhost.mjs"], {
    env: {
      ...globalThis.process.env,
      HOST: "127.0.0.1",
      PORT: String(p),
      GAME_CONFIG: resolve(dir, "game.yaml"),
      DATABASE_PATH: resolve(dir, "quest.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  process.stderr.on("data", (d) => (logs += d));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.kill();
      reject(Error("Server startup timeout " + logs));
    }, 10000);
    process.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.on("exit", (code) => {
      clearTimeout(timeout);
      reject(Error("Server exited " + code + " " + logs));
    });
  });
  return process;
}
async function stop(proc) {
  await new Promise((resolve) => {
    proc.once("exit", resolve);
    proc.kill("SIGTERM");
  });
}
test("schema protects credentials and validates roster", () => {
  const parsed = parseGame(config);
  const safe = publicConfig(parsed);
  assert.equal(safe.characters[0].name, "Custom Hero");
  assert.equal(safe.characters[0].sprite, "/sprites/custom.png");
  assert.equal(safe.audio.midi, "/audio/north-pole.mid");
  assert.ok(!JSON.stringify(safe).includes("configured-password"));
  assert.ok(!("accounts" in safe));
  assert.throws(() =>
    parseGame(config.replace("hero: snow-knight", "hero: missing")),
  );
  assert.throws(() =>
    parseGame(config.replace("/sprites/custom.png", "/../secret.png")),
  );
});
test("standalone server: YAML accounts, sprite/music config, persistence and protected files", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "north-pole-test-"));
  writeFileSync(resolve(dir, "game.yaml"), config);
  const p = await port(),
    base = `http://127.0.0.1:${p}`;
  let server = await start(dir, p),
    cookie = "";
  const call = async (
    path,
    body,
    method = body ? "POST" : "GET",
    origin = base,
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const c = r.headers.get("set-cookie");
    if (c) cookie = c.split(";")[0];
    const text = await r.text();
    return {
      status: r.status,
      headers: r.headers,
      data: r.headers.get("content-type")?.includes("json")
        ? JSON.parse(text)
        : text,
    };
  };
  try {
    assert.equal((await call("/")).status, 200);
    // Deep links and reloads must serve the app shell as well as navigation from /admin.
    for (const route of ["/admin/theme/maps", "/admin/theme/library", "/admin/challenges/import", "/admin/teams/players", "/admin/teams/scoreboard"]) {
      for (const suffix of ["", "/", "?map=castle"]) {
        const page = await call(route + suffix);
        assert.equal(page.status, 200, route + suffix);
        assert.match(page.headers.get("content-type"), /text\/html/);
        assert.match(page.data, /id="root"/);
      }
    }
    let r = await call("/api/config");
    assert.equal(r.data.characters[0].id, "custom-hero");
    assert.ok(!JSON.stringify(r.data).includes("password"));
    assert.ok(!JSON.stringify(r.data).includes("student01"));
    for (const path of [
      "/content/game.yaml",
      "/content/challenges.yaml",
      "/data/quest.sqlite",
      "/server/selfhost.mjs",
      "/package.json",
      "/%2e%2e/content/game.yaml",
    ])
      assert.equal((await call(path)).status, 404, path);
    assert.equal(
      (await call("/audio/north-pole.mid")).headers.get("content-type"),
      "audio/midi",
    );
    assert.equal((await call("/api/game")).status, 401);
    assert.equal(
      (
        await call("/api/auth", {
          username: "student01",
          password: "configured-password",
          hero: "custom-hero",
          mode: "register",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          "/api/auth",
          {
            username: "student01",
            password: "configured-password",
            hero: "custom-hero",
            mode: "login",
          },
          "POST",
          "https://evil.invalid",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/auth", {
          username: "student01",
          password: "wrong-password",
          hero: "custom-hero",
          mode: "login",
        })
      ).status,
      401,
    );
    r = await call("/api/auth", {
      username: "Student01",
      password: "configured-password",
      hero: "custom-hero",
      mode: "login",
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.hero, "custom-hero");
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    r = await call("/api/game");
    assert.ok(r.data.challenges.every((c) => !("answers" in c)));
    assert.equal(
      (await call("/api/game", { id: "lantern", answer: "incorrect" })).data
        .correct,
      false,
    );
    await call("/api/game", { id: "lantern", answer: "24" });
    await call("/api/game", { id: "lantern", answer: "24" });
    assert.equal((await call("/api/game")).data.score, 100);
    await stop(server);
    server = await start(dir, p);
    assert.equal((await call("/api/auth")).data.user.hero, "custom-hero");
    assert.equal((await call("/api/game")).data.score, 100);
    await call("/api/auth", undefined, "DELETE");
    r = await call("/api/auth", {
      username: "student01",
      password: "configured-password",
      hero: "snow-knight",
      mode: "login",
    });
    assert.equal(r.data.user.hero, "custom-hero");
    await call("/api/auth", undefined, "DELETE");
    r = await call("/api/auth", {
      username: "assigned01",
      password: "assigned-password",
      hero: "custom-hero",
      mode: "login",
    });
    assert.equal(r.data.user.hero, "snow-knight");
    await stop(server);
    writeFileSync(
      resolve(dir, "game.yaml"),
      config.replace("configured-password", "changed-password"),
    );
    server = await start(dir, p);
    cookie = "";
    assert.equal(
      (
        await call("/api/auth", {
          username: "student01",
          password: "configured-password",
          hero: "custom-hero",
          mode: "login",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/api/auth", {
          username: "student01",
          password: "changed-password",
          hero: "custom-hero",
          mode: "login",
        })
      ).status,
      200,
    );
  } finally {
    await stop(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

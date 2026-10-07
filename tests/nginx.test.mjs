// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const script = resolve("nginx/15-ensure-certificates.sh");
function run(dir, origin = "https://ctf.example.org") {
  return spawnSync("sh", [script], {
    env: { ...process.env, SSL_DIR: dir, PUBLIC_ORIGIN: origin },
    encoding: "utf8",
  });
}
test("HTTPS bootstrap creates a hostname certificate, keeps the private key private, and reuses an existing pair", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctf-rpg-tls-"));
  try {
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    const cert = readFileSync(join(dir, "fullchain.pem")),
      key = readFileSync(join(dir, "privkey.pem"));
    assert.equal(statSync(join(dir, "privkey.pem")).mode & 0o777, 0o600);
    const inspect = spawnSync(
      "openssl",
      [
        "x509",
        "-in",
        join(dir, "fullchain.pem"),
        "-noout",
        "-ext",
        "subjectAltName",
      ],
      { encoding: "utf8" },
    );
    assert.equal(inspect.status, 0);
    assert.match(inspect.stdout, /DNS:ctf.example.org/);
    assert.equal(run(dir).status, 0);
    assert.deepEqual(readFileSync(join(dir, "fullchain.pem")), cert);
    assert.deepEqual(readFileSync(join(dir, "privkey.pem")), key);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("HTTPS bootstrap never overwrites a partial or empty certificate pair", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctf-rpg-tls-"));
  try {
    writeFileSync(join(dir, "fullchain.pem"), "keep-this-certificate");
    assert.equal(run(dir).status, 1);
    assert.equal(
      readFileSync(join(dir, "fullchain.pem"), "utf8"),
      "keep-this-certificate",
    );
    assert.equal(existsSync(join(dir, "privkey.pem")), false);
    writeFileSync(join(dir, "fullchain.pem"), "");
    assert.equal(run(dir).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

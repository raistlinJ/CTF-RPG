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

test("HTTPS Compose works alone and with the base file while inheriting the app build and persistent volume", t => {
  const available=spawnSync("docker",["compose","version","--short"],{encoding:"utf8"});
  if (available.status!==0) { t.skip("Docker Compose CLI is unavailable"); return; }
  const env={...process.env,APP_BIND:"127.0.0.1",APP_PORT:"39000",HTTP_PORT:"39080",HTTPS_PORT:"39443",PUBLIC_ORIGIN:"https://ctf.example.test:39443",GAME_CONFIG:"/app/content/test-config.yaml",SECURE_COOKIES:"false"};
  const models=[];
  for(const files of [["compose.https.yaml"],["compose.yaml","compose.https.yaml"]]) {
    const r=spawnSync("docker",["compose","--env-file","/dev/null","--project-name","ctf-rpg-compose-test",...files.flatMap(file=>["-f",file]),"config","--format","json"],{env,encoding:"utf8"});
    assert.equal(r.status,0,r.stderr);const model=JSON.parse(r.stdout);models.push(model);
    const app=model.services['ctf-rpg'],proxy=model.services.nginx;
    assert.equal(app.image,'ctf-rpg:local');assert.equal(app.build.context,resolve('.'));
    assert.equal(app.environment.GAME_CONFIG,env.GAME_CONFIG);
    assert.equal(app.environment.PUBLIC_ORIGIN,env.PUBLIC_ORIGIN);assert.equal(app.environment.SECURE_COOKIES,'true');
    assert.equal(app.ports[0].host_ip,'127.0.0.1');assert.equal(String(app.ports[0].published),'39000');
    assert.equal(app.volumes.find(v=>v.target==='/app/data').source,'quest-data');
    for(const target of ['/app/content','/app/public'])assert.equal(app.volumes.find(v=>v.target===target).read_only,true);
    assert.ok(app.healthcheck.test.includes('node'));
    assert.equal(proxy.build.context,resolve('nginx'));
    assert.equal(proxy.depends_on['ctf-rpg'].condition,'service_healthy');
    assert.equal(proxy.environment.PUBLIC_ORIGIN,env.PUBLIC_ORIGIN);
    assert.equal(proxy.volumes.find(v=>v.target==='/etc/nginx/ssl').source,resolve('nginx/ssl'));
    assert.ok(model.volumes['quest-data']);
  }
  assert.deepEqual(models[0].services,models[1].services);
  assert.deepEqual(models[0].volumes,models[1].volumes,'both invocations use the same data volume');
});

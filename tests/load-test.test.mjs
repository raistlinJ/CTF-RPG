import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

test('load runner exercises an isolated HTTP server, reports metrics, and never opens configured production storage',()=>{
 const folder=mkdtempSync(resolve(tmpdir(),'ctf-load-runner-'));try{
  const database=resolve(folder,'do-not-touch.sqlite'),report=resolve(folder,'report.json');writeFileSync(database,'preserve this existing file');
  const result=spawnSync(process.execPath,['scripts/load-test.mjs','--users=2','--duration=2','--messages=20','--catalog=content/challenges.yaml','--media-ratio=1','--login-burst=2','--login-concurrency=2','--search=message','--db-mode=worker','--out='+report],{encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_PATH:database,ASSET_PATH:folder,PUBLIC_ORIGIN:'https://production.invalid',SECURE_COOKIES:'true'}});
  assert.equal(result.status,0,result.stderr+result.stdout);assert.equal(readFileSync(database,'utf8'),'preserve this existing file');
  const data=JSON.parse(readFileSync(report,'utf8'));assert.equal(data.dataset.messages,20);assert.equal(data.phases.length,1);assert.equal(data.phases[0].errors,0);assert.ok(data.phases[0].requests>0);assert.ok(data.phases[0].server.cpuPercent>=0);assert.ok(data.phases[0].server.rssMiB>0);assert.match(data.scope,/pre-authenticated/);assert.equal(data.loginBurst.errors,0);assert.equal(data.loginBurst.users,2);assert.ok(data.dataset.challenges>1);assert.ok(data.phases[0].downloadedBytes>0);assert.equal(data.phases[0].mediaRatio,1);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

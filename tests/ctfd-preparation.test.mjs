// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {prepareCtfdArchive,CTFD_PREPARATION_FILE} from '../lib/ctfd-prepare.mjs';
import {readCtfdImportResponse} from '../lib/ctfd-import-response.mjs';
const db=(name,rows)=>['db/'+name+'.json',strToU8(JSON.stringify({results:rows}))];
const metadata=()=>Object.fromEntries([
 db('challenges',[{id:1,name:'Large backup challenge',description:'Find the answer',value:100,type:'standard',state:'visible'}]),
 db('flags',[{id:1,challenge_id:1,type:'static',content:'answer'}]),db('users',[{id:1,name:'student',type:'user'}]),db('teams',[]),
 db('files',[{id:1,challenge_id:1,location:'small/note.txt'}]),
 ['uploads/small/note.txt',strToU8('useful attachment')],
]);
test('a 248 MB source ZIP becomes a small deterministic upload while preserving challenges, flags, accounts and referenced files',()=>{
 const bytes=zipSync({...metadata(),'uploads/unused-large.bin':new Uint8Array(248*1024*1024),'db/solves.json':strToU8('[{"historical":"ignored"}]')},{level:0});
 assert.ok(bytes.length>248*1024*1024);
 const packed=prepareCtfdArchive(bytes),entries=unzipSync(packed);
 assert.ok(packed.length<64*1024);assert.equal(entries['uploads/unused-large.bin'],undefined);assert.equal(entries['db/solves.json'],undefined);
 for(const name of ['challenges','flags','users','teams','files'])assert.ok(entries['db/'+name+'.json']);
 assert.equal(strFromU8(entries['uploads/small/note.txt']),'useful attachment');
 assert.deepEqual(JSON.parse(strFromU8(entries[CTFD_PREPARATION_FILE])).ignoredTables,['solves']);
 assert.deepEqual(prepareCtfdArchive(bytes),packed,'preview and retries use stable import identity');
});
test('preparation omits oversized attachments and rejects unsafe paths, oversized metadata and missing challenge tables',()=>{
 const entries=metadata();entries['db/files.json']=strToU8(JSON.stringify([{id:1,challenge_id:1,location:'large/file.bin'}]));entries['uploads/large/file.bin']=new Uint8Array(33*1024*1024);
 const packed=prepareCtfdArchive(zipSync(entries)),unzipped=unzipSync(packed),manifest=JSON.parse(strFromU8(unzipped[CTFD_PREPARATION_FILE]));
 assert.equal(unzipped['uploads/large/file.bin'],undefined);assert.match(manifest.omittedFiles[0].reason,/4 MB/);
 assert.throws(()=>prepareCtfdArchive(zipSync({'../db/challenges.json':strToU8('[]')})),/Unsafe/);
 assert.throws(()=>prepareCtfdArchive(zipSync({'db/challenges.json':new Uint8Array(17*1024*1024)})),/16 MB/);
 assert.throws(()=>prepareCtfdArchive(zipSync({'db/users.json':strToU8('[]')})),/Missing CTFd table/);
});
const report={challenges:[],users:[],teams:[],warnings:[],excluded:[],currentMax:4,requiredMax:4,fingerprint:'unchanged',themeRevision:0,contentRevision:0};
test('import response handling explains empty/HTML upload and timeout errors without leaking response bodies',async()=>{
 for(const body of [null,'<html>proxy details SECRET</html>'])await assert.rejects(()=>readCtfdImportResponse(new Response(body,{status:413})),e=>/too large/.test(e.message)&&/512 MB/.test(e.message)&&!e.message.includes('SECRET'));
 await assert.rejects(()=>readCtfdImportResponse(new Response(null,{status:504}),true),/may have completed/);
 await assert.rejects(()=>readCtfdImportResponse(new Response('',{status:200})),/empty or non-JSON/);
 await assert.rejects(()=>readCtfdImportResponse(new Response('{"report":{}}',{status:200})),/incomplete result/);
 await assert.rejects(()=>readCtfdImportResponse(Response.json({error:'Review omitted attachments.'},{status:400})),/Review omitted attachments/);
 const result=await readCtfdImportResponse(Response.json({preview:true,report}));assert.deepEqual(result.report,report);
 const broken=new ReadableStream({start(controller){controller.error(Error('disconnected'));}});
 await assert.rejects(()=>readCtfdImportResponse(new Response(broken),true),/connection ended.*may have completed/);
});

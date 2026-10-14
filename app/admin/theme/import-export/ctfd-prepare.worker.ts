// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {prepareCtfdArchive} from '@/lib/ctfd-prepare.mjs';
const scope=globalThis as unknown as {onmessage:(event:MessageEvent<File>)=>void;postMessage:(data:unknown,transfer?:ArrayBuffer[])=>void};
scope.onmessage=async({data:file})=>{
 try{const bytes=prepareCtfdArchive(new Uint8Array(await file.arrayBuffer()));scope.postMessage({bytes:bytes.buffer},[bytes.buffer as ArrayBuffer]);}
 catch(e){scope.postMessage({error:(e as Error).message||'The large CTFd export could not be prepared.'});}
};

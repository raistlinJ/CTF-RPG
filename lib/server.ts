import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
export const db=()=> (env as unknown as {DB:D1Database}).DB;
export async function user(){const token=(await cookies()).get('quest_session')?.value;if(!token)return null;return db().prepare('SELECT students.id,username,hero FROM sessions JOIN students ON students.id=sessions.user WHERE token=? AND expires>?').bind(token,Date.now()).first<{id:string;username:string;hero:string}>();}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function sameOrigin(req:Request){return req.headers.get('origin')===new URL(req.url).origin;}

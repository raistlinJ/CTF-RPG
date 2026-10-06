import { parse } from 'yaml';
import raw from '../content/challenges.yaml?raw';
import { z } from 'zod';
const entry=z.object({id:z.string().regex(/^[a-z0-9-]+$/),object:z.string().min(1),location:z.object({x:z.number().int().min(0).max(39),y:z.number().int().min(0).max(27)}),region:z.string(),prompt:z.string().min(1),answers:z.array(z.string().min(1)).min(1),points:z.number().int().positive().max(10000),hint:z.string()});
export const challenges=z.object({challenges:z.array(entry).max(100)}).parse(parse(raw)).challenges;
if(new Set(challenges.map(c=>c.id)).size!==challenges.length) throw new Error('Duplicate challenge ids');
if(new Set(challenges.map(c=>`${c.location.x},${c.location.y}`)).size!==challenges.length) throw new Error('Duplicate challenge locations');
export const normalize=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');

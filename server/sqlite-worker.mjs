import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {initializeSchema,createSQLiteAdapter} from './sqlite.mjs';
const sqlite=new DatabaseSync(workerData.path);
initializeSchema(sqlite);
const db=createSQLiteAdapter(sqlite);
parentPort.postMessage({ready:true,capabilities:db.capabilities});
parentPort.on('message', async ({id,action,sql,args,statements}) => {
  try {
    let value;
    if(action==='close') {sqlite.close();parentPort.postMessage({id,value:null});parentPort.close();return;}
    if(action==='batch') value=await db.batch(statements.map(item=>db.prepare(item.sql).bind(...item.args)));
    else if(['first','all','run'].includes(action)) value=await db.prepare(sql).bind(...args)[action]();
    else throw Error('Unknown database operation.');
    parentPort.postMessage({id,value});
  } catch(error) {parentPort.postMessage({id,error:{message:error.message,code:error.code}});}
});

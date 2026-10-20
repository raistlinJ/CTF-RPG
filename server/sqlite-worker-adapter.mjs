import {Worker} from 'node:worker_threads';
// One persistent connection owns all statements and whole batch transactions.
// This is opt-in until host-specific benchmarks justify its IPC overhead.
export async function createWorkerSQLiteAdapter(path) {
  const worker=new Worker(new URL('./sqlite-worker.mjs',import.meta.url),{workerData:{path},execArgv:[]});
  const pending=new Map();let next=0,closing=false,failed;
  const fail=error=>{failed=error;for(const item of pending.values())item.reject(error);pending.clear();};
  worker.on('error',fail);
  worker.on('exit',code=>fail(Error(`Database worker exited (${code}).`)));
  const capabilities=await new Promise((resolve,reject)=>{
    worker.once('error',reject);worker.once('exit',code=>reject(Error(`Database worker exited during startup (${code}).`)));
    worker.once('message',message=>message.ready?resolve(message.capabilities):reject(Error('Database worker failed to initialize.')));
  });
  worker.on('message',message=>{
    const item=pending.get(message.id);if(!item)return;pending.delete(message.id);
    if(message.error)item.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else item.resolve(message.value);
  });
  function call(action,data={}) {
    if(failed)return Promise.reject(failed);
    if(closing)return Promise.reject(Error('Database worker is closing.'));
    if(pending.size>=10000)return Promise.reject(Error('Database worker is busy.'));
    return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,action,...data});});
  }
  const owner=Symbol('connection');
  return {capabilities,
    prepare(sql){return {bind(...args){return {
      owner,sql,args,
      first:()=>call('first',{sql,args}),all:()=>call('all',{sql,args}),run:()=>call('run',{sql,args}),
    };}};},
    batch(statements){
      if(statements.some(item=>item.owner!==owner))return Promise.reject(Error('Batch belongs to a different connection.'));
      return call('batch',{statements:statements.map(({sql,args})=>({sql,args}))});
    },
    async close(){if(closing)return;const result=call('close');closing=true;await result;await worker.terminate();},
  };
}

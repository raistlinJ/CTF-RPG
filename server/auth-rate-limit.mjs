// A classroom may share one public/proxy IP. Keep individual account protection
// separate from the larger shared-network budget. Ignore forwarded headers.
export function createAuthRateLimiter({clock=Date.now,ipLimit=500,accountLimit=20,maxEntries=10000}={}) {
  const addresses=new Map(),accounts=new Map();
  function limited(entries,key,limit) {
    const now=clock(),entry=entries.get(key);
    if(entry&&entry.until>now)return ++entry.count>limit;
    if(entries.size>=maxEntries){
      for(const [id,value] of entries)if(value.until<=now)entries.delete(id);
      if(entries.size>=maxEntries)entries.delete(entries.keys().next().value);
    }
    entries.set(key,{count:1,until:now+60000});return false;
  }
  return {
    address:ip=>limited(addresses,ip,ipLimit),
    account(ip,username) {
      if(typeof username!=='string'||!/^[a-zA-Z0-9_-]{3,24}$/.test(username))return false;
      return limited(accounts,JSON.stringify([ip,username.toLowerCase()]),accountLimit);
    },
  };
}

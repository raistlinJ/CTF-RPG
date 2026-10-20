// Loaded only by the isolated load-test child process, never normal startup.
import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
const lag=monitorEventLoopDelay({resolution:10});lag.enable();
let cpu=process.cpuUsage(), started=performance.now(), utilization=performance.eventLoopUtilization();
process.on('message',message=>{
  if(message?.type!=='load-metrics')return;
  const elapsed=performance.now()-started, usage=process.cpuUsage(cpu), active=performance.eventLoopUtilization(utilization);
  process.send?.({type:'load-metrics',id:message.id,cpuPercent:100*(usage.user+usage.system)/(elapsed*1000),eventLoopUtilization:active.utilization,eventLoopP95Ms:lag.percentile(95)/1e6,eventLoopMaxMs:lag.max/1e6,rssMiB:process.memoryUsage().rss/1048576});
  cpu=process.cpuUsage();started=performance.now();utilization=performance.eventLoopUtilization();lag.reset();
});

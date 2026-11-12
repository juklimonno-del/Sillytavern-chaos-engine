'use strict';
const {performance}=require('node:perf_hooks');const {boot,assistant,user}=require('../tests/harness.cjs');
const text='Bonnie arranged the porcelain dishes beside the open kitchen window. A small brass key lay under a folded receipt. "Bring the green cup," she said, moving the chair. ';
const messages=Array.from({length:120},(_,i)=>(i%2?assistant:user)(text.repeat(12)+' Entry '+i+'.'));
const b=boot({autopilotEnabled:true,customKeywords:'velvet, coffee',contextScope:'full'},messages);
function measure(){const start=performance.now();const p=b.api.packet(b.context,true);return {ms:performance.now()-start,words:p.words,chars:p.prompt.length};}
const before={...b.api.counters},cold=measure(),afterCold={...b.api.counters};
const warm=[];for(let i=0;i<20;i++)warm.push(measure());const afterWarm={...b.api.counters};
b.context.chat.push(user('I lift the green teacup.'));const append=measure(),afterAppend={...b.api.counters};
const middle=values=>{const s=values.slice().sort((a,b)=>a-b);return(s[9]+s[10])/2;};
console.log(JSON.stringify({scope:'Synthetic Node-only measurement of 1.8.3, not a comparison to 1.7.0 or phone/Gemini latency.',node:process.version,messages:120,rawCharacters:messages.reduce((n,m)=>n+m.mes.length,0),cold,warm:{medianMs:middle(warm.map(x=>x.ms)),maxMs:Math.max(...warm.map(x=>x.ms)),minWords:Math.min(...warm.map(x=>x.words)),maxWords:Math.max(...warm.map(x=>x.words))},append,counters:{coldNewRecords:afterCold.records-before.records,warmNewRecords:afterWarm.records-afterCold.records,warmNewTokenizations:afterWarm.tokenizations-afterCold.tokenizations,appendNewRecords:afterAppend.records-afterWarm.records}},null,2));

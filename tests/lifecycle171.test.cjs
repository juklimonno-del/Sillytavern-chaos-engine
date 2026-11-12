const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,attachReply,finish,complete,assistant:a,user:u}=require('./harness.cjs');

test('automatic mode installs one combined depth-zero user prompt',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await prepare(b);assert.equal(b.injections.length,1);
    assert.equal(b.injections[0][2],1);assert.equal(b.injections[0][3],0);assert.equal(b.injections[0][5],1);
    assert.equal(b.tools.length,0);
});
test('system-role override is preserved',async()=>{const b=boot({role:'system'});await prepare(b);assert.equal(b.injections[0][5],0);});
test('legacy tool calls retain recency without treating previews or tool output as completed replies',async()=>{
    const b=boot({mode:'tool',intensity:0,structureEnabled:true,feedbackObserverEnabled:true,feedbackBalancerEnabled:true});
    const s=b.api.settings(b.context),key=b.api.key(b.context);
    s.categoryWeights=Object.fromEntries(Object.keys(b.api.categories).map(id=>[id,id==='direction'?3:0]));
    const history=()=>JSON.stringify({cues:b.api.cueHistory.get(key)||[],structures:b.api.structureHistory.get(key)||[]});
    const empty=history();b.api.packet(b.context,true);assert.equal(history(),empty);
    assert.equal(b.api.receipt(b.context),null);assert.equal(b.tools.length,1);
    const first=JSON.parse(await b.tools[0].action());
    assert.equal((b.api.cueHistory.get(key)||[]).length,1);assert.equal((b.api.structureHistory.get(key)||[]).length,1);
    const selected=history();b.api.packet(b.context,true);assert.equal(history(),selected);
    const second=JSON.parse(await b.tools[0].action());
    assert.notEqual(second.layers[0].instruction,first.layers[0].instruction);
    assert.equal(b.api.cueHistory.get(key).length,2);assert.equal(b.api.structureHistory.get(key).length,2);
    assert.equal(b.api.receipt(b.context).state,'legacy');assert.equal(b.api.run(),null);
    assert.equal(b.api.state(b.context).pending,null);assert.equal(b.api.state(b.context).outcomes.length,0);
    assert.equal(b.context.chatMetadata.storyChaosEngineLearning,undefined);assert.equal(b.notices.length,0);
});
for(const type of ['quiet','continue','impersonate'])test(type+' requests do not receive Chaos instructions',async()=>{
    const b=boot({autopilotEnabled:true});await prepare(b,type);assert.equal(b.injections.at(-1)[1],'');
});
test('only installing guidance does not produce a completed receipt',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);assert.equal(run.state,'prepared');assert.equal(b.notices.length,0);
});
test('rendering alone cannot verify completion',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);b.events.emit('CHARACTER_MESSAGE_RENDERED',1,'normal');b.api.finish();
    assert.notEqual(run.state,'completed');assert.equal(b.notices.length,0);
});
test('a successful stream can end before its rendered-message event',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await prepare(b);attachReply(b,run);
    finish(b,run,['GENERATION_ENDED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED']);assert.equal(run.state,'completed');assert.equal(b.notices.length,1);
});
test('a successful stream can render before the ended event',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);finish(b,run);assert.equal(run.state,'completed');
});
test('a non-streaming request requires matching prompt and generation timestamps',async()=>{
    const b=boot({},[u('Go.')]);const run=await complete(b,'Bonnie moved a chair.',false);assert.equal(run.state,'completed');assert.equal(run.payloadSeen,true);
});
test('a rendered non-streaming message with no completion metadata remains unverified',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run,'Rendered text.',false);delete b.context.chat[1].gen_finished;
    finish(b,run);assert.equal(run.state,'unverified');assert.equal(b.notices.length,0);
});
test('a failed partial stream that emits the normal rendered event is not certified',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await prepare(b);attachReply(b,run,'An unfinished fragment');
    b.context.streamingProcessor.isStopped=true;b.context.streamingProcessor.abortController.signal.aborted=true;
    finish(b,run,['GENERATION_ENDED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED']);assert.equal(run.state,'failed');
    assert.equal(b.notices.length,0);assert.equal(b.api.state(b.context).outcomes.length,0);
});
test('stop before rendering remains stopped rather than becoming successful',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run,'A partial response.');b.events.emit('GENERATION_STOPPED');
    finish(b,run);assert.equal(run.state,'stopped');assert.equal(b.notices.length,0);
});
test('render-then-stop in the same task never emits a verified-completion toast',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);
    b.events.emit('MESSAGE_RECEIVED',1,'normal');b.events.emit('CHARACTER_MESSAGE_RENDERED',1,'normal');b.events.emit('GENERATION_ENDED');b.events.emit('GENERATION_STOPPED');
    b.api.finish(run);assert.equal(run.state,'stopped');assert.equal(b.notices.length,0);
});
test('a late stop revokes an existing receipt, toast and learning association',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await complete(b);assert.equal(run.state,'completed');
    b.events.emit('GENERATION_STOPPED');assert.equal(run.state,'stopped');assert.equal(b.cleared.length,1);assert.equal(b.api.state(b.context).outcomes.length,0);
});
test('unchanged old swipe text cannot satisfy a new generation receipt',async()=>{
    const old={...a('The unchanged old reply.'),swipe_id:0,gen_started:new Date(100),gen_finished:new Date(200)};
    const b=boot({},[u('Go.'),old]);const run=await prepare(b,'swipe');
    b.context.streamingProcessor={messageId:1,isFinished:true,isStopped:false,abortController:{signal:{aborted:false}}};
    b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:true,messages:[{role:'user',content:run.prompt}]});finish(b,run);
    assert.equal(run.state,'unverified');assert.equal(b.notices.length,0);
});
test('rendering another message index does not complete the pending generation',async()=>{
    const b=boot({},[a('Earlier.'),u('Go.')]);const run=await prepare(b);attachReply(b,run);b.events.emit('MESSAGE_RECEIVED',0,'normal');b.events.emit('CHARACTER_MESSAGE_RENDERED',0,'normal');b.events.emit('GENERATION_ENDED');b.api.finish();
    assert.equal(run.state,'unverified');
});
test('first-message and impersonation events cannot certify a normal reply',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);
    for(const type of ['first_message','impersonate']){b.events.emit('MESSAGE_RECEIVED',1,type);b.events.emit('CHARACTER_MESSAGE_RENDERED',1,type);}
    b.events.emit('GENERATION_ENDED');b.api.finish();assert.equal(run.state,'unverified');
});
test('stale generation timestamp cannot be certified as a new non-streaming reply',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run,'Old metadata',false);
    b.context.chat[1].gen_started=new Date(10);b.context.chat[1].gen_finished=new Date(20);finish(b,run);assert.equal(run.state,'unverified');
});
test('an old processor is not proof of a new request finishing',async()=>{
    const b=boot({},[u('Go.')]);b.context.streamingProcessor={messageId:1,isFinished:true,isStopped:false,abortController:{signal:{aborted:false}}};
    const run=await prepare(b);b.context.chat.push({...a('New text'),gen_started:new Date(),gen_finished:new Date()});finish(b,run);assert.equal(run.state,'unverified');
});
test('a processor belonging to another message does not verify this request',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);b.context.streamingProcessor.messageId=88;finish(b,run);assert.notEqual(run.state,'completed');
});
test('request abort signals invalidate otherwise complete-looking response events',async()=>{
    const b=boot({},[u('Go.')]),controller=new AbortController();b.events.emit('GENERATION_STARTED','normal',{signal:controller.signal},false);
    const run=await prepare(b,'normal',false);attachReply(b,run);controller.abort();finish(b,run);assert.equal(run.state,'stopped');assert.equal(b.notices.length,0);
});
test('failed requests with no response terminate as unverified rather than staying preparing',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.events.emit('GENERATION_ENDED');b.api.finish();assert.equal(run.state,'unverified');
});
test('fresh generation ids prevent stale prior payloads from verifying current guidance',async()=>{
    const b=boot({},[u('Go.')]);const old=await prepare(b),oldPrompt=old.prompt;const run=await prepare(b);
    assert.notEqual(run.id,old.id);b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:false,messages:[{content:oldPrompt}]});assert.equal(run.payloadSeen,false);
});
test('prompt inclusion requires actual message content rather than unrelated metadata',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:false,secret:run.prompt,messages:[{content:'Something else.'}]});assert.equal(run.payloadSeen,false);
});
test('multimodal text blocks are recognized without inspecting image URLs or auth data',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:true,messages:[{content:[{type:'text',text:run.prompt},{type:'image_url',image_url:{url:'hidden'}}]}]});assert.equal(run.payloadSeen,true);
});
test('later payload-stage removal overrides an earlier inclusion observation',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.events.emit('CHAT_COMPLETION_PROMPT_READY',{chat:[{content:run.prompt}]});assert.equal(run.payloadSeen,true);
    b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:true,messages:[{content:'Guidance omitted.'}]});assert.equal(run.payloadSeen,false);
});
test('dry-run payload events cannot change a live receipt',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.events.emit('CHAT_COMPLETION_PROMPT_READY',{chat:[{content:run.prompt}],dryRun:true});assert.equal(run.payloadSeen,false);
});
test('host completion and outgoing-prompt verification remain separate claims',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);attachReply(b,run);b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream:true,messages:[{content:'No injection'}]});finish(b,run);
    assert.equal(run.state,'completed');assert.equal(run.payloadSeen,false);assert.match(b.api.receiptText(run),/outgoing request unverified/);
});
test('duplicate received/rendered/ended events do not duplicate learning or notifications',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await complete(b);finish(b,run);finish(b,run);assert.equal(b.notices.length,1);assert.equal(b.api.state(b.context).outcomes.length,1);
});
test('notification preferences do not disable receipt collection',async()=>{
    const b=boot({notifyAfterReply:false},[u('Go.')]);const run=await complete(b);assert.equal(run.state,'completed');assert.equal(b.notices.length,0);
});
test('same-text genuinely regenerated swipe with new metadata can still be verified',async()=>{
    const b=boot({},[u('Go.'),{...a('Identical valid response.'),swipe_id:0,gen_started:new Date(1),gen_finished:new Date(2)}]);
    const run=await prepare(b,'swipe');attachReply(b,run,'Identical valid response.');finish(b,run);assert.equal(run.state,'completed');
});
test('regeneration after deletion can be reported by the host as swipe rendering',async()=>{
    const b=boot({},[u('Go.'),a('Old')]);b.events.emit('GENERATION_STARTED','regenerate',{},false);b.context.chat.pop();const run=await prepare(b,'regenerate',false);attachReply(b,run);
    b.events.emit('MESSAGE_RECEIVED',1,'swipe');b.events.emit('CHARACTER_MESSAGE_RENDERED',1,'swipe');b.events.emit('GENERATION_ENDED');b.api.finish();assert.equal(run.state,'completed');
});
test('an old completed receipt cannot be reused in another chat',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);b.context.chatId='other';b.events.emit('CHAT_CHANGED');b.context.chat=[u('Other chat'),a('Other reply')];
    b.events.emit('MESSAGE_RECEIVED',1,'normal');b.events.emit('CHARACTER_MESSAGE_RENDERED',1,'normal');b.events.emit('GENERATION_ENDED');b.api.finish();assert.notEqual(run.state,'completed');assert.equal(b.api.receipt(b.context),null);
});
test('editing or switching away from a verified swipe invalidates its receipt',async()=>{
    const b=boot({},[u('Go.')]);const run=await complete(b);b.context.chat[1].mes='Edited response.';b.events.emit('MESSAGE_EDITED',1);assert.equal(run.state,'invalidated');
});
test('a known failed partial message is excluded from future observation',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await prepare(b);const m=attachReply(b,run,'Only half the thought');
    b.context.streamingProcessor.abortController.signal.aborted=true;finish(b,run);b.context.streamingProcessor=null;
    assert.equal(b.api.eligible(m),false);assert.equal(b.api.observe(b.context).available,0);
});
test('an aborted swipe is rejected even when the host emits no rendered event',async()=>{
    const b=boot({},[u('Go.'),{...a('Old answer'),swipe_id:0,gen_started:new Date(1),gen_finished:new Date(2)}]);const run=await prepare(b,'swipe');const m=attachReply(b,run,'Partial new swipe');
    b.context.streamingProcessor.abortController.signal.aborted=true;b.context.streamingProcessor.isStopped=true;b.events.emit('GENERATION_ENDED');b.api.finish();b.context.streamingProcessor=null;assert.equal(b.api.eligible(m),false);
});
test('an in-progress streamed message is not available to the Observer',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);const m=attachReply(b,run,'Partial');b.context.streamingProcessor.isFinished=false;assert.equal(b.api.eligible(m),false);
});
test('prompt installation failure cannot block normal generation or certify success',async()=>{
    const b=boot({},[u('Go.')]);b.context.setExtensionPrompt=()=>{throw new Error('host rejected prompt');};await assert.doesNotReject(prepare(b));assert.equal(b.api.receipt(b.context).state,'failed');assert.equal(b.notices.length,0);
});
test('failure of a new request does not erase a previous verified learning outcome',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await complete(b);const count=b.api.state(b.context).outcomes.length;
    b.context.chat.push(u('Next.'));b.context.setExtensionPrompt=()=>{throw new Error('host rejected prompt');};await prepare(b);assert.equal(b.api.state(b.context).outcomes.length,count);
});
test('repeated initialization does not duplicate listeners',()=>{
    const b=boot();const n=[...b.handlers.values()].reduce((a,s)=>a+s.size,0);for(let i=0;i<10;i++)b.api.init();assert.equal([...b.handlers.values()].reduce((a,s)=>a+s.size,0),n);
});
test('disable lifecycle clears prompts, listeners, timers and bounded caches',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await prepare(b);b.api.dispose();assert.equal(b.injections.at(-1)[1],'');assert.equal([...b.handlers.values()].reduce((a,s)=>a+s.size,0),0);
    for(const cache of b.api.caches)assert.equal(cache.size,0);
});
test('disable then enable is idempotent and can prepare a fresh generation',async()=>{
    const b=boot({},[u('Go.')]);b.api.dispose();b.scope.storyChaosEngineLifecycle.enable();const run=await prepare(b);assert.equal(run.state,'prepared');
});
test('receipts retain selection data, not entire chat/context snapshots',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await prepare(b);assert.equal(run.packet.snapshot,undefined);assert.equal(run.packet.context,undefined);
});
test('low-level response analysis does not write hidden trackers into story messages',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await prepare(b);attachReply(b,run);const before=JSON.stringify(b.context.chat);finish(b,run);assert.equal(JSON.stringify(b.context.chat),before);
});

test('stopping a subsequent quiet request cannot revoke an earlier completed reply',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await complete(b);
    b.events.emit('GENERATION_STARTED','quiet',{},false);b.events.emit('GENERATION_STOPPED');
    assert.equal(run.state,'completed');assert.equal(b.api.state(b.context).outcomes.length,1);
});
test('unsupported generation start retires a still-pending run instead of borrowing its receipt',async()=>{
    const b=boot({},[u('Go.')]);const run=await prepare(b);
    b.events.emit('GENERATION_STARTED','continue',{},false);b.events.emit('GENERATION_ENDED');
    assert.equal(run.state,'unverified');assert.equal(b.api.run(),null);
});

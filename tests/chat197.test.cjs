'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const plain=x=>JSON.parse(JSON.stringify(x));
const {boot,prepare,assistant:a,user:u,texted}=require('./harness.cjs');

const PACKET='story_chaos_engine_auto',INDEX='story_chaos_engine_index';
const last=(b,id)=>b.injections.filter(x=>x[0]===id).at(-1);
// A chat as it is before anyone typed /dm: no engine entry in its metadata.
const fresh=(o={},chat=[...texted()],seed)=>{const b=boot({cadence:undefined,autopilotEnabled:true,...o},chat,seed);b.context.chatMetadata={};return b;};
function play(b,steps){for(let i=0;i<steps;i++){b.api.packet(b.context,false);b.context.chat.push(u('I wait.'),a('Bonnie answered.'));}}

test('a chat runs nothing until /dm on, but old trackers still leave the outgoing history',async()=>{
    const b=fresh({},[a('Nora waited.\n[sce_tracker]\nNora | mood: tense 3\n[/sce_tracker]'),u('Go.')]);
    for(let i=0;i<6;i++){
        const out=[...b.context.chat];b.events.emit('GENERATION_STARTED','normal',{},false);
        await b.scope.storyChaosEngineInterceptor(out,8192,()=>{},'normal');
        assert.equal(last(b,PACKET)[1],'');assert.equal(last(b,INDEX)[1],'');assert.equal(out[0].mes,'Nora waited.');
    }
    assert.equal(b.context.chatMetadata.storyChaosEngineDm,undefined,'an untouched chat file is not written to');
    const tool=fresh({mode:'tool'});assert.equal(await tool.tools[0].action(),'{}');
});

test('/dm on starts it for this chat only, /dm off stops it, and the choice is saved in the chat',async()=>{
    const b=fresh();let saves=0;b.context.saveMetadataDebounced=()=>{saves++;};
    const on=b.scope.sceDmCommand('on');
    assert.match(on,/^Story DM is on for this chat · heat 0\.0 \(cool\) · no directive yet\.$/);
    assert.equal(b.context.chatMetadata.storyChaosEngineDm.enabled,true);assert.ok(saves>=1);
    assert.match(b.notices.at(-1).args[0],/Story DM is on/);
    let sent=0;for(let i=0;i<24;i++){b.context.chat.push(u('Go.'));await prepare(b);if(/^(?:Event|Payoff|Linger|Form|Lens)/m.test(last(b,PACKET)[1]))sent++;b.context.chat.push(a('Bonnie answered.'));}
    assert.ok(sent>0&&sent<24);
    const other={...b.context,chatId:'other-chat',chatMetadata:{},chat:[...texted()]};b.setContext(other);
    assert.match(b.scope.sceDmCommand('status'),/^Story DM is off for this chat\. Use \/dm on to start it\.$/);
    b.setContext(b.context);
    assert.match(b.scope.sceDmCommand('off'),/^Story DM is off/);
    await prepare(b);assert.equal(last(b,PACKET)[1],'');
    assert.match(b.scope.sceDmCommand('sideways'),/^Usage:/);assert.match(b.scope.sceDmCommand(''),/^Story DM is off/);
});

test('status reports heat and the last directive, and names a globally disabled engine',()=>{
    const b=fresh({disruption:'max'});b.scope.sceDmCommand('on');
    play(b,60);const st=b.context.chatMetadata.storyChaosEngineDm;
    assert.ok(st.cadence.length>0);
    const text=b.scope.sceDmCommand('status');
    assert.match(text,/^Story DM is on for this chat · heat \d+\.\d \((?:cool|warm|hot: releasing)\) · last directive \d+ repl(?:y|ies) ago(?: · shape changes followed \d+\/\d+)?\.$/);
    b.api.settings(b.context).enabled=false;
    assert.match(b.scope.sceDmCommand('status'),/\(the engine itself is switched off\)/);
});

test('heat and cooldown live in the chat file and survive a reload',()=>{
    const b=fresh({disruption:'max'},undefined,4);b.scope.sceDmCommand('on');play(b,80);
    const saved=JSON.parse(JSON.stringify(b.context.chatMetadata)),chat=b.context.chat.map(m=>({...m}));
    const st=saved.storyChaosEngineDm;assert.ok(st.events.length>0&&st.cadence.length>0);
    const position=chat.filter(m=>!m.is_user&&!m.is_system).length;
    // A fresh engine instance (page reload) reading the same chat file.
    const reloaded=boot({cadence:undefined,autopilotEnabled:true,disruption:'max'},chat,4);reloaded.context.chatMetadata=saved;
    const before=b.scope.sceDmHeat(b.scope.sceDmState(b.context),position);
    assert.ok(Math.abs(reloaded.scope.sceDmHeat(reloaded.scope.sceDmState(reloaded.context),position)-before)<1e-9);
    if(Math.max(...st.cadence)===position-1)assert.equal(reloaded.api.packet(reloaded.context,false).quiet,true,'the cooldown carries over');
});

test('damaged chat state is cleaned instead of trusted',()=>{
    const b=fresh();b.context.chatMetadata.storyChaosEngineDm={enabled:'yes',cadence:[3,'x',null,2.5,7],events:[{pos:2,kind:'major',delta:99},{pos:'4',kind:'major'},{pos:5,kind:'apocalypse'},null]};
    const st=b.scope.sceDmState(b.context);
    assert.equal(st.enabled,false);assert.deepEqual(plain(st.cadence),[3,7]);assert.deepEqual(plain(st.events),[{pos:2,kind:'major',delta:2}]);
});

test('/dm registers through the slash command parser, with the older API as a fallback',()=>{
    const b=fresh();const added=[];
    const ctx={...b.context,SlashCommandParser:{addCommandObject(c){added.push(c);}},SlashCommand:{fromProps:p=>p},SlashCommandArgument:{fromProps:p=>p}};
    b.scope.sceRegisterCommand(ctx);b.scope.sceRegisterCommand(ctx);
    assert.equal(added.length,1,'registered once');assert.equal(added[0].name,'dm');
    assert.deepEqual(plain(added[0].unnamedArgumentList[0].enumList),['on','off','status']);
    b.setContext(b.context);assert.match(added[0].callback({},'on'),/^Story DM is on/);
    const old=fresh();const legacy=[];
    old.scope.sceRegisterCommand({...old.context,registerSlashCommand:(...args)=>legacy.push(args)});
    assert.equal(legacy.length,1);assert.equal(legacy[0][0],'dm');
});

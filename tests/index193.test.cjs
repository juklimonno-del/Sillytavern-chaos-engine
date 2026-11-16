'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot:bootRaw,prepare,assistant:a,user:u,texted}=require('./harness.cjs');

const ON={autonomyEnabled:true,autonomyDefault194:true};
const boot=(o={},...rest)=>bootRaw({...ON,...o},...rest);
const INDEX='story_chaos_engine_index',SPEC='story_chaos_engine_ledger',PACKET='story_chaos_engine_auto';
const last=(b,id)=>b.injections.filter(x=>x[0]===id).at(-1);
const line=(name,o={})=>name+' | mood: '+(o.mood??'brittle 3')+' | feels: suspicion → Kade | want: '+(o.want??'the ledger before dawn')+
    ' | desire: '+(o.desire??'leave owing nothing')+' | toward User: '+(o.toward??'wary -1')+' | thinks: '+(o.thinks??'He knows.');
const tracked=(text,...lines)=>a(text+'\n<sce_tracker>\n'+lines.join('\n')+'\n</sce_tracker>');

test('the label index rides in-prompt with the system role, ahead of the ledger format, identical every turn',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await prepare(b);
    const index=last(b,INDEX);
    assert.equal(index[2],0,'in-prompt position');assert.equal(index[3],0);assert.equal(index[4],false,'no world-info scan');assert.equal(index[5],0,'system role');
    assert.match(index[1],/^<scene_direction_index>\n[\s\S]*\n<\/scene_direction_index>$/);
    assert.ok([INDEX,SPEC].sort()[0]===INDEX,'SillyTavern joins in-prompt extension prompts in sorted key order');
    const first=index[1];
    for(let i=0;i<4;i++){await prepare(b);assert.equal(last(b,INDEX)[1],first,'identical every turn so it stays cached');}
    assert.doesNotMatch(first,/\{\{|\}\}/,'no macros for the host to substitute');
});

test('the index is cleared whenever no packet is sent',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await prepare(b);assert.notEqual(last(b,INDEX)[1],'');
    for(const type of ['quiet','impersonate']){await prepare(b,type);assert.equal(last(b,INDEX)[1],'',type);}
    const offContinue=boot({autopilotEnabled:true,autonomyEnabled:false});await prepare(offContinue,'continue');assert.equal(last(offContinue,INDEX)[1],'');
    const disabled=boot({enabled:false});await prepare(disabled);assert.equal(last(disabled,INDEX)[1],'');
    const tool=boot({mode:'tool'});await prepare(tool);assert.equal(last(tool,INDEX)[1],'');
});

test('continue with autonomy keeps the index for its State and Ledger lines',async()=>{
    const b=boot({autonomyEnabled:true},[tracked('Nora reached for the',line('Nora'))]);await prepare(b,'continue');
    assert.match(last(b,PACKET)[1],/^State \(Nora\):/m);assert.match(last(b,INDEX)[1],/^State \(name\):/m);
});

test('every label a packet can emit is defined in the index',async()=>{
    const heads=new Set();
    const collect=prompt=>{for(const row of prompt.split('\n')){
        if(/^<\/?scene_direction/.test(row)||!row.includes(':'))continue;
        heads.add(row.slice(0,row.indexOf(':')).replace(/\s*\(.*$/,'').trim());}};
    const chatOf=(...replies)=>replies.flatMap((r,i)=>i?[u('I wait.'),r]:[r]);
    const chats=[
        texted(),
        chatOf(...['-1','0','1','2'].map(n=>tracked('x',line('Nora',{want:'make User happy',toward:'warm '+n})))),
        chatOf(...['-1','0','1','2'].map(n=>tracked('x',line('Nora',{toward:'warm '+n}))),tracked('y',line('Nora',{toward:'warm 3',desire:'burn the docks'}))),
        chatOf(...Array.from({length:4},()=>tracked('x',line('Nora')))),
        Array.from({length:5},(_,i)=>a('Bonnie '+['crossed','paced','circled','stood by','left'][i]+' the room. She smiled softly and said nothing more.'))];
    const settings=[{autopilotEnabled:true,disruption:'max',intensity:100,maxLayers:5,customKeywords:'lantern, ledger'},
        {structureEnabled:true,endingWatchEnabled:true,endingWatchMinimum:2,disruption:'high'},{cuePalette:'everyday',autopilotEnabled:true}];
    for(const chat of chats)for(const opts of settings)for(const seed of [1,7,99]){
        const b=boot(opts,chat,seed);
        for(let i=0;i<10;i++)collect(b.api.packet(b.context,true).prompt);
        await prepare(b,'continue');collect(last(b,PACKET)[1]);
    }
    const b=boot({autopilotEnabled:true},[u('Go.')]);await prepare(b);const index=last(b,INDEX)[1];
    for(const head of ['Break','Form','Route','Phases','Attention','Transition','Lens','Close','State','Want','Stance','Desire','Stall','Drive','Ledger','Recurring close','Repeated closing wording'])assert.ok(heads.has(head),'fixture must exercise '+head);
    for(const head of heads)assert.match(index,new RegExp('^(?:[^:\\n]*[/] )?'+head.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: \\(name\\)| /|:)','m'),'index must define '+head);
});

test('with autonomy off the index drops its State, Want, Drive and Ledger entries and stays fixed',async()=>{
    const b=bootRaw({autopilotEnabled:true},[u('Go.')]);await prepare(b);
    const plain=last(b,INDEX)[1];
    assert.doesNotMatch(plain,/^(?:State|Want|Drive|Ledger)\b/m);
    assert.match(plain,/^Form:/m);assert.match(plain,/^Close:/m);assert.match(plain,/<\/scene_direction_index>$/);
    assert.equal(last(b,SPEC)[1],'','no ledger format either');
    await prepare(b);assert.equal(last(b,INDEX)[1],plain,'identical every turn');
    const on=boot({autopilotEnabled:true},[u('Go.')]);await prepare(on);
    assert.match(last(on,INDEX)[1],/^Ledger:/m);
});

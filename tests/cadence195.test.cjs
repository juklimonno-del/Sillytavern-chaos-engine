'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,assistant:a,user:u,texted}=require('./harness.cjs');

// The harness pins cadence to 'every' for the older suites; these tests use the shipped default.
const shipped=(o={},...rest)=>boot({cadence:undefined,...o},...rest);
// DM directives obey cadence; corrections (1.9.8) answer what the model wrote and run on their own trigger.
const DIRECTIVE=/^(?:Break|Event \(|Payoff|Linger|Form|Lens \():?/;
const CORRECTION=/^(?:Recurring close|Repeated closing wording|Change):?/;
const directives=p=>p.split('\n').filter(x=>DIRECTIVE.test(x));
const corrections=p=>p.split('\n').filter(x=>CORRECTION.test(x));
// Simulate a chat: each step appends a user turn and an assistant reply, then rolls the next packet for real.
function run(opts,steps,seed){
    const b=shipped(opts,[...texted()],seed),out=[];
    for(let i=0;i<steps;i++){
        const p=b.api.packet(b.context,false);out.push(p);
        b.context.chat.push(u('I wait.'),a('Bonnie answered and went back to her phone.'));
    }
    return {b,out};
}

test('cadence defaults to about 1 in 4 for new and existing settings, and rejects unknown values',()=>{
    for(const o of [{},{schemaVersion:171,disruption:'max'},{autonomyDefault194:true}]){
        const b=shipped(o);assert.equal(b.api.settings(b.context).cadence,'quarter');}
    const bad=shipped({cadence:'sometimes'});assert.equal(bad.api.settings(bad.context).cadence,'quarter');
    const kept=shipped({cadence:'sixth'});assert.equal(kept.api.settings(kept.context).cadence,'sixth');
});

test('about one reply in four fires, never two in a row, and long droughts are capped',()=>{
    for(const seed of [1,2,3]){
        const {out}=run({autopilotEnabled:true},400,seed),fired=out.map(p=>!p.quiet);
        const rate=fired.filter(Boolean).length/fired.length;
        assert.ok(rate>.18&&rate<.32,'rate '+rate);
        let gap=0,maxGap=0;
        for(let i=0;i<fired.length;i++){
            if(i&&fired[i])assert.ok(!fired[i-1],'no back-to-back firing turns at '+i);
            gap=fired[i]?0:gap+1;maxGap=Math.max(maxGap,gap);
        }
        assert.ok(maxGap<8,'max quiet run '+maxGap);
    }
});

test('1 in 2 and 1 in 6 follow their own rates',()=>{
    const rate=c=>{const {out}=run({autopilotEnabled:true,cadence:c},400,9);return out.filter(p=>!p.quiet).length/out.length;};
    const half=rate('half'),sixth=rate('sixth');
    assert.ok(half>.4&&half<=.5,'half '+half);assert.ok(sixth>.11&&sixth<.23,'sixth '+sixth);
});

test('a firing turn carries exactly one directive, with no word sparks or context word',()=>{
    const seen=new Set();
    for(const opts of [{autopilotEnabled:true,disruption:'max',intensity:100,maxLayers:5},{disruption:'high'},{autopilotEnabled:true,disruption:'off'}]){
        const {out}=run(opts,120,4);
        for(const p of out.filter(p=>!p.quiet)){
            const d=directives(p.prompt);assert.equal(d.length,1,p.prompt);assert.ok(corrections(p.prompt).length<=1,p.prompt);seen.add(p.directive);
            assert.doesNotMatch(p.prompt,/^(?:Words in play|Context word):/m,p.prompt);
            if(p.directive==='form')assert.match(p.prompt,/^Phases: .+\n(?:Attention: .+\n)?Transition: .+\n(?:Close: .+\n)?<\/scene_direction>$/m);
            else assert.doesNotMatch(p.prompt,/^(?:Phases|Transition|Close):/m);
        }
    }
    for(const kind of ['break','form','lens'])assert.ok(seen.has(kind),'never picked '+kind);
});

test('a quiet turn carries no DM directive, at most one correction, and an empty quiet turn sends no index',async()=>{
    const b=shipped({autopilotEnabled:true},[...texted()],5);let quiet=0,loud=0;
    for(let i=0;i<24;i++){
        b.context.chat.push(u('I wait.'));const r=await prepare(b);
        const packet=b.injections.filter(x=>x[0]==='story_chaos_engine_auto').at(-1)[1];
        const index=b.injections.filter(x=>x[0]==='story_chaos_engine_index').at(-1)[1];
        if(packet===''){assert.equal(index,'');assert.equal(r.prompt,'');}else assert.match(index,/^<scene_direction_index>/);
        assert.ok(corrections(packet).length<=1,packet);
        if(directives(packet).length)loud++;else quiet++;
        b.context.chat.push(a('Bonnie answered and went back to her phone.'));
    }
    assert.ok(quiet>loud&&loud>0,quiet+' quiet / '+loud+' firing');
});

test('autonomy still rides every turn; a quiet turn carries only its lines',()=>{
    const {out}=run({autonomyEnabled:true,autonomyDefault194:true},40,6);
    const quiet=out.filter(p=>p.quiet);assert.ok(quiet.length);
    for(const p of quiet){assert.match(p.prompt,/Ledger:/);assert.equal(directives(p.prompt).length,0,p.prompt);}
});

test('a swipe re-decides its own turn instead of cooling down against itself, and preview always fires',()=>{
    let checked=0;
    for(let seed=1;seed<40&&checked<3;seed++){
        const b=shipped({autopilotEnabled:true},[...texted()],seed);
        const first=b.api.packet(b.context,false);if(first.quiet)continue;
        // Same position again, as a swipe of the reply that just fired: the earlier decision is rolled back.
        let fired=0;for(let i=0;i<40;i++)if(!b.api.packet(b.context,false).quiet)fired++;
        assert.ok(fired>0,'a swipe can fire again');checked++;
    }
    assert.equal(checked,3);
    const b=shipped({autopilotEnabled:true},[...texted()],7);
    for(let i=0;i<10;i++){const p=b.api.packet(b.context,true);assert.ok(!p.quiet);assert.equal(directives(p.prompt).length,1);}
});

test('every-reply cadence and tool mode keep the stacked packet',()=>{
    const every=shipped({autopilotEnabled:true,cadence:'every'},[...texted()],3).api;
    const b=shipped({autopilotEnabled:true,cadence:'every'},[...texted()],3);
    for(let i=0;i<5;i++){const p=b.api.packet(b.context,false);assert.ok(!p.quiet);assert.ok(directives(p.prompt).length>1,p.prompt);}
    const tool=shipped({mode:'tool',autopilotEnabled:true},[...texted()],3);
    for(let i=0;i<5;i++){const p=tool.api.packet(tool.context,false);assert.ok(!p.quiet);assert.ok(directives(p.prompt).length>1);}
    assert.ok(every);
});

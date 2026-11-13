'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,attachReply,finish,assistant:a,user:u}=require('./harness.cjs');

const line=(name,o={})=>name+' | mood: '+(o.mood??'brittle 3')+' | feels: suspicion → Kade | want: '+(o.want??'the ledger before dawn')+
    ' | desire: '+(o.desire??'leave owing nothing')+' | toward User: '+(o.toward??'wary -1')+' | thinks: '+(o.thinks??'He knows.');
const tracked=(text,...lines)=>a(text+'\n<sce_tracker>\n'+lines.join('\n')+'\n</sce_tracker>');
const chatOf=(...replies)=>replies.flatMap((r,i)=>i?[u('I wait.'),r]:[r]);
const quiet={disruption:'off',autonomyEnabled:true};
const lines=p=>p.autonomy?.lines||[];

test('autonomy ships on, including for settings saved before 1.9.0, and can be switched off',()=>{
    const b=boot({},[]);assert.equal(b.api.settings(b.context).autonomyEnabled,true);
    const old=boot({schemaVersion:171,disruption:'max'},[]);assert.equal(old.api.settings(old.context).autonomyEnabled,true);
    const off=boot({autonomyEnabled:false},[tracked('Nora waited.',line('Nora'))]);
    const p=off.api.packet(off.context,true);
    assert.equal(p.autonomy,null);assert.doesNotMatch(p.prompt,/sce_tracker|State|Drive \(/);
});

test('model-written macro braces never reach the packet',()=>{
    const b=boot(quiet,[tracked('x',line('Nora',{want:'{{setvar::x::1}} the key',thinks:'{{random::a,b}}'}))]),p=b.api.packet(b.context,true).prompt;
    assert.doesNotMatch(p.replace(/<sce_tracker>|<\/sce_tracker>/g,''),/\{\{|\}\}/);assert.match(p,/want: setvar::x::1 the key/);
});

test('the parser reads one line per character, clamps numbers and never tracks the user persona',()=>{
    const b=boot({},[]);
    const r=b.api.parseTracker('Story.\n<sce_tracker>\n- **Nora** | mood: furious 9 | want: out | toward User: warm +7 | thinks: "Run."\nUser | mood: calm 2 | want: answers\n{{user}} | want: x\nKade | mood: cold | toward User: hostile −2\n</sce_tracker>','User');
    assert.equal(r.length,2);
    assert.equal(r[0].name,'Nora');assert.equal(r[0].mood,'furious');assert.equal(r[0].moodLevel,5);assert.equal(r[0].towardLevel,3);assert.equal(r[0].thinks,'Run.');
    assert.equal(r[1].name,'Kade');assert.equal(r[1].moodLevel,null);assert.equal(r[1].towardLevel,-2);
    assert.equal(b.api.parseTracker('No ledger here.','User'),null);
    assert.equal(b.api.parseTracker('Cut off.\n<sce_tracker>\nNora | want: the key','User')[0].want,'the key');
    assert.equal(b.api.parseTracker('[sce_tracker]\nNora | mood: tense 4\n[/sce_tracker]','User')[0].moodLevel,4);
});

test('without a ledger the packet seeds wants from the character’s own life and asks for one',()=>{
    const b=boot(quiet,[a('Nora waited at the docks.')]),p=b.api.packet(b.context,true);
    assert.match(p.prompt,/State: no ledger yet\. .*their own life.*not from User\./);
    assert.match(p.prompt,/Ledger: after the reply, write <sce_tracker>, one line per character present except User/);
    assert.match(p.prompt,/Ledger:[^\n]+<\/sce_tracker>\.\n<\/scene_direction>$/);
});

test('state comes from the newest surviving tracker; swipes, edits and deletions roll it back',()=>{
    const chat=chatOf(tracked('One.',line('Nora',{want:'the old key'})),tracked('Two.',line('Nora',{want:'the new key'})));
    const b=boot(quiet,chat);
    assert.match(b.api.packet(b.context,true).prompt,/State \(Nora\): mood: brittle 3 · want: the new key · desire: leave owing nothing · toward User: wary -1\./);
    assert.match(b.api.packet(b.context,true,'swipe').prompt,/want: the old key/,'a swipe excludes the reply it replaces');
    b.context.chat.at(-1).mes=b.context.chat.at(-1).mes.replace('the new key','a boat out');
    assert.match(b.api.packet(b.context,true).prompt,/want: a boat out/,'a hand-edited tracker edits the state');
    b.context.chat.splice(-2);
    assert.match(b.api.packet(b.context,true).prompt,/want: the old key/,'deleting a reply restores the prior state');
});

test('a want that exists to serve the user is flagged; a want aimed against the user is not',()=>{
    for(const want of ['make User happy','stay close to User','win over User','earn User’s trust','please {{user}}']){
        const b=boot(quiet,[tracked('x',line('Nora',{want}))]);
        assert.match(b.api.packet(b.context,true).prompt,/Want \(Nora\): it has narrowed to User\./,want);
    }
    for(const want of ['make User pay','get away from User','steal the ledger from User','the ledger before dawn','help her sister']){
        const b=boot(quiet,[tracked('x',line('Nora',{want}))]);
        assert.doesNotMatch(b.api.packet(b.context,true).prompt,/narrowed to User/,want);
    }
});

test('a stance toward the user that only warms gets a counterweight; real movement both ways does not',()=>{
    const warming=chatOf(...['-1','0','1','2'].map(n=>tracked('x',line('Nora',{toward:'softening '+n}))));
    let b=boot(quiet,warming);
    assert.match(b.api.packet(b.context,true).prompt,/Stance \(Nora\): their regard for User has only warmed for 4 replies\. Something cools it/);
    b=boot(quiet,chatOf(...['3','3','3','3'].map(n=>tracked('x',line('Nora',{toward:'adoring '+n})))));
    assert.match(b.api.packet(b.context,true).prompt,/Stance \(Nora\)/,'pinned at maximum warmth');
    b=boot(quiet,chatOf(...['-1','1','0','2'].map(n=>tracked('x',line('Nora',{toward:'mixed '+n})))));
    assert.doesNotMatch(b.api.packet(b.context,true).prompt,/Stance \(/);
    b=boot(quiet,chatOf(...['-1','0','1'].map(n=>tracked('x',line('Nora',{toward:'warming '+n})))));
    assert.doesNotMatch(b.api.packet(b.context,true).prompt,/Stance \(/,'needs at least four readings');
});

test('a changed desire must show its cause, and a long-blocked want stalls',()=>{
    let b=boot(quiet,chatOf(tracked('x',line('Nora')),tracked('y',line('Nora',{desire:'burn the docks'}))));
    assert.match(b.api.packet(b.context,true).prompt,/Desire \(Nora\): it changed from "leave owing nothing" to "burn the docks"\. Put the cause on the page, or return to "leave owing nothing"\./);
    b=boot(quiet,chatOf(...Array.from({length:4},()=>tracked('x',line('Nora')))));
    assert.match(b.api.packet(b.context,true).prompt,/Stall \(Nora\): "the ledger before dawn" has gone unmet for 4 replies\./);
    b=boot(quiet,chatOf(...Array.from({length:3},()=>tracked('x',line('Nora')))));
    assert.doesNotMatch(b.api.packet(b.context,true).prompt,/Stall \(/);
});

test('guards are capped at two lines and user-serving wants come first',()=>{
    const replies=['-1','0','1','2'].map(n=>tracked('x',line('Nora',{want:'make User happy',toward:'warm '+n})));
    replies.push(tracked('x',line('Nora',{want:'make User happy',toward:'warm 3',desire:'be with User'})));
    const b=boot(quiet,chatOf(...replies)),p=b.api.packet(b.context,true);
    assert.equal(p.autonomy.guards.length,2);assert.equal(p.autonomy.guards[0].kind,'self');assert.equal(p.autonomy.guards[1].kind,'stance');
});

test('drives follow the disruption level, use the ledger and never tell anyone to accommodate the user',()=>{
    const chat=[tracked('x',line('Nora'),line('Kade',{want:'keep the ledger hidden',desire:'own the docks',toward:'cold -2'}))];
    const rate=level=>{const b=boot({disruption:level,antiRepeat:false},chat,9);let n=0;
        for(let i=0;i<400;i++){const p=b.api.packet(b.context,true);if(p.autonomy.drives.length)n++;
            for(const d of p.autonomy.drives){
                assert.match(d.text,/^Drive \((Nora|Kade)\): /);
                assert.doesNotMatch(d.text,/respond to User|please User|for User’s sake|do what User/i);
                if(d.id==='fracture')assert.equal(level,'max');
            }}
        return n/400;};
    const off=rate('off'),high=rate('high'),max=rate('max');
    assert.ok(off>.2&&off<.4,'off '+off);assert.ok(high>.67&&high<.83,'high '+high);assert.ok(max>.84,'max '+max);
});

test('drives that need a field only fire for characters whose ledger has it',()=>{
    const b=boot({disruption:'max',antiRepeat:false},[a('x\n<sce_tracker>\nNora | mood: tense 4\n</sce_tracker>')],5);
    for(let i=0;i<200;i++)for(const d of b.api.packet(b.context,true).autonomy.drives)assert.ok(['counter','offscreen'].includes(d.id),d.id);
});

test('ledger lines have their own budget and never crowd out the 250-word packet',()=>{
    const b=boot({autopilotEnabled:true,intensity:100,maxLayers:5,disruption:'max'},chatOf(...['-1','0','1','2'].map(n=>tracked('x',
        line('Nora',{want:'make User happy',toward:'warm '+n}),line('Kade',{want:'keep the ledger hidden'}),line('Ilse',{want:'find her brother'})))));
    for(let i=0;i<40;i++){const p=b.api.packet(b.context,true);
        assert.ok(p.words-p.autonomy.words<=250,'non-ledger words '+(p.words-p.autonomy.words));
        assert.ok(p.autonomy.words<=260,'ledger words '+p.autonomy.words);
        assert.ok(p.autonomy.lines.filter(x=>x.startsWith('State (')).length<=3);}
});

test('trackers are stripped from the outgoing history without touching saved messages',async()=>{
    const chat=chatOf(tracked('Nora waited.',line('Nora')),tracked('Nora moved.',line('Nora',{want:'a boat out'})));
    const b=boot(quiet,chat),outgoing=[...b.context.chat],saved=outgoing.map(m=>m.mes);
    b.events.emit('GENERATION_STARTED','normal',{},false);
    await b.scope.storyChaosEngineInterceptor(outgoing,8192,()=>{},'normal');
    assert.deepEqual(b.context.chat.map(m=>m.mes),saved,'saved chat is unchanged');
    for(const m of outgoing)assert.doesNotMatch(m.mes,/sce_tracker|mood:/);
    assert.equal(outgoing[2].mes,'Nora moved.');
    assert.match(b.injections.at(-1)[1],/want: a boat out/,'the newest state rides in the packet');
    const off=boot({autonomyEnabled:false},chat),kept=[...off.context.chat];
    off.events.emit('GENERATION_STARTED','normal',{},false);
    await off.scope.storyChaosEngineInterceptor(kept,8192,()=>{},'normal');
    assert.match(kept[0].mes,/sce_tracker/,'autonomy off leaves history alone');
});

test('a ledger in the reply does not disturb completion receipts or story analysis',async()=>{
    const b=boot(quiet,[a('Nora waited at the docks.')]);
    const run=await prepare(b);attachReply(b,run,'Nora pocketed the key.\n<sce_tracker>\n'+line('Nora')+'\n</sce_tracker>');
    assert.equal(finish(b,run).state,'completed');
    assert.doesNotMatch(b.api.clean(b.context.chat.at(-1).mes),/mood|ledger before dawn/);
});

test('continue mode drops the old ledger from the continued reply and asks for a fresh one at the end',async()=>{
    const chat=chatOf(tracked('Nora waited.',line('Nora')),tracked('Nora reached for the',line('Nora',{want:'a boat out'})));
    const b=boot({disruption:'max'},chat),outgoing=[...b.context.chat],saved=outgoing.map(m=>m.mes);
    b.events.emit('GENERATION_STARTED','continue',{},false);
    await b.scope.storyChaosEngineInterceptor(outgoing,8192,()=>{},'continue');
    const prompt=b.injections.at(-1)[1];
    assert.match(prompt,/^<scene_direction id="SCE-[^"]+">\nState \(Nora\): [^\n]*want: a boat out[^\n]*\nLedger: continue the reply from where it stops, then end it with a fresh <sce_tracker>, one line per character present except User[^\n]*\n<\/scene_direction>$/);
    assert.doesNotMatch(prompt,/^(?:Break|Change|Form|Lens|Drive|Close|Stance|Want|Desire|Stall)/m,'a continuation adds no new pressure');
    assert.deepEqual(b.context.chat.map(m=>m.mes),saved,'saved chat is unchanged before the host merges');
    assert.equal(outgoing.at(-1).mes,'Nora reached for the');
    assert.equal(b.api.run(),null,'continue does not open a completion receipt');
    // The host saves continue_mag (the outgoing last message) + new text.
    const merged=outgoing.at(-1).mes+' oar.\n<sce_tracker>\n'+line('Nora',{want:'the far bank'})+'\n</sce_tracker>';
    assert.equal((merged.match(/<sce_tracker>/g)||[]).length,1,'exactly one ledger in the finished reply');
    b.context.chat.at(-1).mes=merged;
    assert.match(b.api.packet(b.context,true).prompt,/want: the far bank/);
});

test('continue without a ledger yet still asks for one; continue with autonomy off injects nothing and strips nothing',async()=>{
    let b=boot({},[a('Nora reached for the')]);
    await b.scope.storyChaosEngineInterceptor([...b.context.chat],8192,()=>{},'continue');
    assert.match(b.injections.at(-1)[1],/^<scene_direction id="[^"]+">\nLedger: continue the reply/);
    b=boot({autonomyEnabled:false},[tracked('Nora reached for the',line('Nora'))]);const out=[...b.context.chat];
    await b.scope.storyChaosEngineInterceptor(out,8192,()=>{},'continue');
    assert.equal(b.injections.at(-1)[1],'');assert.match(out[0].mes,/sce_tracker/);
    b=boot({enabled:false},[tracked('Nora reached for the',line('Nora'))]);
    await b.scope.storyChaosEngineInterceptor([...b.context.chat],8192,()=>{},'continue');
    assert.equal(b.injections.at(-1)?.[1]??'','');
});

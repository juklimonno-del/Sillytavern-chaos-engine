'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,assistant:a,user:u}=require('./harness.cjs');

const DARK=[
    a('The cellar door groaned. Marek wiped the blood from his knuckles and listened to the man upstairs begging.'),
    u('I step closer and tell him he has until the count of ten.'),
    a('Marek counted slowly, each number a nail.')
];
const DEFLATING=/mundane|ordinary|trivial|unremarkable|petty|non-catastrophic|embarrass|joke|punchline|ridiculous|absurd|uneventful|inconvenience|obsession|simply live|instead of drama|fail to happen|deflated|disproportionate|artificial (?:escalation|cliffhanger)|new crisis|time skip|carrying on regardless|not a hook/i;
const BREAK=/^Break: (.+)$/m;
const sample=(options,count=300,chat=DARK,seed=41)=>{
    const b=boot({autopilotEnabled:true,...options},chat,seed);
    return {b,prompts:Array.from({length:count},()=>b.api.packet(b.context,true).prompt)};
};
const share=(prompts,re=BREAK)=>prompts.filter(p=>re.test(p)).length/prompts.length;

test('disruption defaults to high, including for settings saved before 1.8.4, and rejects bad values',()=>{
    assert.equal(boot({},[]).api.settings(boot({},[]).context).disruption,'high');
    const old=boot({schemaVersion:171,cuePalette:'intense'},[]);
    assert.equal(old.api.settings(old.context).disruption,'high');
    for(const bad of ['loud',null,7,{},'HIGH']){const b=boot({disruption:bad},[]);assert.equal(b.api.settings(b.context).disruption,'high');}
    for(const ok of ['off','low','medium','high','max']){const b=boot({disruption:ok},[]);assert.equal(b.api.settings(b.context).disruption,ok);}
});

test('the packet is lean: no preamble, no closing instruction and no execution label',()=>{
    const {prompts}=sample({},120);
    for(const p of prompts){
        assert.match(p,/^<scene_direction id="[^"]*">\n|^<scene_direction>\n/);
        assert.match(p,/\n<\/scene_direction>$/);
        assert.doesNotMatch(p,/Hold the scene|Honor continuity|Work the cues|Reply with the fiction turn only|(?:gentle|moderate|strong) execution/);
    }
});

test('break frequency follows the disruption level',()=>{
    const rate=level=>share(sample({disruption:level},400).prompts);
    assert.equal(rate('off'),0);
    const low=rate('low'),medium=rate('medium'),high=rate('high'),max=rate('max');
    assert.ok(low>.2&&low<.4,'low '+low);
    assert.ok(medium>.45&&medium<.65,'medium '+medium);
    assert.ok(high>.72&&high<.88,'high '+high);
    assert.equal(max,1);
});

test('breaks never deflate and hard reversals appear only at max',()=>{
    for(const cuePalette of ['neutral','intense']){
        for(const disruption of ['low','medium','high','max']){
            const b=boot({cuePalette,disruption,antiRepeat:false},DARK,17),seen=new Set();
            for(let i=0;i<400;i++){const r=b.api.creative(b.context,true).disruption;if(r){assert.doesNotMatch(r.instruction,DEFLATING,r.instruction);seen.add(r.tier);}}
            assert.ok(seen.has('swerve'),disruption+' must reach swerve breaks');
            assert.equal(seen.has('hard'),disruption==='max',disruption+' hard-reversal availability: '+[...seen]);
        }
    }
});

test('a break is independent of the category weights, so the engine is not only a pace keeper',()=>{
    const b=boot({disruption:'max',autopilotEnabled:true,autonomyEnabled:false},DARK,3),s=b.api.settings(b.context);
    s.categoryWeights=Object.fromEntries(Object.keys(b.api.categories).map(id=>[id,0]));s.customKeywords='';s.contextGravity=0;s.structureEnabled=false;
    s.featureOverrides.structureEnabled='off';
    for(let i=0;i<20;i++){
        const r=b.api.creative(b.context,true);assert.equal(r.layers.length,0);assert.ok(r.disruption,'max always breaks');
        assert.match(b.api.packet(b.context,true).prompt,/^<scene_direction>\nBreak: [^\n]+\n<\/scene_direction>$/);
    }
});

test('off leaves no Break or Change line and no reversal family',()=>{
    const {b,prompts}=sample({disruption:'off',structureEnabled:true},300,[a('Marek counted.'),u('ok'),a('Marek counted.'),u('ok'),a('Marek counted.'),u('ok'),a('Marek counted.')]);
    for(const p of prompts)assert.doesNotMatch(p,/^(?:Break|Change): /m);
    const s=b.api.settings(b.context);s.structureWeights=Object.fromEntries(Object.keys(b.api.families).map(id=>[id,id==='reversal'?3:0]));
    assert.equal(b.api.structural(b.context,true),null);
});

test('recent breaks are avoided and history is committed only for non-preview rolls',()=>{
    const b=boot({disruption:'max',autopilotEnabled:true},DARK,5);
    const before=b.api.cueHistory.size;b.api.creative(b.context,true);assert.equal(b.api.cueHistory.size,before);
    let previous=null;
    for(let i=0;i<40;i++){
        const r=b.api.creative(b.context,false).disruption;assert.ok(r);
        assert.notEqual(r.instruction,previous,'consecutive identical break');previous=r.instruction;
    }
    assert.ok(b.api.cueHistory.get(b.api.key(b.context)).some(x=>x.startsWith('disruption:')));
});

test('break families join the pool and static families recede as disruption rises',()=>{
    const count=disruption=>{
        const b=boot({disruption,structureEnabled:true,structureInfluence:100,beatDensity:100,structureAntiRepeat:false,autopilotEnabled:true},DARK,23);
        b.api.settings(b.context).structureWeights=Object.fromEntries(Object.keys(b.api.families).map(id=>[id,2]));
        const tally={};for(let i=0;i<1500;i++){const id=b.api.structural(b.context,true).familyId;tally[id]=(tally[id]||0)+1;}return tally;
    };
    const off=count('off'),high=count('high'),max=count('max');
    assert.ok((high.rupture||0)>(off.rupture||0)&&(high.shift||0)>(off.shift||0),'break families must gain at high');
    assert.ok((off.sustained||0)>(max.sustained||0),'sustained must recede');
    assert.equal(off.reversal||0,0);assert.equal(high.reversal||0,0);assert.ok(max.reversal>0,'reversal is reachable at max');
});

test('new break families deliver coherent phases, routes and attention',()=>{
    for(const id of ['rupture','reversal','shift']){
        const f=require('./harness.cjs').boot({}).api.families[id];assert.ok(f,id);
        for(const route of f.routes)for(const [n,order] of Object.entries(route.orders)){
            assert.equal(order.length,Number(n));assert.ok(order.every(i=>Number.isInteger(i)&&i>=0&&i<f.phases.length),id+' '+route.id);
            assert.equal(new Set(order).size,order.length);
        }
        assert.ok(f.min>=3&&f.max<=5&&f.routes.every(r=>Object.keys(r.orders).length>0));
    }
    const b=boot({disruption:'max',structureEnabled:true,structureInfluence:100,beatDensity:100,autopilotEnabled:true},DARK,9);
    b.api.settings(b.context).structureWeights=Object.fromEntries(Object.keys(b.api.families).map(id=>[id,['rupture','reversal','shift'].includes(id)?3:0]));
    const seen=new Set();
    for(let i=0;i<200;i++){const r=b.api.structural(b.context,true);seen.add(r.familyId);
        assert.equal(r.beats.length,r.count);assert.ok(r.beats.every(x=>x.role&&x.role.length>0));assert.doesNotMatch(r.beats.map(x=>x.role).join(' '),DEFLATING);}
    assert.deepEqual([...seen].sort(),['reversal','rupture','shift']);
});

test('closings carry momentum instead of staying with the current activity',()=>{
    const {prompts}=sample({disruption:'high',structureEnabled:true},300);
    const closes=prompts.map(p=>p.match(/^Close: (.+)$/m)?.[1]).filter(Boolean);
    assert.ok(closes.length>50);
    for(const c of closes)assert.doesNotMatch(c,/Stay with the current activity|Finish on a completed/,c);
    const off=sample({disruption:'off',structureEnabled:true},300).prompts.map(p=>p.match(/^Close: (.+)$/m)?.[1]).filter(Boolean);
    assert.ok(off.some(c=>/Stay with the current activity|Finish on a completed/.test(c)),'off keeps the 1.8.3 closings');
    const every=sample({disruption:'high',cuePalette:'everyday',structureEnabled:true},300).prompts.map(p=>p.match(/^Close: (.+)$/m)?.[1]).filter(Boolean);
    assert.ok(every.some(c=>/not a hook|Stay with the current activity/.test(c)),'everyday keeps the 1.8.0 closings');
});

const SAME=[1,2,3,4].flatMap(i=>[a('Marek stepped closer and said nothing. The lamp swung. He waited for the man to speak.'),u('I wait '+i)]);
const MIXED=[
    a('Marek stepped closer and said nothing.'),u('1'),
    a('"You counted," the man whispered. "Why would you count?" He looked at the floor.'),u('2'),
    a('Rain hit the window. "Ten," Marek said, "and then nothing at all, you understand?"'),u('3'),
    a('The lamp swung. Nobody moved for a long while.')
];

test('the shape watch names a different shape when recent replies repeat one',()=>{
    for(const disruption of ['low','medium','high','max']){
        const {prompts}=sample({disruption},120,SAME);
        const changes=prompts.map(p=>p.match(/^Change: (.+)$/m)?.[1]).filter(Boolean);
        assert.ok(changes.length>0,disruption+' should flag four near-identical replies');
        for(const c of changes)assert.match(c,/^(?:Open |End on |Give dialogue|Let action)/);
    }
});

test('the shape watch stays quiet for varied replies, short histories and Off',()=>{
    assert.equal(share(sample({disruption:'max'},120,MIXED).prompts,/^Change: /m),0);
    assert.equal(share(sample({disruption:'max'},120,SAME.slice(0,6)).prompts,/^Change: /m),0);
    assert.equal(share(sample({disruption:'off'},120,SAME).prompts,/^Change: /m),0);
});

test('the shape watch needs four of four at low and medium, three of four at high and max',()=>{
    const three=[a('"Stop," Marek said. "Now." The lamp swung and he waited.'),u('x'),...SAME.slice(0,6)];
    const lowRate=share(sample({disruption:'medium'},200,three).prompts,/^Change: Open /m);
    const highRate=share(sample({disruption:'high'},200,three).prompts,/^Change: Open /m);
    assert.equal(lowRate,0);assert.ok(highRate>0,'three of four repeats is enough at high');
});

test('a single-line preview does not consume break history',()=>{
    const b=boot({disruption:'max',autopilotEnabled:true},DARK,6);
    b.api.packet(b.context,true);b.api.packet(b.context,true);
    assert.equal(b.api.cueHistory.size,0);
    b.api.packet(b.context,false);
    assert.ok(b.api.cueHistory.get(b.api.key(b.context)).some(x=>x.startsWith('disruption:')));
});

test('the legacy tool path carries the same lean packet',async()=>{
    const b=boot({mode:'tool',disruption:'max',structureEnabled:true},DARK,8);
    const result=JSON.parse(await b.tools[0].action());
    assert.match(result.guidance,/^<scene_direction>\nBreak: /);
    assert.doesNotMatch(result.guidance,/Honor continuity|Hold the scene|Reply with the fiction turn only/);
    assert.ok(result.disruption);
});

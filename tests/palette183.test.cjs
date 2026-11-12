'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,assistant:a,user:u}=require('./harness.cjs');

const DARK_SCENE=[
    a('The cellar door groaned. Marek wiped the blood from his knuckles and listened to the man upstairs begging.'),
    u('I step closer and tell him he has until the count of ten.'),
    a('Marek counted slowly, each number a nail.')
];
// Phrases the 1.8.0 library used to deflate tension. Neutral and Intense must never deliver them.
const DEFLATING=/mundane|ordinary|trivial|unremarkable|petty|non-catastrophic|embarrass|joke|punchline|ridiculous|absurd|uneventful|inconvenience|obsession|simply live|instead of drama|fail to happen|deflated|disproportionate|artificial (?:escalation|cliffhanger)|new crisis|time skip|carrying on regardless|not a hook/i;
const sample=(options,count=300,chat=DARK_SCENE,seed=77)=>{
    const b=boot({autopilotEnabled:true,intensity:100,maxLayers:5,structureInfluence:95,beatDensity:80,...options},chat,seed);
    return {b,prompts:Array.from({length:count},()=>b.api.packet(b.context,true).prompt)};
};

test('the packet is a scoped XML block without the old branding, bracket headers or numeric ratios',()=>{
    const b=boot({autopilotEnabled:true},DARK_SCENE,5),p=b.api.packet(b.context,true,'normal','SCE-9-123');
    assert.match(p.prompt,/^<scene_direction id="SCE-9-123">\n/);
    assert.match(p.prompt,/\n<\/scene_direction>$/);
    assert.doesNotMatch(p.prompt,/chaos|\[STORY|\[\/STORY|Lens \[|Optional words|not paragraph counts|Attention: \d|not facts|skip conflicts/i);
    assert.match(p.prompt,/Hold the scene’s established tone and intensity/);
    assert.ok(p.words<=250);
});

test('the run marker stays in the id attribute so request observation still works',async()=>{
    const {prepare}=require('./harness.cjs'),b=boot({autopilotEnabled:true},DARK_SCENE,5),run=await prepare(b);
    assert.ok(run.prompt.includes('<scene_direction id="'+run.id+'">'));
});

test('neutral is the default palette, including for settings saved before 1.8.3',()=>{
    assert.equal(boot({},[]).api.settings(boot({},[]).context).cuePalette,'neutral');
    const old=boot({schemaVersion:171,structureWeights:{resume:2},autopilotEnabled:true},[]);
    assert.equal(old.api.settings(old.context).cuePalette,'neutral');
    for(const bad of ['loud',null,7,{}]){const b=boot({cuePalette:bad},[]);assert.equal(b.api.settings(b.context).cuePalette,'neutral');}
    for(const ok of ['neutral','intense','everyday']){const b=boot({cuePalette:ok},[]);assert.equal(b.api.settings(b.context).cuePalette,ok);}
});

test('neutral and intense never deliver deflating cues or endings in dark scenes',()=>{
    for(const cuePalette of ['neutral','intense']){
        const {prompts}=sample({cuePalette});
        for(const prompt of prompts)assert.doesNotMatch(prompt,DEFLATING,cuePalette+' delivered a deflating cue:\n'+prompt);
    }
});

test('the 1.8.0 library remains available as the everyday palette',()=>{
    const {prompts}=sample({cuePalette:'everyday'});
    assert.ok(prompts.some(p=>DEFLATING.test(p)),'Everyday must still reach the original cues');
    assert.ok(prompts.some(p=>/Form: Deliberate anti-climax/.test(p)),'Everyday must still reach anti-climax');
    assert.ok(prompts.some(p=>/Form: Elastic time/.test(p)),'Everyday must still reach Elastic time');
});

test('neutral and intense skip anti-climax and elastic time and the humor category even when weights are High',()=>{
    for(const cuePalette of ['neutral','intense']){
        const b=boot({cuePalette,structureEnabled:true,structureInfluence:100,beatDensity:100},DARK_SCENE,3);
        const s=b.api.settings(b.context);
        s.structureWeights=Object.fromEntries(Object.keys(b.api.families).map(id=>[id,['anticlimax','time'].includes(id)?3:0]));
        assert.equal(b.api.structural(b.context,true),null,cuePalette+' must not select an excluded family');
        s.structureWeights=Object.fromEntries(Object.keys(b.api.families).map(id=>[id,3]));
        for(let i=0;i<200;i++)assert.ok(!['anticlimax','time'].includes(b.api.structural(b.context,true).familyId));
        s.categoryWeights=Object.fromEntries(Object.keys(b.api.categories).map(id=>[id,id==='humor'?3:0]));
        for(let i=0;i<50;i++)assert.equal(b.api.creative(b.context,true).layers.length,0);
    }
});

test('every category keeps at least one eligible cue in every palette',()=>{
    for(const cuePalette of ['neutral','intense','everyday']){
        const b=boot({cuePalette,intensity:100,maxLayers:5},DARK_SCENE,9);
        const seen=new Set();
        for(let i=0;i<400;i++)for(const layer of b.api.creative(b.context,true).layers){
            assert.ok(layer.instruction&&layer.instruction.length>0,cuePalette+' produced an empty instruction for '+layer.id);seen.add(layer.id);
        }
        assert.ok(seen.size>=(cuePalette==='everyday'?11:9),cuePalette+' reached only '+[...seen]);
    }
});

test('intense adds stakes and consequence cues that neutral does not',()=>{
    const stakes=/costs something real|narrows what the characters can still do|full weight|pays for it|without softening|the cost shows|carries the threat|circling|both feel it|debt comes due|presses in|lasting mark|cannot be undone|Pain, fatigue or fear|turns hard and specific/;
    const intense=sample({cuePalette:'intense'},400).prompts,neutral=sample({cuePalette:'neutral'},400).prompts;
    assert.ok(intense.some(p=>stakes.test(p)),'Intense must reach its added cues');
    assert.ok(!neutral.some(p=>stakes.test(p)),'Neutral must not include the intense additions');
});

test('palettes leave saved weights untouched and previews stay side-effect free',()=>{
    const b=boot({cuePalette:'neutral',structureEnabled:true},DARK_SCENE,4),s=b.api.settings(b.context);
    const before=JSON.stringify([s.categoryWeights,s.structureWeights]);
    b.api.packet(b.context,true);b.api.packet(b.context,true);
    assert.equal(JSON.stringify([b.api.settings(b.context).categoryWeights,b.api.settings(b.context).structureWeights]),before);
    assert.equal(b.api.structureHistory.size,0);assert.equal(b.api.cueHistory.size,0);
});

test('function-like words do not become context anchors or optional words',()=>{
    const chat=[a('Tell him until ten. Closer, closer, toward the window. Something nothing anyone said told him. The brass lantern glowed.'),u('I tell him again, ten, until closer.')];
    const b=boot({contextGravity:100,intensity:100,maxLayers:5,structureEnabled:true,structureGrounding:100},chat,6);
    const banned=new Set(['tell','tells','told','until','ten','closer','toward','something','nothing','anyone']);
    const idx=b.api.index(b.context);
    for(const option of idx.options)assert.ok(!banned.has(option.value),'Stop word reached the index: '+option.value);
    for(let i=0;i<200;i++){
        const p=b.api.packet(b.context,true);
        for(const word of p.creative.word_sparks)assert.ok(!banned.has(word),'Stop word became a spark: '+word);
        if(p.creative.anchor)assert.ok(!banned.has(p.creative.anchor));
    }
});

test('the palette selector exists in the packet pipeline for the legacy tool path too',async()=>{
    const b=boot({mode:'tool',structureEnabled:true,cuePalette:'intense'},DARK_SCENE,8);
    const result=JSON.parse(await b.tools[0].action());
    assert.match(result.guidance,/^<scene_direction>\n/);
    assert.doesNotMatch(result.guidance,DEFLATING);
});

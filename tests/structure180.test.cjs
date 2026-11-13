'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,attachReply,finish,assistant:a,texted}=require('./harness.cjs');

const legacy=['sustained','domino','parallel','echo','dialogue','pivot','anticlimax','mosaic','reverse','time'];
const added=['resume','revision','funnel','zoom','counterpoint','relay','accumulate','discovery'];
const plain=value=>JSON.parse(JSON.stringify(value));
const weights=(families,enabled)=>Object.fromEntries(Object.keys(families).map(id=>[id,enabled[id]||0]));
function selectFamily(id,options={},chat=[],seed=12345){
    const b=boot({structureEnabled:true,structureInfluence:100,beatDensity:100,structureGrounding:0,...options},chat,seed);
    b.api.settings(b.context).structureWeights=weights(b.api.families,{[id]:3});
    return b;
}
function assertDelivered(prompt,structure){
    assert.ok(prompt.includes('Form: '+structure.family),'Selected family must reach the prompt');
    assert.ok(prompt.includes('Transition: '+structure.transition),'Selected transition must reach the prompt');
    assert.ok(prompt.includes(structure.attentionLabel),'Selected attention profile must reach the prompt');
    assert.doesNotMatch(prompt,/Attention: \d/,'Attention is delivered as prose, not numeric ratios');
    if(structure.routeId)assert.ok(prompt.includes(structure.route),'Selected route must reach the prompt');
    for(const beat of structure.beats)assert.ok(prompt.includes(beat.role),'Selected phases must reach the prompt');
}

for(const id of added){
    test(id+' produces supported, distinct phase routes at usable beat counts',()=>{
        const b=selectFamily(id),definition=b.api.families[id],arrangements=new Set(),counts=new Set();
        assert.ok(definition,'New family must be selectable: '+id);
        for(const density of [0,75,100]){
            b.api.settings(b.context).beatDensity=density;
            for(let i=0;i<24;i++){
                const r=b.api.structural(b.context,true);
                assert.ok(r);assert.equal(r.familyId,id);
                assert.ok(r.count>=definition.min&&r.count<=definition.max);
                assert.equal(r.beats.length,r.count);assert.equal(r.attention.length,r.count);
                assert.equal(r.phaseOrder.length,r.count);
                const route=definition.routes.find(candidate=>candidate.id===r.routeId);
                assert.ok(route,'Selected route must belong to the family');
                assert.equal(r.route,route.label);
                assert.deepEqual(plain(r.phaseOrder),plain(route.orders[r.count]),'Route must support the resolved count');
                r.beats.forEach((beat,index)=>{
                    const pool=definition.phases[r.phaseOrder[index]];
                    assert.ok(pool?.includes(beat.role),'Each beat must come from its selected route phase');
                    assert.equal(beat.attention,r.attention[index]);
                    assert.ok(Number.isFinite(beat.attention)&&beat.attention>0&&beat.attention<=100);
                });
                counts.add(r.count);
                if(r.count===5)arrangements.add(r.phaseOrder.join(','));
            }
        }
        assert.deepEqual([...counts].sort(),[3,4,5]);
        assert.ok(arrangements.size>=2,'Five-beat variety must change the phase order, not just its wording');
    });
}

test('attention profiles produce different duration shapes at the same five-beat count',()=>{
    const modes=new Set();
    for(const seed of [1,17,12345]){
        const b=selectFamily('domino',{},[],seed);
        for(let i=0;i<96;i++){
            const r=b.api.structural(b.context,true),v=plain(r.attention),last=v.at(-1),middle=v.slice(1,-1);
            assert.equal(r.count,5);
            assert.ok(v.every(x=>Number.isFinite(x)&&x>0&&x<=100));
            assert.equal(typeof r.attentionLabel,'string');assert.ok(r.attentionLabel.trim());
            modes.add(r.attentionMode);
            switch(r.attentionMode){
                case 'steady':assert.ok(Math.max(...v)-Math.min(...v)<=1);break;
                case 'front':assert.equal(v[0],Math.max(...v));assert.ok(v[0]>last);break;
                case 'back':assert.equal(last,Math.max(...v));assert.ok(last>v[0]);break;
                case 'middle':assert.equal(v[2],Math.max(...v));assert.ok(v[2]>Math.max(v[0],last));break;
                case 'rising':assert.ok(v.every((x,j)=>!j||x>=v[j-1]));assert.ok(last>v[0]);break;
                case 'falling':assert.ok(v.every((x,j)=>!j||x<=v[j-1]));assert.ok(v[0]>last);break;
                case 'alternating':{
                    const even=[v[0],v[2],v[4]],odd=[v[1],v[3]];
                    assert.ok(Math.min(...even)>Math.max(...odd)||Math.min(...odd)>Math.max(...even));break;
                }
                case 'bookends':assert.ok(Math.min(v[0],last)>Math.max(...middle));break;
                case 'uneven':assert.ok(new Set(v).size>1);break;
                default:assert.fail('Unknown attention mode: '+r.attentionMode);
            }
        }
    }
    assert.deepEqual([...modes].sort(),['steady','front','back','middle','rising','falling','alternating','bookends','uneven'].sort());
});

test('single-beat and two-beat structures have usable attention without impossible middle sections',()=>{
    for(const density of [0,100]){
        const b=selectFamily('sustained',{beatDensity:density});
        for(let i=0;i<40;i++){
            const r=b.api.structural(b.context,true);
            assert.equal(r.count,density===0?1:2);assert.equal(r.attention.length,r.count);
            assert.ok(r.attention.every(x=>Number.isFinite(x)&&x>0));
            assert.ok(!['middle','bookends'].includes(r.attentionMode));
        }
    }
});

test('generic middle phases avoid adjacent duplicate roles when alternatives exist',()=>{
    for(const id of ['domino','echo','dialogue','anticlimax','reverse','time']){
        const b=selectFamily(id,{cuePalette:'everyday'});
        for(let i=0;i<32;i++){
            const r=b.api.structural(b.context,true);
            for(let j=2;j<r.count-1;j++)assert.notEqual(r.beats[j].role,r.beats[j-1].role,id+' repeated the same middle instruction');
        }
    }
});

test('new routes, transitions and attention reach actual automatic and legacy guidance',async()=>{
    for(const id of added){
        const b=selectFamily(id),run=await prepare(b);
        assertDelivered(b.injections.at(-1)[1],run.packet.structure);
        assert.equal(b.injections.at(-1)[3],0);
        const preview=b.api.packet(b.context,true);
        assertDelivered(preview.prompt,preview.structure);
    }
    const b=selectFamily('resume',{mode:'tool'});
    const result=JSON.parse(await b.tools[0].action());
    assertDelivered(result.guidance,result.structural);
    assert.equal(b.api.receipt(b.context).state,'legacy');
    assert.equal(b.api.state(b.context).outcomes.length,0);
});

test('maximum packets preserve delivered structure and safeguards within their word budget',()=>{
    for(const id of [...legacy,...added]){
        const b=selectFamily(id,{cuePalette:'everyday',autopilotEnabled:true,intensity:100,maxLayers:5,keywordBoost:100,
            customKeywords:'crimson velvet porcelain ribbon, silver lantern wooden window, amber feather copper teapot'},texted());
        for(let i=0;i<12;i++){
            const packet=b.api.packet(b.context,true);
            assertDelivered(packet.prompt,packet.structure);
            assert.ok(packet.words-(packet.autonomy?.words||0)<=250,id+' packet contains '+packet.words+' words');
            assert.doesNotMatch(packet.prompt,/Honor continuity|Hold the scene|Reply with the fiction turn only/);
            assert.match(packet.prompt,/^Attention: [A-Z]/m);
            assert.match(packet.prompt,/Recurring close/);
            assert.doesNotMatch(packet.prompt,/^Close:/m);
        }
    }
});

test('structure signatures follow delivered arrangement rather than unused closing suggestions',()=>{
    const b=selectFamily('sustained',{beatDensity:0,structureAntiRepeat:false}),seen=new Map();let differingClosings=false;
    for(let i=0;i<180;i++){
        const r=b.api.structural(b.context,true);
        const key=JSON.stringify([r.familyId,r.routeId,r.phaseOrder,r.beats,r.transition,r.attentionMode,r.attentionLabel]);
        const before=seen.get(key);
        if(before){
            assert.equal(r.signature,before.signature,'The same delivered structure must have the same signature');
            if(r.ending!==before.ending)differingClosings=true;
        }else seen.set(key,r);
    }
    assert.ok(differingClosings,'Fixture must observe the same arrangement with different optional endings');
});

test('saved legacy weights survive while ordinary maps receive new-family defaults',()=>{
    const saved=Object.fromEntries(legacy.map((id,index)=>[id,index%4]));
    const b=boot({schemaVersion:171,structureWeights:{...saved},customKeywords:'saved words',structureAntiRepeat:false,
        featureOverrides:{structureEnabled:'off'},autopilotEnabled:true});
    const s=b.api.settings(b.context);
    for(const id of legacy)assert.equal(s.structureWeights[id],saved[id]);
    for(const id of added)assert.equal(s.structureWeights[id],b.api.families[id].weight);
    assert.equal(s.structureAntiRepeat,false);assert.equal(s.customKeywords,'saved words');
    assert.equal(b.api.structural(b.context,true),null);
    const before=plain(s.structureWeights);b.api.applyPreset(b.context,'wild');
    assert.deepEqual(plain(b.api.settings(b.context).structureWeights),before);
    assert.equal(b.api.settings(b.context).featureOverrides.structureEnabled,'off');
});

test('a complete legacy all-Off weight map stays Off when new families are introduced',()=>{
    const b=boot({schemaVersion:171,autopilotEnabled:true,structureWeights:Object.fromEntries(legacy.map(id=>[id,0]))});
    const s=b.api.settings(b.context);
    for(const id of [...legacy,...added])assert.equal(s.structureWeights[id],0,'Unexpected re-enabled family: '+id);
    assert.equal(b.api.effective(s,'structureEnabled'),false);assert.equal(b.api.packet(b.context,true).structure,null);
    const before=plain(s.structureWeights);b.api.settings(b.context);b.api.applyPreset(b.context,'balanced');
    assert.deepEqual(plain(b.api.settings(b.context).structureWeights),before);
});

test('partial legacy maps and explicitly saved new values migrate without losing user choices',()=>{
    const b=boot({schemaVersion:171,structureWeights:{time:0,domino:1,resume:0,revision:3}});
    const s=b.api.settings(b.context);
    assert.equal(s.structureWeights.time,0);assert.equal(s.structureWeights.domino,1);
    assert.equal(s.structureWeights.resume,0);assert.equal(s.structureWeights.revision,3);
    assert.equal(s.structureWeights.discovery,b.api.families.discovery.weight);
    const before=plain(s.structureWeights);b.api.settings(b.context);
    assert.deepEqual(plain(s.structureWeights),before,'Repeated normalization must be idempotent');
});

test('new families obey master, operating-mode, feature and influence Off controls',async()=>{
    for(const options of [{enabled:false},{mode:'off'},{featureOverrides:{structureEnabled:'off'}},{structureInfluence:0}]){
        const b=selectFamily('resume',{autopilotEnabled:true,...options});
        assert.equal(b.api.structural(b.context,true),null);
        await prepare(b);
        assert.doesNotMatch(b.injections.at(-1)[1],/^Form:|^Transition:/m);
    }
});

test('family weights affect selection while disabled families remain absent',()=>{
    const b=boot({structureEnabled:true,structureInfluence:65,beatDensity:100,structureGrounding:0,structureAntiRepeat:false},[],901);
    b.api.settings(b.context).structureWeights=weights(b.api.families,{domino:3,dialogue:1});
    const counts={domino:0,dialogue:0};
    for(let i=0;i<500;i++){
        const id=b.api.structural(b.context,true).familyId;
        assert.ok(id==='domino'||id==='dialogue');counts[id]++;
    }
    assert.ok(counts.dialogue>0);assert.ok(counts.domino>counts.dialogue*2,JSON.stringify(counts));
});

test('recent family selection is discouraged without being excluded',()=>{
    function sample(recent){
        const b=boot({structureEnabled:true,structureInfluence:65,beatDensity:100,structureGrounding:0,structureAntiRepeat:true},[],8675309);
        b.api.settings(b.context).structureWeights=weights(b.api.families,{domino:3,dialogue:3});
        if(recent)b.api.structureHistory.set(b.api.key(b.context),[{family:'domino',signature:'previous arrangement'}]);
        let count=0;
        for(let i=0;i<500;i++)if(b.api.structural(b.context,true).familyId==='domino')count++;
        return count;
    }
    const ordinary=sample(false),recent=sample(true);
    assert.ok(recent>0,'Soft recency must keep recently used families selectable');
    assert.ok(recent<ordinary*.75,'Recent='+recent+', ordinary='+ordinary);
    const b=selectFamily('resume');
    b.api.structureHistory.set(b.api.key(b.context),[{family:'resume',signature:'previous arrangement'}]);
    for(let i=0;i<30;i++)assert.equal(b.api.structural(b.context,true).familyId,'resume');
});

test('preview and partial replies do not consume new-family history or learned associations',async()=>{
    const b=selectFamily('resume',{feedbackObserverEnabled:true},[a('A quiet room.')]);
    const key=b.api.key(b.context),history=()=>plain(b.api.structureHistory.get(key)||[]);
    b.api.packet(b.context,true);assert.deepEqual(history(),[]);
    const run=await prepare(b);assert.deepEqual(history(),[]);
    attachReply(b,run,'Bonnie moved the teapot.');finish(b,run);
    assert.equal(history().length,1);assert.equal(history()[0].family,'resume');
    assert.equal(b.api.state(b.context).outcomes.length,1);assert.equal(b.api.state(b.context).outcomes[0].family,'resume');
    const committed=history();b.api.packet(b.context,true);assert.deepEqual(history(),committed);
    const stopped=await prepare(b);attachReply(b,stopped,'Bonnie began');b.events.emit('GENERATION_STOPPED');finish(b,stopped);
    assert.deepEqual(history(),committed);assert.equal(b.api.state(b.context).outcomes.length,1);
});

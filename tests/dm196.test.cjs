'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,assistant:a,user:u,texted}=require('./harness.cjs');

const shipped=(o={},...rest)=>boot({cadence:undefined,...o},...rest);
function session(opts,steps,seed){
    const b=shipped(opts,[...texted()],seed),events=[];
    for(let i=0;i<steps;i++){
        const p=b.api.packet(b.context,false);if(p.directive==='break')events.push({...p.creative.disruption,prompt:p.prompt});
        b.context.chat.push(u('I wait.'),a('Bonnie answered.'));
    }
    return {b,events};
}

test('under cadence the DM table replaces the escalating Break pool',()=>{
    const {events}=session({autopilotEnabled:true,disruption:'max'},600,1);
    assert.ok(events.length>40);
    for(const e of events){
        assert.doesNotMatch(e.prompt,/^Break:/m);
        assert.match(e.prompt,/^(?:Event \((?:minor|notable|major)\)|Payoff|Linger): \S/m,e.prompt);
    }
    const kinds=new Set(events.map(e=>e.kind));
    for(const k of ['minor','complication','opportunity','major','payoff','linger'])assert.ok(kinds.has(k),'never rolled '+k);
});

test('minor texture is the most common result and majors stay rare',()=>{
    const {events}=session({autopilotEnabled:true},1200,2),share=k=>events.filter(e=>e.kind===k).length/events.length;
    assert.ok(share('minor')>.35,'minor '+share('minor'));
    assert.ok(share('major')<.15,'major '+share('major'));
    assert.ok(share('payoff')+share('linger')>.06,'release '+(share('payoff')+share('linger')));
    const low=session({autopilotEnabled:true,disruption:'low'},800,2).events;
    assert.ok(!low.some(e=>e.kind==='major'),'low never rolls a major');
});

test('heat turns the table toward payoff and lingering, and blocks new majors while warm',()=>{
    const {scope}=shipped();
    const cool=scope.sceDmTable('high',0),warm=scope.sceDmTable('high',1.2),hot=scope.sceDmTable('high',3);
    assert.equal(cool.payoff+cool.linger,0);assert.ok(cool.major>0);
    assert.ok(warm.payoff+warm.linger>.3&&warm.major===0);
    assert.ok(hot.payoff+hot.linger>=.79&&hot.major===0);
    assert.ok(Math.abs(Object.values(cool).reduce((x,y)=>x+y,0)-1)<1e-9,'the cool table is a full distribution; warmer ones are normalized by the pick');
    assert.ok(Math.abs(cool.complication-cool.opportunity)<1e-9,'complications and opportunities are even');
});

test('heat rises with notable and major results, falls with release and fades over replies, and rolls back for swipes',()=>{
    const b=shipped();const {scope}=b;const key=scope.sceDmState(b.context);
    scope.sceDmCommit(key,2,{kind:'major'});scope.sceDmCommit(key,4,{kind:'complication'});
    assert.ok(Math.abs(scope.sceDmHeat(key,4)-1.9)<1e-9);
    assert.ok(Math.abs(scope.sceDmHeat(key,5)-2.85)<1e-9);
    assert.ok(scope.sceDmHeat(key,40)<scope.sceDmHeat(key,10));
    scope.sceDmCommit(key,6,{kind:'payoff'});assert.ok(scope.sceDmHeat(key,7)<1);
    scope.sceDmCommit(key,4,null);
    assert.ok(Math.abs(scope.sceDmHeat(key,5)-1.85)<1e-9,'re-deciding position 4 drops it and everything after');
});

test('disruption off means no DM events; every-reply cadence keeps the classic Break pool',()=>{
    const {events}=session({autopilotEnabled:true,disruption:'off'},300,3);assert.equal(events.length,0);
    const b=shipped({cadence:'every',disruption:'max'},[...texted()],3);let breaks=0;
    for(let i=0;i<20;i++){const p=b.api.packet(b.context,false).prompt;if(/^Break:/m.test(p))breaks++;assert.doesNotMatch(p,/^(?:Event|Payoff|Linger)/m);}
    assert.ok(breaks>10);
});

test('under cadence the structure keeps its lingering forms and drops the escalation bias',()=>{
    const count=opts=>{const b=shipped({structureEnabled:true,disruption:'max',...opts},[...texted()],5),c={};
        for(let i=0;i<400;i++){const f=b.api.packet(b.context,true).structure?.familyId;if(f)c[f]=(c[f]||0)+1;}return c;};
    const dm=count({}),classic=count({cadence:'every'});
    assert.ok(!dm.reversal,'no hard reversals under the DM');
    const share=c=>((c.sustained||0)+(c.zoom||0))/Object.values(c).reduce((x,y)=>x+y,0);
    assert.ok(share(dm)>2*share(classic),JSON.stringify({dm,classic}));
});

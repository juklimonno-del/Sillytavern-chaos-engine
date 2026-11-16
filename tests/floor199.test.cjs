'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,assistant:a,user:u}=require('./harness.cjs');

// Shipped defaults: cadence about 1 in 4 and a five-paragraph floor (the harness pins older suites to no floor).
const shipped=(o={},chat=[],seed)=>boot({cadence:undefined,minParagraphs:undefined,disruption:'high',...o},chat,seed);
const chatOf=(...replies)=>replies.flatMap((r,i)=>i?[u('I stay '+i),r]:[r]);
const para=(i,n)=>'Paragraph '+i+' of the reply, where '+'the rain keeps on against the glass and '.repeat(n)+'nobody moves.';
const reply=(paragraphs,size=2,end='She waited.')=>a(Array.from({length:paragraphs},(_,i)=>para(i,size)).join('\n\n')+' '+end);
const changes=(b,n=120)=>{const out=new Set();for(let i=0;i<n;i++){const t=b.api.packet(b.context,true).prompt.match(/^Change: (.+)$/m)?.[1];if(t)out.add(t);}return out;};
const CLOSES=['She waited.','The clock ticked.','A door slammed.','"Well?"'];

test('the floor defaults to 5 for new and existing settings and is clamped',()=>{
    for(const o of [{},{schemaVersion:171},{cadence:'half'}]){const b=shipped(o);assert.equal(b.api.settings(b.context).minParagraphs,5);}
    for(const [v,want] of [[0,0],[7,7],[99,12],[-3,0],['6',6],['many',5],[4.6,5]]){
        const b=shipped({minParagraphs:v});assert.equal(b.api.settings(b.context).minParagraphs,want,String(v));}
});

test('a reply under the floor is answered first with an at-least instruction',()=>{
    const b=shipped({},chatOf(reply(6),reply(7),reply(5),reply(3)),1);
    assert.deepEqual([...changes(b)],['Write this reply in at least 5 paragraphs.']);
    const st=b.scope.sceDmState(b.context),shape=b.scope.sceShapeWatch({...b.context,_sceSettings:b.api.settings(b.context)},'normal',false,st.shapeStats);
    assert.equal(shape.trait,'floor');assert.equal(shape.from,3);assert.equal(shape.min,5);
});

test('with the floor on, changes never ask for fewer paragraphs or a shorter reply',()=>{
    const b=shipped({},chatOf(...[0,1,2,3].map(i=>reply(5,2,CLOSES[i]))),2);
    const seen=changes(b,300);
    assert.ok(seen.size>0);
    for(const x of seen){
        const n=x.match(/^Write this reply in (\d+) paragraphs?\.$/);if(n)assert.ok(Number(n[1])>=5&&Number(n[1])!==5,x);
        assert.doesNotMatch(x,/Keep this reply under/,x);
        const w=x.match(/^Let this reply run to about (\d+) words\.$/);if(w)assert.ok(Number(w[1])>=350,x);
    }
    assert.ok([...seen].some(x=>/^Write this reply in [6-8] paragraphs\.$/.test(x)),[...seen].join(' | '));
    const long=shipped({},chatOf(...[0,1,2,3].map(i=>reply(6,12,CLOSES[i]))),3);
    for(const x of changes(long,300))assert.doesNotMatch(x,/Keep this reply under|in [1-4] paragraphs?\./,x);
});

test('an at-least instruction counts as followed only when the reply reaches the floor',async()=>{
    const b=shipped({},chatOf(reply(6),reply(7),reply(5),reply(3)),4);b.scope.sceDmCommand('on');
    b.context.chat.push(u('Go.'));await prepare(b);
    b.context.chat.push(reply(4));b.context.chat.push(u('Go.'));await prepare(b);
    let stats=b.context.chatMetadata.storyChaosEngineDm.shapeStats.floor;assert.deepEqual({...stats},{sent:1,followed:0});
    b.context.chat.push(reply(6));b.context.chat.push(u('Go.'));await prepare(b);
    stats=b.context.chatMetadata.storyChaosEngineDm.shapeStats.floor;assert.deepEqual({...stats},{sent:2,followed:1});
});

test('a floor of 0 restores the unbounded changes',()=>{
    const b=shipped({minParagraphs:0},chatOf(...[0,1,2,3].map(i=>reply(5,2,CLOSES[i]))),5);
    assert.ok([...changes(b,300)].some(x=>/^Write this reply in [1-4] paragraphs?\.$/.test(x)));
});

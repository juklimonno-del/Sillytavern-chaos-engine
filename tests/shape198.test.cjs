'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {boot,prepare,assistant:a,user:u}=require('./harness.cjs');

const plain=x=>JSON.parse(JSON.stringify(x));
const PACKET='story_chaos_engine_auto';
const last=(b,id)=>b.injections.filter(x=>x[0]===id).at(-1);
const filler=n=>Array.from({length:n},(_,i)=>'She moved the glass '+(i+1)+' inches across the bar.').join(' ');
// The classic RP skeleton: action, line, interior, line, a question for the user. Five paragraphs, about 200 words.
// Closings vary so the closing-wording watch stays out of the way.
const CLOSES=['The clock ticked over the shelf. "Will you?"','Outside, a car door slammed twice. "Are you staying, then?"',
    'Her ring tapped the wood. "Another round before the door?"','The radio found a new song. "Is that a yes?"','Someone laughed in the back. "Do you even want to go?"'];
const fivePara=i=>a(filler(8)+'\n\n"Stay a while," Nora said. "The rain will not stop for you."\n\n'+filler(8)+
    '\n\n"I mean it," she said, softer now.\n\n'+filler(2)+' '+CLOSES[i%5]);
const chatOf=(...replies)=>replies.flatMap((r,i)=>i?[u('I stay '+i),r]:[r]);
const shipped=(o={},chat=[],seed)=>boot({cadence:undefined,disruption:'high',...o},chat,seed);
const changes=(b,n=60)=>{const out=[];for(let i=0;i<n;i++){const t=b.api.packet(b.context,true).prompt.match(/^Change: (.+)$/m)?.[1];if(t)out.push(t);}return out;};

test('a reply skeleton reads paragraphs, length, beats, opening and close',()=>{
    const {scope}=shipped();
    const sk=scope.sceSkeleton(fivePara(0).mes);
    assert.deepEqual(plain({p:sk.paragraphs,l:sk.length,seq:sk.sequence,close:sk.close}),{p:5,l:2,seq:'NDNDN',close:'question'});
    assert.equal(scope.sceSkeleton('One line.\nAnother line.\n"Third?"').paragraphs,3,'single newlines split when there are no blank lines');
    assert.equal(scope.sceSkeleton('He left. "Fine."').close,'speech');
    assert.equal(scope.sceSkeleton('"Fine," he said, and left.').close,'action');
    assert.equal(scope.sceSkeleton(filler(60)).length,4);
});

test('the same five-paragraph shape draws concrete, numbered changes',()=>{
    const b=shipped({},chatOf(fivePara(0),fivePara(1),fivePara(2),fivePara(3)),2);
    const seen=new Set(changes(b,200));
    assert.ok(seen.has('Write this reply in 2 paragraphs.'),[...seen].join(' | '));
    assert.ok(seen.has('End without a question.'));
    assert.ok([...seen].some(x=>/^Keep this reply under \d+ words\.$/.test(x)));
    assert.ok(seen.has('Keep the dialogue together in one stretch instead of alternating it with narration.'));
    const n=Number([...seen].find(x=>/^Keep this reply under/.test(x)).match(/\d+/)[0]);assert.ok(n>=80&&n<=120,'about half the usual length: '+n);
    for(const x of seen)assert.doesNotMatch(x,/Write this reply in 5 paragraphs/,'never asks for the shape it is breaking');
});

test('short replies of the same length are asked to run longer, single paragraphs to open up',()=>{
    const short=i=>a('Nora shrugged and poured another. '+'It was late. '.repeat(i%2+1));
    const b=shipped({},chatOf(short(0),short(1),short(2),short(3)),3);
    const seen=new Set(changes(b,200));
    assert.ok([...seen].some(x=>/^Let this reply run to about \d+ words\.$/.test(x)),[...seen].join(' | '));
    assert.ok(seen.has('Write this reply in 3 paragraphs.'));
});

test('corrections ride quiet turns, one line at most, without counting as the DM directive',()=>{
    const b=shipped({autopilotEnabled:true},chatOf(fivePara(0),fivePara(1),fivePara(2),fivePara(3)),5);
    let quietWithChange=0;
    for(let i=0;i<40;i++){
        const p=b.api.packet(b.context,false);
        assert.ok((p.prompt.match(/^(?:Change|Recurring close|Repeated closing wording)/gm)||[]).length<=1,p.prompt);
        if(p.quiet&&/^Change: /m.test(p.prompt)){quietWithChange++;assert.doesNotMatch(p.prompt,/^(?:Event|Payoff|Linger|Form|Lens|Break)/m);}
        b.context.chat.push(u('I stay.'),fivePara(i));
    }
    assert.ok(quietWithChange>10,'quiet turns still correct a repeated shape: '+quietWithChange);
});

test('each change is checked against the next reply and the follow rate steers what is asked',async()=>{
    const b=shipped({},chatOf(fivePara(0),fivePara(1),fivePara(2),fivePara(3)),6);
    // Twelve replies that keep the exact shape: every change goes unfollowed.
    for(let i=0;i<12;i++){b.context.chat.push(u('Go.'));await prepare(b);b.context.chat.push(fivePara(i));}
    b.context.chat.push(u('Go.'));await prepare(b);
    const st=b.context.chatMetadata.storyChaosEngineDm,stats=Object.values(st.shapeStats);
    assert.ok(stats.reduce((n,x)=>n+x.sent,0)>=10);assert.equal(stats.reduce((n,x)=>n+x.followed,0),0);
    // A reply that breaks the repeated value counts as followed.
    const pending=st.shapes.at(-1);
    // One line of mostly speech: different paragraph count, length, beats, opening, close and speech share.
    b.context.chat.push(a('"Go," she said. "Now, before I change my mind."'));b.context.chat.push(u('Go.'));await prepare(b);
    const after=b.context.chatMetadata.storyChaosEngineDm.shapeStats[pending.trait];assert.equal(after.followed,1,pending.trait);
    const {scope}=b;
    assert.ok(scope.sceShapeFollowRate({paragraphs:{sent:10,followed:9}},'paragraphs')>scope.sceShapeFollowRate({paragraphs:{sent:10,followed:0}},'paragraphs'));
    assert.equal(scope.sceShapeFollowRate({},'length'),.5,'untried changes start even');
    assert.match(scope.sceDmCommand('status'),/shape changes followed 1\/\d+\.$/);
});

test('swipes drop pending checks for their own reply, and damaged shape state is cleaned',()=>{
    const b=shipped();const {scope}=b;
    const st=scope.sceDmState(b.context);
    scope.sceShapeCommit(st,3,{trait:'paragraphs',from:5});scope.sceShapeCommit(st,5,{trait:'length',from:2});
    scope.sceShapeEvaluate(st,[],{},5);
    assert.deepEqual(plain(st.shapes.map(x=>x.pos)),[3]);
    b.context.chatMetadata.storyChaosEngineDm={enabled:true,shapes:[{pos:1,trait:'paragraphs',from:4},{pos:2,trait:'vibes',from:1},{pos:'3',trait:'length',from:2},{pos:4,trait:'length',from:{}}],
        shapeStats:{paragraphs:{sent:3,followed:9},length:{sent:-2,followed:1},vibes:{sent:1,followed:1}}};
    const clean=scope.sceDmState(b.context);
    assert.deepEqual(plain(clean.shapes),[{pos:1,trait:'paragraphs',from:4,done:false}]);
    assert.deepEqual(plain(clean.shapeStats),{paragraphs:{sent:3,followed:3},length:{sent:0,followed:0}});
});

test('forms are demoted: the DM event and lenses are picked far more often than a form',()=>{
    const b=shipped({autopilotEnabled:true});const c={};
    for(let i=0;i<600;i++){const p=b.api.packet(b.context,true);c[p.directive]=(c[p.directive]||0)+1;}
    assert.ok(c.form>0&&c.form*4<c.break,JSON.stringify(c));
});

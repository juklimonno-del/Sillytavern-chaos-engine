const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const reply = (mes) => ({is_user:false, mes});
const user = (mes) => ({is_user:true, mes});
const messages = [
    reply('*Bonnie leaned across the table, carefully texting her friend about the café.*'),
    user('I picked up my glass.'),
    reply('*After the conversation, Bonnie sent another message before putting her phone down.*'),
    user('I looked toward the door.'),
    reply('*Bonnie hesitated. Then she typed out a text to her friend.*'),
    user('I asked what she wanted.'),
    reply('*Before things settled, Bonnie messaged somebody under the table.*'),
    user('I shrugged.'),
];

function testDOM() {
    const nodes = new Map();
    const node = () => ({
        innerHTML:'',value:'',textContent:'',hidden:false,checked:false,className:'',
        children:[],handlers:{},
        appendChild(child){this.children.push(child);},
        addEventListener(k,handler){this.handlers[k]=handler;},
        querySelector(sel) {
            if(sel==='details > div')return this;
            if(!nodes.has(sel))nodes.set(sel,node());
            return nodes.get(sel);
        },
    });
    const root = node();
    return {root,nodes,readyState:'complete',createElement:node,
        getElementById(id){return id==='extensions_settings'?root:null;}};
}

function boot(opts={}, chat=messages, ui=false) {
    const injected=[], registered=[];
    const context={
        chatId:'ending-fixture',
        chat:chat.map(m=>({...m})),
        extensionSettings:{storyChaosEngine:{...opts}},
        setExtensionPrompt(...args){injected.push(args);},
        registerFunctionTool(t){registered.push(t);},
        unregisterFunctionTool(){},
        saveSettingsDebounced(){},
    };
    const document=ui?testDOM():{readyState:'complete',getElementById(){return null;}};
    const scope={
        SillyTavern:{getContext:()=>context},
        crypto:webcrypto,Uint32Array,Intl,document,
        console:{log(){},debug(){},info(){},warn(){},error(){}},
    };
    scope.globalThis=scope;
    vm.runInNewContext(source + '\nglobalThis.__endingTest = {'+
        'watch:sceEndingWatch,motifs:sceEndingMotifs,format:sceFormatEndingWatch,'+
        'settings:sceSettings,report:sceFeedbackReportText' +
        '};',scope,{filename:'index.js'});
    return {context,scope,document,injected,registered,t:scope.__endingTest};
}
async function next(b, type='normal') {
    await b.scope.storyChaosEngineInterceptor([],8192,()=>{},type);
    return b.injected.at(-1)?.[1];
}

test('closing watch is disabled on upgrade unless explicitly enabled',async()=>{
    const b=boot({structureEnabled:true,structureInfluence:80});
    const prompt=await next(b);
    assert.equal(b.t.settings(b.context).endingWatchEnabled,false);
    assert.match(prompt,/\[STRUCTURAL ENTROPY:/);
    assert.doesNotMatch(prompt,/\[ENDING-PATTERN WATCH:/);
    assert.equal(b.registered.length,0);
    assert.equal(b.injected.length,1);
    assert.equal(b.injected[0][3],0);
    assert.equal(b.injected[0][5],1);
});

test('repeated Bonnie messages produce an actor-specific ending-motif cue',async()=>{
    const b=boot({endingWatchEnabled:true,endingWatchStrength:85,
        endingWatchWindow:8,endingWatchMinimum:3,structureEnabled:true,structureInfluence:92});
    const observed=b.t.watch(b.context);
    assert.equal(observed.key,'actor:bonnie:messaging');
    assert.equal(observed.count,4);
    assert.equal(observed.recent,3);
    assert.equal(observed.total,4);
    const prompt=await next(b);
    assert.match(prompt,/Bonnie \+ text or message activity \(4 of 4/);
    assert.match(prompt,/\[ENDING-PATTERN WATCH:/);
    assert.match(prompt,/Strong execution:/);
    assert.equal(b.injected.length,1);
    assert.equal(b.registered.length,0);
});

test('watch handles completely different recurring activity by the same method',()=>{
    const chat=[
        reply('Clara hugged her friend by the counter.'),
        reply('She thanked him. Clara embraced her friend in the hallway.'),
        reply('Clara hugged her friend again.'),
        reply('Clara gave her friend a hug after the argument.'),
    ];
    const b=boot({endingWatchEnabled:true,endingWatchMinimum:3,endingWatchWindow:8},chat);
    const seen=b.t.watch(b.context);
    assert.equal(seen.group,'embracing');
    assert.equal(seen.count,4);
    assert.ok(seen.label.includes('Clara'));
});

test('no response pattern below threshold is injected',async()=>{
    const b=boot({endingWatchEnabled:true,endingWatchMinimum:4},[
        reply('Bonnie sent a text.'),
        reply('Clara drank a glass of water.'),
        reply('Bonnie messaged a friend.'),
        reply('Clara hugged a relative.'),
    ]);
    assert.equal(b.t.watch(b.context),null);
    assert.doesNotMatch(await next(b),/\[ENDING-PATTERN WATCH:/);
});

test('repetition must remain recent, not only occur early in window',()=>{
    const b=boot({endingWatchEnabled:true,endingWatchMinimum:3,endingWatchWindow:8},[
        reply('Bonnie sent a text.'),
        reply('Bonnie texted somebody.'),
        reply('Bonnie messaged her friend.'),
        reply('Clara hugged a friend.'),
        reply('Clara laughed.'),
        reply('Clara walked away.'),
        reply('Clara drank coffee.'),
        reply('Clara opened the window.'),
    ]);
    const observed=b.t.watch(b.context);
    assert.equal(observed,null);
});

test('if the latest user turn explicitly requests texting, do not suppress it',async()=>{
    const b=boot({endingWatchEnabled:true},[
        reply('Bonnie sent a text.'),
        reply('Bonnie texted a friend.'),
        reply('Bonnie messaged somebody.'),
        reply('Bonnie sent another message.'),
        user('I ask Bonnie to send another text to her friend now.'),
    ]);
    assert.equal(b.t.watch(b.context),null);
    assert.doesNotMatch(await next(b),/\[ENDING-PATTERN WATCH:/);
});

test('unrelated message-reading does not require a fixed biased verdict',()=>{
    const b=boot({endingWatchEnabled:true},[
        reply('Bonnie reads a message on the screen.'),
        reply('Bonnie reads another message.'),
        reply('Bonnie reads a third message.'),
        reply('Bonnie reads the latest message.'),
    ]);
    const result=b.t.watch(b.context);
    if(result) assert.equal(result.kind,'activity'); // It's a lexical feature, not a semantic action claim.
});

test('strength zero disables prompt hints even when patterns recur',async()=>{
    const b=boot({endingWatchEnabled:true,endingWatchStrength:0});
    assert.equal(b.t.watch(b.context),null);
    assert.doesNotMatch(await next(b),/\[ENDING-PATTERN WATCH:/);
});

test('swipe excludes discarded final assistant reply from observed window',()=>{
    const b=boot({endingWatchEnabled:true,endingWatchMinimum:3},[
        reply('Clara walked away.'),
        reply('Clara walked away.'),
        reply('Clara hugged a friend.'),
        reply('Clara walked away.'),
    ]);
    assert.ok(b.t.watch(b.context,'normal'));
    assert.equal(b.t.watch(b.context,'swipe'),null);
});

test('no raw story is sent to any extra API',async()=>{
    const b=boot({endingWatchEnabled:true},messages);
    const raw=JSON.stringify(b.context.chat);
    await next(b);
    assert.equal(JSON.stringify(b.context.chat),raw);
    assert.equal(b.registered.length,0);
    assert.equal(b.injected.length,1);
});

test('generic lexical fallback can find non-catalogue recurring phrases',()=>{
    const words='The enchanted teacup wobbled violently.';
    const b=boot({endingWatchEnabled:true,endingWatchMinimum:3},[
        reply(words),reply(words),reply(words),reply(words),
    ]);
    const detected=b.t.watch(b.context);
    assert.ok(detected);
    assert.equal(detected.kind,'phrase');
    assert.ok(detected.count>=3);
});

test('analysis report exposes counts without pretending to understand plot semantics',()=>{
    const b=boot({endingWatchEnabled:true});
    const report=b.t.report(b.context);
    assert.match(report,/CLOSING-BEAT WATCH/);
    assert.match(report,/Bonnie \+ text or message activity \(4\/4\)/);
    assert.match(report,/lexical action and phrase recurrence/);
});

test('settings UI exposes enabling, strength, window and thresholds',()=>{
    const b=boot({},messages,true);
    const panel=b.document.root.children[0];
    const feedback=panel.children.find(x=>x.className==='sce_feedback_section');
    assert.ok(feedback);
    assert.match(feedback.innerHTML,/sce_ending_enable/);
    assert.match(feedback.innerHTML,/sce_ending_strength/);
    assert.match(feedback.innerHTML,/sce_ending_window/);
    assert.match(feedback.innerHTML,/sce_ending_minimum/);
    const el=id=>b.document.nodes.get('#sce_'+id);
    const check=el('ending_enable');
    check.checked=true;check.handlers.change({target:check});
    const strength=el('ending_strength');
    strength.value='92';strength.handlers.input({target:strength});
    const win=el('ending_window');
    win.value='16';win.handlers.change({target:win});
    const min=el('ending_minimum');
    min.value='4';min.handlers.change({target:min});
    const conf=b.context.extensionSettings.storyChaosEngine;
    assert.equal(conf.endingWatchEnabled,true);
    assert.equal(conf.endingWatchStrength,92);
    assert.equal(conf.endingWatchWindow,16);
    assert.equal(conf.endingWatchMinimum,4);
    assert.equal(b.registered.length,0);
});

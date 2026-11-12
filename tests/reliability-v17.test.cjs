const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
const reply=mes=>({is_user:false,mes});
const user=mes=>({is_user:true,mes});

function boot(opts={}, messages=[], withUI=false) {
    const handlers=new Map(), injected=[], notices=[];
    const eventTypes={CHARACTER_MESSAGE_RENDERED:'rendered',
        GENERATION_STOPPED:'stopped',CHAT_CHANGED:'changed'};
    const eventSource={
        on(name,cb){if(!handlers.has(name)) handlers.set(name,new Set());handlers.get(name).add(cb);},
        removeListener(name,cb){handlers.get(name)?.delete(cb);},
        emit(name,...args){for(const cb of (handlers.get(name)||[]))cb(...args);}
    };
    const domNodes=new Map();
    const node=()=>({innerHTML:'',className:'',textContent:'',value:'',checked:false,
        hidden:false,dataset:{},children:[],handlers:{},
        appendChild(child){this.children.push(child);},
        addEventListener(name,cb){this.handlers[name]=cb;},
        querySelector(sel){if(sel==='details > div')return this;
            if(!domNodes.has(sel))domNodes.set(sel,node());
            return domNodes.get(sel);}
    });
    const root=node();
    const doc={readyState:'complete',createElement:node,
        getElementById(id){if(id==='extensions_settings')return withUI?root:null;
            if(id==='sce_run_receipt'&&withUI)return domNodes.get('#sce_run_receipt')||null;
            return null;}};
    const context={chatId:'v17-chat',characterId:3,chat:messages.map(x=>({...x})),
        extensionSettings:{storyChaosEngine:{...opts}},
        setExtensionPrompt(...args){injected.push(args);},
        saveSettingsDebounced(){},eventTypes,eventSource};
    const scope={SillyTavern:{getContext:()=>context},crypto:webcrypto,
        Uint32Array,Intl,document:doc,toastr:{info(...a){notices.push(a);}},
        console:{info(){},warn(){},debug(){},error(){}},};
    scope.globalThis=scope;
    vm.runInNewContext(source+'\nglobalThis.__v17={story:sceStoryText, index:sceWordIndex,'+
        'watch:sceEndingWatch,motifs:sceEndingMotifs,receipt:sceRunReceipt,'+
        'settings:sceSettings,init:sceInit};',scope,{filename:'index.js'});
    return {context,scope,eventSource,injected,notices,domNodes,root,tools:scope.__v17};
}
async function generate(b,kind='normal') {
    await b.scope.storyChaosEngineInterceptor([],8000,()=>{},kind);
    return b.injected.at(-1)?.[1];
}
test('Autopilot is opt-in, preserves existing feature flags',async()=>{
    const b=boot({structureEnabled:false,endingWatchEnabled:false});
    assert.equal(b.tools.settings(b.context).autopilotEnabled,false);
    const prompt=await generate(b);
    assert.doesNotMatch(prompt,/\[STRUCTURAL ENTROPY:/);
    assert.equal(b.tools.settings(b.context).structureEnabled,false);
});
test('Autopilot activates structural sampling without overwriting fine tuning',async()=>{
    const b=boot({autopilotEnabled:true,structureEnabled:false,
        structureWeights:{domino:3},customKeywords:'rooftop, kiwi',
        categoryWeights:{humor:0}});
    const prompt=await generate(b);
    assert.match(prompt,/\[STRUCTURAL ENTROPY:/);
    assert.equal(b.context.extensionSettings.storyChaosEngine.structureEnabled,false);
    assert.equal(b.tools.settings(b.context).categoryWeights.humor,0);
    assert.equal(b.tools.settings(b.context).customKeywords,'rooftop, kiwi');
});
test('existing focus, pacing and wildcard selections are no longer discarded',async()=>{
    const b=boot();
    for(let i=0;i<60;i++)await generate(b);
    const text=b.injected.map(x=>x[1]).join('\n');
    assert.match(text,/Optional focus:/);
    assert.match(text,/Optional pacing:/);
    assert.match(text,/Optional wildcard:/);
});
test('internal blocks are excluded without stripping normal narration',()=>{
    const b=boot();
    const plain=b.tools.story('<tracker>secretxyz</tracker><CoT>hiddenxyz</CoT>*Bonnie laughed.*');
    assert.doesNotMatch(plain,/secretxyz|hiddenxyz/);
    assert.match(plain,/Bonnie laughed/);
});
test('old-message edits with equal character count invalidate context cache',()=>{
    const b=boot({contextScope:'full'},[
        reply('The marble shone.'),user('I watched.'),reply('A vessel tilted.')]);
    const a=b.tools.index(b.context);
    assert.ok(a.options.some(x=>x.value==='marble'));
    b.context.chat[0].mes='The canyon shone.';
    const c=b.tools.index(b.context);
    assert.ok(c.options.some(x=>x.value==='canyon'));
    assert.ok(!c.options.some(x=>x.value==='marble'));
});
test('hidden trackers never become story anchors',()=>{
    const b=boot({contextGravity:100},[
        reply('The room was quiet. <tracker>secretxyz secretxyz secretxyz</tracker>'),
        user('I opened a door.')]);
    const idx=b.tools.index(b.context);
    assert.ok(!idx.options.some(x=>x.value==='secretxyz'));
});
test('reading a message does not count as sending one',()=>{
    const b=boot({endingWatchEnabled:true},[
        reply('Bonnie read a message on the display.'),
        reply('Bonnie read a different message on the display.'),
        reply('Bonnie read an old message on the display.'),
        reply('Bonnie read the latest message on the display.')]);
    const patterns=b.tools.motifs(b.context.chat[3].mes);
    assert.ok(!patterns.some(x=>x.key==='act:messaging'));
});
test('ambiguous sentence actors produce generic cues, not invented attribution',()=>{
    const b=boot({endingWatchEnabled:true},[]);
    const motifs=b.tools.motifs('Clara watched Bonnie while she texted a friend.');
    assert.ok(motifs.some(x=>x.key==='act:messaging'));
    assert.ok(!motifs.some(x=>x.key.startsWith('actor:')));
});
test('a negated latest user instruction does not silence the repetition watch',()=>{
    const b=boot({endingWatchEnabled:true},[
        reply('Bonnie texted her friend.'),reply('Bonnie sent a message.'),
        reply('Bonnie typed a text.'),reply('Bonnie messaged her friend.'),
        user("Don't let Bonnie text anyone again.")]);
    const result=b.tools.watch(b.context);
    assert.equal(result?.group,'messaging');
});
test('a rendered assistant reply completes its matching generation receipt exactly once',async()=>{
    const b=boot({notifyAfterReply:true,structureEnabled:true},[user('I wave.')]);
    await generate(b);
    assert.equal(b.tools.receipt(b.context).state,'prepared');
    b.context.chat.push(reply('Clara waved back and walked to the window.'));
    b.eventSource.emit('rendered',1,'normal');
    assert.equal(b.tools.receipt(b.context).state,'completed');
    assert.equal(b.notices.length,1);
    assert.match(b.notices[0][0],/Guidance sent; reply completed/);
    b.eventSource.emit('rendered',1,'normal');
    assert.equal(b.notices.length,1);
});
test('irrelevant chat events do not falsely certify completion',async()=>{
    const b=boot({},[reply('Prior reply.'),user('I ask a question.')]);
    await generate(b);
    b.eventSource.emit('rendered',0,'first_message');
    assert.equal(b.tools.receipt(b.context).state,'prepared');
    b.eventSource.emit('rendered',0,'normal');
    assert.equal(b.tools.receipt(b.context).state,'prepared');
});
test('stopped generations cannot produce a green completed receipt',async()=>{
    const b=boot({},[user('I ask a question.')]);
    await generate(b);
    b.eventSource.emit('stopped');
    assert.equal(b.tools.receipt(b.context).state,'stopped');
    b.context.chat.push(reply('Late response.'));
    b.eventSource.emit('rendered',1,'normal');
    assert.equal(b.tools.receipt(b.context).state,'stopped');
});
test('prompt injection errors fall back without propagating to the model request',async()=>{
    const b=boot({},[user('Continue.')]);
    b.context.setExtensionPrompt=()=>{throw new Error('bad injection');};
    await assert.doesNotReject(generate(b));
    assert.equal(b.tools.receipt(b.context).state,'error');
    assert.equal(b.notices.length,0);
});
test('completion notices can be disabled while retaining the diagnostic receipt',async()=>{
    const b=boot({notifyAfterReply:false},[user('Go.')]);
    await generate(b);
    b.context.chat.push(reply('An ordinary reply.'));
    b.eventSource.emit('rendered',1,'normal');
    assert.equal(b.notices.length,0);
    assert.equal(b.tools.receipt(b.context).state,'completed');
});
test('quick controls preserve keyword bank and original category weights',()=>{
    const b=boot({customKeywords:'fennel',categoryWeights:{humor:0}},[],true);
    const input=b.domNodes.get('#sce_keywords');
    assert.equal(input.value,'fennel');
    input.value='velvet, lemon';
    input.handlers.input({target:input});
    assert.equal(b.tools.settings(b.context).customKeywords,'velvet, lemon');
    const check=b.domNodes.get('#sce_autopilot');
    check.checked=true;check.handlers.change({target:check});
    assert.equal(b.tools.settings(b.context).autopilotEnabled,true);
    assert.equal(b.tools.settings(b.context).categoryWeights.humor,0);
});
test('explicit preset selection updates safe tuning without rewriting category weights',()=>{
    const b=boot({categoryWeights:{humor:0}},[],true);
    const preset=b.domNodes.get('#sce_preset');
    preset.value='wild';preset.handlers.change({target:preset});
    const settings=b.tools.settings(b.context);
    assert.equal(settings.intensity,90);
    assert.equal(settings.maxLayers,4);
    assert.equal(settings.categoryWeights.humor,0);
});

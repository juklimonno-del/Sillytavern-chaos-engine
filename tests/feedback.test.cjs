const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root,'index.js'),'utf8');

function fakeDocument() {
    const cache=new Map();
    const node=()=>({
        innerHTML:'',textContent:'',value:'',checked:false,hidden:false,className:'',
        children:[],handlers:{},
        appendChild(child){this.children.push(child);},
        addEventListener(type,fn){this.handlers[type]=fn;},
        querySelector(sel){
            if(sel==='details > div')return this;
            if(!cache.has(sel))cache.set(sel,node());
            return cache.get(sel);
        },
    });
    const root=node();
    return {root,cache,createElement:node,readyState:'complete',
        getElementById(id){return id==='extensions_settings'?root:null;}};
}
function boot(options={}, chat=[], panel=false) {
    const messages=chat.map(m=>({...m})), injections=[], registered=[];
    const context={
        chatId:'fixture-one',chat:messages,
        extensionSettings:{storyChaosEngine:{...options}},
        setExtensionPrompt(...args){injections.push(args);},
        registerFunctionTool(tool){registered.push(tool);},
        unregisterFunctionTool(){},
        saveSettingsDebounced(){},
    };
    const doc=panel?fakeDocument():{readyState:'complete',getElementById(){return null;}};
    const scope={
        SillyTavern:{getContext:()=>context},document:doc,
        crypto:webcrypto,Uint32Array,Intl,
        console:{log(){},info(){},warn(){},error(){},debug(){}},
    };
    scope.globalThis=scope;
    const expose = [
        'globalThis.__feedbackTest={',
        'fingerprint:sceFeedbackFingerprint,observe:sceFeedbackObserve,',
        'factors:sceFeedbackFactors,state:sceFeedbackState,',
        'reconcile:sceFeedbackReconcile,report:sceFeedbackReportText,',
        'roll:sceStructuralRoll,settings:sceSettings,pending:sceFeedbackPending',
        '};',
    ].join('');
    vm.runInNewContext(script+'\n'+expose,scope,{filename:'index.js'});
    return {context,scope,doc,injections,registered,fb:scope.__feedbackTest};
}
async function generate(b, kind='normal') {
    await b.scope.storyChaosEngineInterceptor([],4096,()=>{},kind);
    return b.injections.at(-1)?.[1];
}
const reply = (text)=>({is_user:false,mes:text});
const quoted = (n=1)=>{
    return '"The copper kettle waited beneath the wide wooden table, and all the windows were open." '.repeat(n).trim() + '.';
};
const plain = (n=1)=>{
    return 'The copper kettle waited beneath the wide wooden table, and all the windows were open. '.repeat(n).trim();
};

test('observer and balancer are OFF by default with no change to output',async()=>{
    const b=boot({structureEnabled:true},[reply(plain(2)),{is_user:true,mes:'I walked away.'}]);
    const prompt=await generate(b);
    const settings=b.fb.settings(b.context);
    assert.equal(settings.feedbackObserverEnabled,false);
    assert.equal(settings.feedbackBalancerEnabled,false);
    assert.equal(settings.feedbackWindow,8);
    assert.equal(b.registered.length,0);
    assert.match(prompt,/\[STRUCTURAL ENTROPY:/);
    assert.doesNotMatch(prompt,/\[STRUCTURAL FEEDBACK:/);
    assert.equal(b.injections.length,1);
    assert.equal(b.injections[0][3],0);
    assert.equal(b.injections[0][5],1);
});

test('strict assistant-only sampling ignores user, system, and tool turns',()=>{
    const b=boot({feedbackWindow:8},[
        {is_user:true,mes:quoted(2)},
        {is_user:false,is_system:true,mes:quoted(2)},
        {is_user:false,mes:quoted(2),extra:{tool_calls:[{}]}},
        {is_user:false,mes:quoted(2),extra:{type:'narrator'}},
        reply(plain(2)), reply(quoted(2)),
    ]);
    const report=b.fb.observe(b.context);
    assert.equal(report.available,2);
    assert.equal(report.samples.length,2);
    assert.ok(report.meanQuotationPercent>0);
});

test('fingerprints measure text form, not content acceptability or tone',()=>{
    const b=boot();
    const a=b.fb.fingerprint('Their proposal was admirable.\n\n"Yes," she said.');
    const c=b.fb.fingerprint('Their proposal was despicable.\n\n"No," she said.');
    for(const field of ['quotationBand','paragraphShape','endingMark','paragraphs'])
        assert.equal(a[field],c[field]);
    assert.equal(typeof a.signature,'string');
});

test('measurable features count quoted spans, paragraph layouts, and terminal marks',()=>{
    const b=boot();
    const f=b.fb.fingerprint('A brief statement.\n\nA second section with more content?\n\n"Quite right."');
    assert.equal(f.paragraphs,3);
    assert.equal(f.endingMark,'period');
    assert.ok(f.quotationShare>0);
    assert.ok(['single','front-heavy','back-heavy','even','mixed'].includes(f.paragraphShape));
});

test('exact repeated four-word sequences are counted without semantic judgment',()=>{
    const b=boot({feedbackWindow:8},[
        reply('The copper kettle waited under the table.'),
        reply('The copper kettle waited near the window.'),
        reply('Something entirely different happened elsewhere.'),
    ]);
    const result=b.fb.observe(b.context);
    assert.ok(result.sharedFourTokenSequences>=1);
    assert.ok(result.repeatedOpeningReplies>=2);
});

test('response window 4/8/16 changes sample count, never includes user messages',()=>{
    const chat=Array.from({length:22},(_,i)=>
        i%4===0?{is_user:true,mes:'user message'}:reply(plain(2)));
    const b=boot({feedbackWindow:4},chat);
    assert.equal(b.fb.observe(b.context).available,4);
    b.context.extensionSettings.storyChaosEngine.feedbackWindow=8;
    assert.equal(b.fb.observe(b.context).available,8);
    b.context.extensionSettings.storyChaosEngine.feedbackWindow=16;
    assert.equal(b.fb.observe(b.context).available,16);
});

test('balancer declines to infer anything from fewer than four observations',()=>{
    const b=boot({feedbackObserverEnabled:true,feedbackBalancerEnabled:true,structureEnabled:true},
        [reply(quoted(2)),reply(quoted(2)),reply(quoted(2))]);
    const report=b.fb.observe(b.context);
    assert.equal(report.available,3);
    assert.equal(report.dominant.length,0);
    assert.equal(b.fb.factors(b.context,report).ready,false);
});

test('no matched structural outcomes means no probability changes',()=>{
    const b=boot({feedbackObserverEnabled:true,feedbackBalancerEnabled:true,structureEnabled:true},
        Array.from({length:8},()=>reply(quoted(2))));
    const factors=b.fb.factors(b.context,b.fb.observe(b.context));
    assert.equal(factors.ready,false);
    assert.equal(factors.factors.size,0);
});

test('evidence-based adjustments are symmetric, empirical, and content-neutral',()=>{
    const b=boot({feedbackObserverEnabled:true,feedbackBalancerEnabled:true,feedbackStrength:100});
    const state=b.fb.state(b.context);
    // Synthetic *observed* associations; no hardcoded family stereotypes.
    for(let i=0;i<3;i++) {
        state.outcomes.push({family:'sustained',fingerprint:{quotationBand:'over 60%'}});
        state.outcomes.push({family:'dialogue',fingerprint:{quotationBand:'under 20%'}});
    }
    const report={available:8,dominant:[{
        key:'quotationBand',label:'Quotation coverage band',value:'over 60%',count:7,total:8,
    }]};
    let factors=b.fb.factors(b.context,report);
    assert.ok(factors.factors.get('sustained').factor<1);
    assert.ok(factors.factors.get('dialogue').factor>1);
    report.dominant[0].value='under 20%';
    factors=b.fb.factors(b.context,report);
    assert.ok(factors.factors.get('sustained').factor>1);
    assert.ok(factors.factors.get('dialogue').factor<1);
});

test('strength zero or observer disabled produces no feedback multipliers',()=>{
    const b=boot({feedbackObserverEnabled:true,feedbackBalancerEnabled:true,feedbackStrength:0});
    const report={available:8,dominant:[{key:'endingMark',value:'period',count:7,total:8}]};
    assert.equal(b.fb.factors(b.context,report).ready,false);
    b.context.extensionSettings.storyChaosEngine.feedbackStrength=100;
    b.context.extensionSettings.storyChaosEngine.feedbackObserverEnabled=false;
    assert.equal(b.fb.factors(b.context,report).ready,false);
});

test('pending family is paired only with a subsequent assistant reply',async()=>{
    const b=boot({structureEnabled:true,feedbackObserverEnabled:true},
        [{is_user:true,mes:'I moved the teapot.'}]);
    await generate(b);
    const state=b.fb.state(b.context);
    const prior=state.pending?.family;
    assert.ok(prior);
    assert.equal(state.outcomes.length,0);
    b.context.chat.push({is_user:true,mes:'I talked to myself.'});
    b.context.chat.push(reply('She moved the teapot back.'));
    b.context.chat.push({is_user:true,mes:'I looked at the table.'});
    await generate(b);
    assert.equal(state.outcomes.length,1);
    assert.equal(state.outcomes[0].family,prior);
    assert.equal(state.outcomes[0].index,2);
    assert.ok(state.pending);
});

test('edited or swiped replies invalidate old outcome attribution',async()=>{
    const b=boot({structureEnabled:true,feedbackObserverEnabled:true},
        [{is_user:true,mes:'I ask about the key.'}]);
    await generate(b);
    b.context.chat.push(reply('The kettle fell.'));
    b.context.chat.push({is_user:true,mes:'I respond.'});
    await generate(b);
    assert.equal(b.fb.state(b.context).outcomes.length,1);
    b.context.chat[1].mes='A completely revised reply.';
    b.fb.reconcile(b.context);
    assert.equal(b.fb.state(b.context).outcomes.length,0);
    await generate(b,'swipe');
    assert.equal(b.injections.at(-1)[3],0);
});

test('swipe/regenerate observation excludes the reply about to be replaced',()=>{
    const b=boot({feedbackWindow:4},[
        reply(plain()),reply(quoted(4)),
    ]);
    assert.equal(b.fb.observe(b.context,'normal').available,2);
    assert.equal(b.fb.observe(b.context,'swipe').available,1);
    assert.equal(b.fb.observe(b.context,'regenerate').available,1);
});

test('read-only report contains only measurements and no copied story text',()=>{
    const secret='privatefictionwordonlyhere';
    const b=boot({feedbackWindow:8},[reply(
        'The '+secret+' waited beside the table.\n\n"Nobody expected this."'
    )]);
    const report=b.fb.report(b.context);
    assert.match(report,/STRUCTURAL OBSERVER/);
    assert.match(report,/Median paragraphs:/);
    assert.match(report,/A family\/outcome association is observational/);
    assert.doesNotMatch(report,new RegExp(secret));
});

test('settings panel has independent Observer and Balancer controls',()=>{
    const b=boot({structureEnabled:true},[],true);
    const panel=b.doc.root.children[0];
    const feedbackPanel=panel.children.find(x=>x.className==='sce_feedback_section');
    assert.ok(feedbackPanel,'feedback UI exists');
    assert.match(feedbackPanel.innerHTML,/Enable the Observer/);
    assert.match(feedbackPanel.innerHTML,/Enable adaptive Balancer/);
    assert.match(feedbackPanel.innerHTML,/sce_feedback_window/);
    const element=id=>b.doc.cache.get('#sce_'+id);
    const check=element('feedback_observer');
    check.checked=true;check.handlers.change({target:check});
    const balance=element('feedback_balancer');
    balance.checked=true;balance.handlers.change({target:balance});
    const windowSelect=element('feedback_window');
    windowSelect.value='16';windowSelect.handlers.change({target:windowSelect});
    assert.equal(b.context.extensionSettings.storyChaosEngine.feedbackObserverEnabled,true);
    assert.equal(b.context.extensionSettings.storyChaosEngine.feedbackBalancerEnabled,true);
    assert.equal(b.context.extensionSettings.storyChaosEngine.feedbackWindow,16);
    element('feedback_analyze').handlers.click();
    assert.match(element('feedback_report').textContent,/STRUCTURAL OBSERVER/);
    assert.equal(b.injections.length,0);
    assert.equal(b.registered.length,0);
});

test('only existing structural weights affect rolls when feedback lacks evidence',()=>{
    const b=boot({structureEnabled:true,feedbackObserverEnabled:true,feedbackBalancerEnabled:true,
        structureWeights:{sustained:0,domino:0,parallel:3,echo:0,dialogue:0,pivot:0,
            anticlimax:0,mosaic:0,reverse:0,time:0}});
    for(let i=0;i<20;i++) {
        const structure=b.fb.roll(b.context);
        assert.equal(structure.familyId,'parallel');
    }
});


test('read-only factor calculation ignores edited replies before next generation',()=>{
    const b=boot({feedbackObserverEnabled:true,feedbackBalancerEnabled:true,
        feedbackStrength:100},[reply(plain()),reply(plain())]);
    const state=b.fb.state(b.context);
    for(let i=0;i<2;i++) {
        const fp=b.fb.fingerprint(b.context.chat[i]);
        state.outcomes.push({
            family:'sustained',index:i,signature:fp.signature,
            fingerprint:{quotationBand:fp.quotationBand,
                paragraphShape:fp.paragraphShape,endingMark:fp.endingMark},
        });
    }
    const synthetic={available:8,dominant:[
        {key:'endingMark',label:'Terminal punctuation',value:'period',count:8,total:8},
    ]};
    assert.equal(b.fb.factors(b.context,synthetic).ready,true);
    b.context.chat[0].mes='Edited after selection?';
    b.context.chat[1].mes='Edited again!';
    assert.equal(b.fb.factors(b.context,synthetic).ready,false);
});

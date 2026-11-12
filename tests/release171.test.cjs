const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {boot,prepare,attachReply,finish,complete,assistant:a,user:u,texted,source}=require('./harness.cjs');
const obj=x=>JSON.parse(JSON.stringify(x));
const all=(defs,on=[])=>Object.fromEntries(Object.keys(defs).map(k=>[k,on.includes(k)?3:0]));

test('1.7.1 manifest loads the lifecycle entry point and local-only engine',()=>{
    const m=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.json')));
    assert.equal(m.version,'1.7.1');assert.equal(m.js,'entry.js');assert.equal(m.hooks.disable,'onDisable');
    assert.equal(m.generate_interceptor,'storyChaosEngineInterceptor');assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
});
test('existing keyword bank, weights, operating mode and role survive migration',()=>{
    const b=boot({customKeywords:'kiwi, velvet ribbon',categoryWeights:{humor:0},structureWeights:{time:0},mode:'tool',role:'system'});
    const s=b.api.settings(b.context);assert.equal(s.customKeywords,'kiwi, velvet ribbon');assert.equal(s.categoryWeights.humor,0);
    assert.equal(s.structureWeights.time,0);assert.equal(s.mode,'tool');assert.equal(s.role,'system');
});
test('Autopilot activates Auto features without rewriting their saved boolean flags',()=>{
    const b=boot({autopilotEnabled:true,structureEnabled:false});const s=b.api.settings(b.context);
    assert.equal(b.api.on(s,'structureEnabled'),true);assert.equal(s.structureEnabled,false);
});
for(const key of ['structureEnabled','feedbackObserverEnabled','feedbackBalancerEnabled','endingWatchEnabled'])
    test('explicit Off overrides Autopilot for '+key,()=>{
        const b=boot({autopilotEnabled:true,featureOverrides:{[key]:'off'}});assert.equal(b.api.effective(b.api.settings(b.context),key),false);
    });
test('master disable blocks every feature and clears prompt injection',async()=>{
    const b=boot({enabled:false,autopilotEnabled:true});await prepare(b);assert.equal(b.injections.at(-1)[1],'');
    for(const k of ['structureEnabled','feedbackObserverEnabled','feedbackBalancerEnabled','endingWatchEnabled'])assert.equal(b.api.on(b.api.settings(b.context),k),false);
});
test('master enable and Autopilot are independent controls',()=>{
    const b=boot({enabled:true,autopilotEnabled:false,structureEnabled:true});assert.equal(b.api.effective(b.api.settings(b.context),'structureEnabled'),true);
});
test('ordinary defaults display Custom rather than falsely advertising Balanced',()=>{
    const b=boot();assert.equal(b.api.settings(b.context).autopilotPreset,'custom');
});
test('explicit preset application changes tuning but preserves weights and keywords',()=>{
    const b=boot({customKeywords:'kiwi',categoryWeights:{pacing:0},structureWeights:{time:0}});
    assert.equal(b.api.applyPreset(b.context,'balanced'),true);const s=b.api.settings(b.context);
    assert.equal(s.intensity,65);assert.equal(s.structureInfluence,82);assert.equal(s.beatDensity,60);
    assert.equal(s.categoryWeights.pacing,0);assert.equal(s.structureWeights.time,0);assert.equal(s.customKeywords,'kiwi');assert.equal(s.autopilotPreset,'balanced');
    s.intensity=64;assert.equal(b.api.settings(b.context).autopilotPreset,'custom');
});
test('Autopilot alone does not silently overwrite saved tuning',()=>{
    const b=boot({intensity:19,autopilotEnabled:true});assert.equal(b.api.settings(b.context).intensity,19);
});
test('invalid settings and impossible recurrence thresholds normalize together',()=>{
    const b=boot({maxLayers:99,intensity:-4,endingWatchWindow:4,endingWatchMinimum:5});const s=b.api.settings(b.context);
    assert.equal(s.maxLayers,5);assert.equal(s.intensity,0);assert.equal(s.endingWatchMinimum,4);
    b.context.extensionSettings.storyChaosEngine=[];assert.equal(b.api.settings(b.context).mode,'automatic');
});
test('format-constrained traits are not balancing targets by default',()=>{
    const b=boot();assert.deepEqual(obj(b.api.settings(b.context).balanceTraits),{quotationBand:true,paragraphShape:false,endingMark:false});
});
test('legacy callbacks look up the current chat instead of registration-time context',async()=>{
    const b=boot({mode:'tool',keywordBoost:100,customKeywords:'oldword'});assert.equal(b.tools.length,1);
    const next={...b.context,chatId:'new',extensionSettings:{storyChaosEngine:{mode:'tool',keywordBoost:100,customKeywords:'newword'}},chat:[]};
    b.setContext(next);const out=JSON.parse(await b.tools[0].action());assert.ok(out.word_sparks.includes('newword'));assert.ok(!out.word_sparks.includes('oldword'));
    assert.equal(b.api.receipt(next).state,'legacy');
});
test('random integer helper rejects ranges that would loop forever',()=>{const b=boot();assert.throws(()=>b.api.random(0));assert.throws(()=>b.api.random(0x100000001));assert.ok(b.api.random(1000)<1000);});
test('disabling all categories prevents all legacy creative fields and fallback directions',()=>{
    const b=boot();Object.assign(b.api.settings(b.context),{categoryWeights:all(b.api.categories),customKeywords:'',contextGravity:0});
    for(let i=0;i<30;i++){
        const r=b.api.creative(b.context,true);assert.equal(r.layers.length,0);assert.equal(r.word_sparks.length,0);
        assert.equal(r.focus,undefined);assert.equal(r.rhythm,undefined);assert.equal(r.wildcard,undefined);
        assert.equal(b.api.packet(b.context,true).prompt,'');
    }
});
test('keyword-only operation remains available with every category disabled',()=>{
    const b=boot({customKeywords:'kiwi, velvet ribbon',keywordBoost:100});b.api.settings(b.context).categoryWeights=all(b.api.categories);
    const p=b.api.packet(b.context,true);assert.equal(p.creative.layers.length,0);assert.ok(p.creative.word_sparks.length);assert.match(p.prompt,/kiwi|velvet ribbon/);
});
test('disabled pacing and wildcard categories never leak independent instructions',()=>{
    const b=boot({categoryWeights:{pacing:0,wildcard:0},intensity:100,maxLayers:5});
    for(let i=0;i<200;i++){const r=b.api.creative(b.context);assert.ok(!r.layers.some(x=>['pacing','wildcard'].includes(x.id)));assert.equal(r.rhythm,undefined);assert.equal(r.wildcard,undefined);}
});
for(const n of [1,2,3,4,5])test('creative cue budget is honored at '+n+' layers',()=>{
    const b=boot({maxLayers:n,intensity:100});for(let i=0;i<15;i++){const r=b.api.creative(b.context);assert.equal(r.layers.length,n);assert.equal(new Set(r.layers.map(x=>x.id)).size,n);}
});
test('minimum intensity selects one lens rather than a hidden extra set',()=>{const b=boot({intensity:0,maxLayers:5});assert.equal(b.api.creative(b.context).layers.length,1);});
test('direction-only anti-repeat retains six prior directions',()=>{
    const b=boot({intensity:0});b.api.settings(b.context).categoryWeights=all(b.api.categories,['direction']);const recent=[];
    for(let i=0;i<90;i++){const text=b.api.creative(b.context).layers[0].instruction;assert.ok(!recent.includes(text));recent.unshift(text);recent.length=Math.min(6,recent.length);}
});
test('keyword parsing is bounded, deduplicated and stripped of markup',()=>{
    const b=boot();assert.deepEqual(obj(b.api.words('kiwi, kiwi; velvet ribbon\n<x>good</x>')),['kiwi','velvet ribbon','x good x']);
    assert.ok(b.api.words(Array.from({length:100},(_,i)=>'word'+i).join(',')).length<=80);
});
test('context gravity endpoints govern story anchors',()=>{
    const high=boot({contextGravity:100},[a('The porcelain teapot rattled.')]);assert.ok(high.api.creative(high.context).anchor);
    const low=boot({contextGravity:0},[a('The porcelain teapot rattled.')]);assert.equal(low.api.creative(low.context).anchor,null);
});
test('preview includes the same eligible closing-watch section without consuming roll history',()=>{
    const b=boot({autopilotEnabled:true},texted());const before=b.api.structureHistory.size;
    const p=b.api.packet(b.context,true);assert.match(p.prompt,/Recurring close/);assert.equal(b.api.structureHistory.size,before);assert.equal(b.api.cueHistory.size,0);
});
test('the compact packet stays bounded with all features and maximum lenses',()=>{
    const b=boot({autopilotEnabled:true,intensity:100,maxLayers:5,structureInfluence:95,beatDensity:100},texted());
    for(let i=0;i<40;i++){const p=b.api.packet(b.context,true);assert.ok(p.words<=250,'words='+p.words);assert.match(p.prompt,/Preserve continuity/);}
});
test('pacing lenses refine, rather than contradict, selected architecture',()=>{
    const b=boot({structureEnabled:true,intensity:0});b.api.settings(b.context).categoryWeights=all(b.api.categories,['pacing']);
    const p=b.api.packet(b.context,true);assert.equal(p.creative.layers.length,1);assert.match(p.creative.layers[0].instruction,/inside the selected arrangement/);
});
for(const id of ['sustained','domino','parallel','echo','dialogue','pivot','anticlimax','mosaic','reverse','time'])
    test('structural blueprint remains internally consistent for '+id,()=>{
        const b=boot({structureEnabled:true,beatDensity:80});b.api.settings(b.context).structureWeights=all(b.api.families,[id]);
        for(let i=0;i<20;i++){const r=b.api.structural(b.context);assert.equal(r.familyId,id);assert.equal(r.beats.length,r.count);assert.equal(r.attention.length,r.count);assert.ok(r.beats.every(x=>x.role));}
    });
for(const size of [1,2,4,5,10])test('soft structural recency keeps '+size+' enabled families available without a forced cycle',()=>{
    const b=boot({structureEnabled:true}),ids=Object.keys(b.api.families).slice(0,size);b.api.settings(b.context).structureWeights=all(b.api.families,ids);
    const seq=Array.from({length:100},()=>b.api.structural(b.context).familyId);assert.ok(seq.every(x=>ids.includes(x)));
    if(size>1)assert.ok(seq.slice(20).some((x,i)=>x!==seq[i+20-size]),'unexpected repeating period '+size);
});
test('zero influence and zero family weights both disable structure',()=>{
    const b=boot({structureEnabled:true,structureInfluence:0});assert.equal(b.api.structural(b.context),null);
    const s=b.api.settings(b.context);s.structureInfluence=80;s.structureWeights=all(b.api.families);assert.equal(b.api.structural(b.context),null);
});
test('short and nested hidden blocks are removed without removing ordinary prose',()=>{
    const b=boot();const out=b.api.clean('<tracker>secret <think>more</think>hidden</tracker><b>Visible prose.</b>');assert.doesNotMatch(out,/secret|more|hidden/);assert.match(out,/Visible prose/);
});
test('unclosed recognized blocks and comments fail closed',()=>{
    const b=boot();assert.doesNotMatch(b.api.clean('Visible.<tracker>secretword'),/secretword/);assert.doesNotMatch(b.api.clean('Visible.<!-- secretword'),/secretword/);
});
test('long trackers are stripped before context clipping',()=>{
    const b=boot({contextGravity:100},[a('<tracker>'+('secretword '.repeat(1000))+'</tracker>The visible doorway opened.')]);
    const idx=b.api.index(b.context);assert.ok(!idx.options.some(x=>x.value==='secretword'));assert.ok(idx.options.some(x=>x.value==='doorway'));
});
test('custom hidden tag names can be supplied without regular-expression code',()=>{
    const b=boot({hiddenTags:'local_state'},[a('<local_state>secretword</local_state>The window rattled.')]);
    assert.ok(!b.api.index(b.context).options.some(x=>x.value==='secretword'));
});
test('long-response word totals are complete rather than the phrase-sampling cap',()=>{const b=boot();assert.equal(b.api.fp('oak '.repeat(3000)).wordCount,3000);});
test('long single paragraphs do not gain a synthetic paragraph boundary',()=>{const b=boot();assert.equal(b.api.fp('oak '.repeat(5000)).paragraphs,1);});
test('long response fingerprints preserve literal openings and endings',()=>{
    const b=boot(),fp=b.api.fp('These are opening words '+('oak '.repeat(5000))+'these are final words!');
    assert.equal(fp.openingFour,'these are opening words');assert.equal(fp.closingFour,'these are final words');assert.equal(fp.endingMark,'exclamation mark');assert.equal(fp.phrasesSampled,true);
});
test('large quotations are measured as quotations instead of discarded at 1500 characters',()=>{const b=boot();assert.ok(b.api.fp('"'+('spoken '.repeat(500))+'"').quotationShare>.95);});
test('exact phrase samples never bridge a head-tail omission',()=>{
    const b=boot(),words=Array.from({length:4000},(_,i)=>'w'+i),fp=b.api.fp(words.join(' '));assert.ok(!fp.fourGrams.has('w1098 w1099 w2900 w2901'));
});
test('three ASCII periods and Unicode ellipsis share the same punctuation category',()=>{const b=boot();assert.equal(b.api.fp('Wait...').endingMark,'ellipsis');assert.equal(b.api.fp('Wait…').endingMark,'ellipsis');});
test('old same-length message edits invalidate the right record',()=>{
    const b=boot({},[a('The marble shone.'),u('I watched.'),a('A vessel tilted.')]);b.api.index(b.context);b.context.chat[0].mes='The canyon shone.';
    const idx=b.api.index(b.context);assert.ok(idx.options.some(x=>x.value==='canyon'));assert.ok(!idx.options.some(x=>x.value==='marble'));
});
test('unchanged records are not retokenized across repeated index reads',()=>{
    const b=boot({},[a('The kettle rattled.'),a('The teapot tilted.')]);b.api.index(b.context);const n=b.api.counters.tokenizations;
    for(let i=0;i<20;i++)b.api.index(b.context);assert.equal(b.api.counters.tokenizations,n);
});
test('appending one message tokenizes that message, not all existing history',()=>{
    const b=boot({},Array.from({length:40},(_,i)=>a('Object'+i+' rattled beside a table.')));b.api.index(b.context);const n=b.api.counters.records;
    b.context.chat.push(a('The fresh lantern flickered.'));b.api.index(b.context);assert.equal(b.api.counters.records-n,1);
});
test('recent context scope ignores old story vocabulary',()=>{
    const b=boot({contextScope:'recent'},[a('Ancient telescope observatory.'),...Array.from({length:20},()=>a('A ceramic mug rested.'))]);
    assert.ok(!b.api.index(b.context).options.some(x=>x.value==='observatory'));
});
test('per-chat and per-message caches remain bounded across many chats',()=>{
    const b=boot({structureEnabled:true});for(let i=0;i<40;i++){b.context.chatId='chat-'+i;b.context.chat=[a('Lantern number '+i)];b.api.packet(b.context,false);b.api.state(b.context);}
    for(const map of b.api.caches)assert.ok(map.size<=map.limit);
});
test('chat identity separates characters using the same chat filename',()=>{
    const b=boot(),k=b.api.key(b.context);b.context.characters=[{avatar:'different.png',name:'Clara'}];assert.notEqual(b.api.key(b.context),k);
});
for(const text of ['Bonnie read her old texts.','Bonnie never laughed.','Quietly she texted a friend.','Bonnie considered her left hand.'])
    test('lexical detector abstains on '+text,()=>{
        const b=boot();assert.equal(b.api.motifs(text,b.api.actors(b.context)).filter(x=>x.kind==='activity').length,0);
    });
test('ambiguous actor clauses do not invent a specific performer',()=>{
    const b=boot();const motifs=b.api.motifs('Clara watched Bonnie while she texted a friend.',b.api.actors(b.context));assert.ok(!motifs.some(x=>x.specific));
});
test('known simple actors can produce a measured recurring action',()=>{
    const b=boot({endingWatchEnabled:true},texted());const w=b.api.watch(b.context);assert.equal(w?.actor,'Bonnie');assert.equal(w?.group,'messaging');assert.equal(w?.count,4);
});
test('base-form direct requests suppress the matching actor-specific nudge',()=>{
    const b=boot({endingWatchEnabled:true},[...texted(),u('Have Bonnie text Alice now.')]);assert.equal(b.api.watch(b.context),null);
});
test('a request at the start of a long user message is not missed',()=>{
    const b=boot({endingWatchEnabled:true},[...texted(),u('Have Bonnie send a message. '+('The surroundings are quiet. '.repeat(100)))]);assert.equal(b.api.watch(b.context),null);
});
test('requesting Clara to message does not silence Bonnie-specific evidence',()=>{
    const b=boot({endingWatchEnabled:true},[...texted(),u('Have Clara send a message now.')]);assert.equal(b.api.watch(b.context)?.actor,'Bonnie');
});
test('requests to stop drinking do not exempt drinking from repetition checks',()=>{
    const b=boot({endingWatchEnabled:true},['Bonnie drank coffee.','Bonnie sipped water.','Bonnie drank tea.','Bonnie sipped juice.'].map(a).concat(u('Have Bonnie stop drinking.')));
    assert.equal(b.api.watch(b.context)?.group,'drinking');
});
test('negation is local to its action rather than global across user instructions',()=>{
    const b=boot(),requests=b.api.requested('Do not let Bonnie drink. Have Clara send a message.',b.api.actors(b.context),'Bonnie');
    assert.ok(!requests.some(x=>x.group==='drinking'));assert.ok(requests.some(x=>x.actor==='clara'&&x.group==='messaging'));
});
test('story mentions are not automatically treated as user commands',()=>{
    const b=boot();assert.equal(b.api.requested('I watched Bonnie text Alice.',b.api.actors(b.context),'Bonnie').length,0);
});
test('hypothetical and quoted actions do not become confident behavior corrections',()=>{
    const b=boot({endingWatchEnabled:true},Array.from({length:4},()=>a('Bonnie might text her friend.')));assert.equal(b.api.watch(b.context),null);
    const motifs=b.api.motifs('"Bonnie laughed," she said.',b.api.actors(b.context));assert.ok(!motifs.some(x=>x.kind==='activity'&&x.confidence>.7));
});
test('recurrence must still occur in two of the latest three eligible replies',()=>{
    const b=boot({endingWatchEnabled:true},[...texted(),a('The door opened.'),a('A distant bell rang.'),a('An orange lantern flickered.')]);assert.equal(b.api.watch(b.context),null);
});
test('a zero sensitivity disables corrections',()=>{const b=boot({endingWatchEnabled:true,endingWatchStrength:0},texted());assert.equal(b.api.watch(b.context),null);});
test('generic fallback reports literal wording rather than inventing an activity',()=>{
    const b=boot({endingWatchEnabled:true},Array.from({length:4},()=>a('The enchanted teacup wobbled violently.')));const w=b.api.watch(b.context);assert.equal(w?.kind,'phrase');
});
test('assistant sampling excludes user, system, tool, placeholder and clearly partial messages',()=>{
    const b=boot({},[a('A real reply.'),u('User turn.'),{...a('System'),is_system:true},{...a('tool'),extra:{tool_calls:[]}},a('...'),{...a('partial'),gen_started:1}]);
    assert.equal(b.api.entries(b.context,8).length,1);
});
test('regeneration after host deletion does not discard an additional historical reply',()=>{
    const b=boot({},[...texted(),u('Next prompt.')]);assert.equal(b.api.entries(b.context,8,'regenerate').length,4);
});
test('host delete-before-interceptor regeneration sequence retains the complete old window',async()=>{
    const b=boot({},[...texted(),u('New prompt.'),a('Discarded old answer.')]);b.events.emit('GENERATION_STARTED','regenerate',{},false);b.context.chat.pop();
    await prepare(b,'regenerate',false);assert.equal(b.api.entries(b.context,8,'regenerate').length,4);
});
test('a still-present swipe target is excluded consistently from all analysis',()=>{
    const b=boot({},[...texted(),a('UNIQUE_DISCARDED_ANCHOR.')]);b.events.emit('GENERATION_STARTED','swipe',{},false);
    const entries=b.api.snapshot(b.context,'swipe');assert.equal(entries.length,4);
    const idx=b.api.index({...b.context,_sceEntries:entries});assert.ok(!idx.options.some(x=>x.value.includes('discarded')));
});
test('fingerprints count concrete text without judging subject matter',()=>{
    const b=boot(),r=b.api.fp('A brief paragraph.\n\n"An ordinary quote."');assert.equal(r.paragraphs,2);assert.equal(r.endingMark,'period');assert.ok(r.quotationShare>0);
});
test('report remains explicitly descriptive and labels bounded phrase analysis',()=>{
    const b=boot({},[a('oak '.repeat(3000))]);const r=b.api.observe(b.context);assert.equal(r.medianWords,3000);assert.equal(r.phraseSampling,true);
});
test('pending family selection alone never learns from a subsequent partial reply',()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);b.api.pending(b.context,'domino');b.context.chat.push({...a('partial'),gen_started:1});b.api.reconcile(b.context);assert.equal(b.api.state(b.context).outcomes.length,0);
});
test('verified normal completion records a matched learning outcome',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);const run=await complete(b);assert.equal(run.state,'completed');assert.equal(b.api.state(b.context).outcomes.length,1);
});
test('verified swipe completion replaces the old outcome instead of adding an unrelated one',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await complete(b,'Bonnie opened the window.');
    const run=await complete(b,'Bonnie closed the door.',true,'swipe');assert.equal(run.state,'completed');assert.equal(b.api.state(b.context).outcomes.length,1);
});
test('editing an observed response invalidates its learned association',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await complete(b);b.context.chat[1].mes='Completely revised.';b.api.reconcile(b.context);assert.equal(b.api.state(b.context).outcomes.length,0);
});
test('bounded learning metadata stores fingerprints, not story text, and restores safely',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await complete(b,'Bonnie placed the secretstrawberry beside the kettle.');
    const saved=obj(b.context.chatMetadata);assert.doesNotMatch(JSON.stringify(saved),/secretstrawberry/);
    const c=boot({autopilotEnabled:true},b.context.chat);c.context.chatMetadata=saved;assert.equal(c.api.state(c.context).outcomes.length,1);
});
test('model changes clear incompatible persisted associations',async()=>{
    const b=boot({autopilotEnabled:true},[u('Go.')]);await complete(b);b.events.emit('CHATCOMPLETION_MODEL_CHANGED');assert.equal(b.context.chatMetadata.storyChaosEngineLearning,undefined);assert.equal(b.api.state(b.context).outcomes.length,0);
});
test('common family scaling is reported as no adjustment when no relative evidence exists',()=>{
    const b=boot({autopilotEnabled:true},Array.from({length:4},()=>a('One ordinary sentence.'))),s=b.api.state(b.context);
    for(let i=0;i<4;i++){const fp=b.api.fp(b.context.chat[i]);s.outcomes.push({index:i,signature:fp.signature,swipeId:null,family:i<2?'domino':'parallel',fingerprint:{quotationBand:fp.quotationBand,paragraphShape:fp.paragraphShape,endingMark:fp.endingMark}});}
    const result=b.api.factors(b.context,b.api.observe(b.context));assert.equal(result.ready,false);assert.equal(result.factors.size,0);
});
test('the Balancer changes relative probabilities only for contrasting measured families',()=>{
    const b=boot({autopilotEnabled:true,feedbackStrength:100},[a('"A fully quoted sentence."'),a('"Another fully quoted sentence."'),a('Plain unquoted prose.'),a('More unquoted prose.')]);
    const state=b.api.state(b.context);
    for(let i=0;i<4;i++){const fp=b.api.fp(b.context.chat[i]);state.outcomes.push({index:i,signature:fp.signature,swipeId:null,family:i<2?'dialogue':'domino',fingerprint:{quotationBand:fp.quotationBand,paragraphShape:fp.paragraphShape,endingMark:fp.endingMark}});}
    const r=b.api.factors(b.context,{available:8,dominant:[{key:'quotationBand',value:'over 60%',count:7,total:8}]});
    assert.ok(r.ready);assert.ok(r.factors.get('dialogue').factor<1);assert.ok(r.factors.get('domino').factor>1);
});

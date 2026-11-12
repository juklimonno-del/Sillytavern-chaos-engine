// Story Chaos Engine v1.8.0. Browser-only; no extra model calls or telemetry.
// Pure selection/analysis helpers are kept separate from the host lifecycle below.
'use strict';
const SCE_VERSION = '1.8.0';
const SCE_SETTINGS_KEY = 'storyChaosEngine';
const SCE_PROMPT_ID = 'story_chaos_engine_auto';
const SCE_FEATURES = ['structureEnabled', 'feedbackObserverEnabled', 'feedbackBalancerEnabled', 'endingWatchEnabled'];
const SCE_PRESETS = Object.freeze({
    subtle: {intensity:35,maxLayers:2,structureInfluence:55,beatDensity:40,contextGravity:80},
    balanced: {intensity:65,maxLayers:3,structureInfluence:82,beatDensity:60,contextGravity:75},
    wild: {intensity:90,maxLayers:4,structureInfluence:95,beatDensity:80,contextGravity:50},
});
const MODES = [
    'An existing goal moves forward through an unexpected practical method.',
    'A character acts on a private priority nobody else is considering.',
    'A mundane inconvenience becomes the most interesting part of the moment.',
    'A conversation changes direction because someone notices something specific.',
    'An overlooked consequence of an earlier action finally becomes relevant.',
    'Someone makes a confident choice that is probably a terrible idea.',
    'A quiet, ordinary interaction takes up most of the scene.',
    'An outside character pursues something independently of the main cast.',
    'An established relationship creates friction in an unconventional way.',
    'A small success produces a weird secondary problem.',
    'A character drops their current priority for a believable personal reason.',
    'An attempt to help produces surprising but coherent side effects.',
    'An existing thread changes meaning without introducing a new crisis.',
    'A plan works, but not for the reason anyone expected.',
    'Someone acts without explaining themselves; behavior comes before exposition.',
    'A brief time jump reveals what has changed through concrete details.',
    'A ridiculous minor obsession steers otherwise ordinary behavior.',
    'Nothing dramatic interrupts the scene; the characters simply live in it.'
];
const FOCUSES = [
    'character-specific initiative','a neglected object or setting detail','unspoken social expectations',
    'an existing promise or obligation','a secondary character’s independent agenda',
    'a physical task with practical consequences','a different interpretation of something already said',
    'an unexpected but believable bit of competence','an embarrassing but non-catastrophic mistake',
    'a habit, grudge, fixation, or preference','a change in who has the conversational initiative',
    'the environment carrying on regardless of the cast','ordinary logistics',
    'a minor discovery that matters to one character','a previous action causing a delayed consequence',
    'an overlooked relationship between known facts'
];
const RHYTHMS = [
    'Mostly dialogue, if the scene supports it.',
    'Mostly physical activity, with speech only when it matters.',
    'Unhurried attention to a single interaction.',
    'Several brisk developments without artificial cliffhangers.',
    'A lopsided structure: one long passage followed by shorter ones.',
    'Conversation that wanders naturally rather than chasing a punchline.',
    'One sustained event with plenty of concrete detail.',
    'A surprising change in pace partway through.'
];
const WILDCARDS = [
    'An apparently irrelevant object becomes useful.',
    'Someone confidently misunderstands a small detail.',
    'An interruption is ignored rather than treated as important.',
    'A character takes an unexpectedly petty position.',
    'A joke falls completely flat and nobody rescues it.',
    'The obvious dramatic choice is declined.',
    'An NPC is busy with a problem that has nothing to do with the protagonists.',
    'An inconvenience is solved in an ugly but effective way.',
    'A minor social rule proves more important than expected.',
    'A character decides a tiny matter deserves absurd effort.',
    'A confession is met with practical questions instead of drama.',
    'Someone’s kindness looks rude from the outside.'
];
const SCE_CATEGORIES = {
    direction:{name:'Story direction',weight:3,triggers:[],cues:MODES,words:['detour','priority','surprise','callback']},
    character:{name:'Character impulses',weight:2,triggers:['want','need','habit','pride','refuse'],cues:[
        'A private priority quietly changes a character’s behavior.',
        'An ordinary habit suggests an unexpected next action.',
        'Someone makes a confident but questionable personal choice.',
        ...FOCUSES.map(x=>'Consider '+x+'.'),
    ],words:['impulse','fixation','habit','pride']},
    dialogue:{name:'Dialogue & voice',weight:2,triggers:['ask','speak','talk','question','whisper'],cues:[
        'Let a character speak in their own peculiar rhythm.',
        'A tiny misunderstanding redirects the exchange.',
        'Someone answers a serious question with a mundane concern.'
    ],words:['pause','tangent','interruption','misquote']},
    social:{name:'Relationships & friction',weight:2,triggers:['friend','trust','jealous','kiss','promise'],cues:[
        'A social expectation quietly changes what someone does.',
        'Two characters interpret the same gesture differently.',
        'Someone becomes surprisingly petty about a minor issue.'
    ],words:['favor','grudge','courtesy','obligation']},
    setting:{name:'Setting & objects',weight:2,triggers:['room','door','table','couch','kitchen','window','rain'],cues:[
        'An overlooked object already present becomes relevant.',
        'The environment creates a practical obstacle.',
        'An ordinary object is repurposed in an unexpected way.'
    ],words:['hinge','scratch','clutter','texture']},
    consequences:{name:'Callbacks & consequences',weight:2,triggers:['remember','earlier','forgot','again','broken','owed'],cues:[
        'A small previous action has a believable delayed consequence.',
        'An old obligation quietly changes the situation.',
        'Something earlier becomes unexpectedly useful.'
    ],words:['receipt','aftermath','reminder','reversal']},
    humor:{name:'Humor & absurdity',weight:1,triggers:['laugh','funny','joke','ridiculous','embarrass'],cues:[
        'An unremarkable problem is taken much too personally.',
        'An awkward reaction is funnier than a clever punchline.',
        'Someone argues passionately about a trivial detail.'
    ],words:['deadpan','pettiness','audacity','nonsense']},
    physical:{name:'Physical & sensory',weight:1,triggers:['touch','warm','cold','noise','soft','smell'],cues:[
        'A physical detail redirects attention for a moment.',
        'A concrete task briefly becomes the scene’s focus.',
        'An odd sensory discomfort shapes someone’s choices.'
    ],words:['friction','rattle','weight','static']},
    curiosity:{name:'Curiosity & discovery',weight:1,triggers:['notice','strange','missing','wonder','clue'],cues:[
        'Someone notices a small, overlooked discrepancy.',
        'A mundane assumption is quietly questioned.',
        'A passing curiosity leads into an unconventional tangent.'
    ],words:['trace','glimpse','oddity','rumor']},
    pacing:{name:'Pacing & structure',weight:1,triggers:[],cues:[
        'Let one interaction unfold without artificial escalation.',
        'Vary the balance of action, dialogue, and description.',
        'A brief time skip might be more interesting than another reaction.',...RHYTHMS
    ],words:['pause','drift','cutaway','snapshot']},
    wildcard:{name:'Wildcards & detours',weight:1,triggers:[],cues:[
        'A small distraction deserves attention for its own sake.',
        'Someone has an independent, unrelated errand.',
        'The obvious dramatic reaction is declined.',...WILDCARDS
    ],words:['swerve','sidequest','coincidence','improvisation']}
};
const SCE_STRUCTURE_FAMILIES = {
    sustained:{title:'Sustained moment',weight:3,min:1,max:2,affinity:{dialogue:1,action:1,observation:1},
        phases:[['Sustain one ongoing interaction','Explore a practical task in detail','Stay with one character initiative'],
            ['Let a minor consequence register','Allow a small aside without changing the primary focus']],
        transitions:['Unbroken continuity','Brief natural aside','Subtle shift of attention']},
    domino:{title:'Domino chain',weight:2,min:2,max:5,affinity:{action:2,consequence:2},
        phases:[['Begin with an action already possible','Let a small decision create the first change'],
            ['Follow a direct consequence','Follow a character response','Let a practical aftereffect develop'],
            ['Carry the latest consequence forward','Leave circumstances visibly changed']],
        transitions:['Direct cause and effect','Physical follow-through','Action-to-reaction handoff']},
    parallel:{title:'Parallel threads',weight:2,min:2,max:5,affinity:{dialogue:1,action:1,social:2},
        phases:[['Follow an existing activity','Return to the first activity with a changed detail'],
            ['Attend to a second independent activity','Let someone pursue a separate priority'],
            ['Let two activities brush against one another, if natural','Keep activities separate without forcing convergence']],
        transitions:['Alternating perspectives without omniscient leakage','Intercut ongoing activities','Shift between independent concerns']},
    echo:{title:'Delayed echo',weight:2,min:3,max:5,affinity:{consequence:2,observation:2},
        phases:[['Notice a small established detail','Let an ordinary choice create an unnoticed implication'],
            ['Pursue an immediate interaction instead','Allow attention to drift elsewhere'],
            ['Return to an earlier detail in a changed context','Let an earlier action matter without a grand reveal']],
        transitions:['Temporary digression and later return','Loose association and callback','Delayed consequence']},
    dialogue:{title:'Conversational drift',weight:2,min:2,max:5,affinity:{dialogue:3,social:1},
        phases:[['Begin with a character-specific conversational impulse','Stay with the present exchange'],
            ['Let a detail suggest a tangential topic','Follow an unexpected association','Make room for an awkward conversational turn'],
            ['Leave the topic in motion','Return to the original concern only if someone wants to']],
        transitions:['Topic association','Speaker-led redirection','Natural conversational interruption']},
    pivot:{title:'Directional pivot',weight:2,min:2,max:5,affinity:{action:2,observation:1},
        phases:[['Establish one active priority','Develop the ongoing activity'],
            ['A believable new priority redirects attention','A character chooses a different immediate objective'],
            ['Follow through on the new activity','Explore consequences of the changed priority']],
        transitions:['Abrupt but motivated switch','A practical redirection','A character-led change of focus']},
    anticlimax:{title:'Deliberate anti-climax',weight:2,min:2,max:4,affinity:{dialogue:1,social:1,observation:1},
        phases:[['Allow an expectation to form naturally','Notice an apparent opportunity for drama'],
            ['Let the obvious reaction fail to happen','Someone chooses a mundane concern instead'],
            ['Continue with ordinary life','Give a trivial detail disproportionate attention']],
        transitions:['Expectation quietly deflated','A casual refusal to escalate','Ordinary action takes over']},
    mosaic:{title:'Mosaic of moments',weight:1,min:2,max:5,affinity:{observation:2,social:1},
        phases:[['Notice a distinctive small behavior','Focus on a mundane physical detail'],
            ['Follow a nearby independent activity','A minor social interaction occupies the foreground'],
            ['Let a separate observation develop','Return to an earlier detail, optionally']],
        transitions:['Loose associative cuts','A collection of adjacent moments','Brief focus changes']},
    reverse:{title:'Consequence first',weight:1,min:2,max:4,affinity:{consequence:2,observation:1},
        phases:[['Begin with the immediate result of an established or plausible action','Start from a present consequence'],
            ['Briefly reveal the cause through concrete context','Let preceding actions become clear without a long flashback'],
            ['Continue from the consequence','Show what the new circumstance makes possible']],
        transitions:['Short backward glance','A reveal through physical evidence','Present consequence followed by its origin']},
    time:{title:'Elastic time',weight:1,min:2,max:4,affinity:{action:1,observation:2},
        phases:[['Begin in one ongoing activity','Stay close to a small present moment'],
            ['Skip an uneventful stretch of time','Compress repeated ordinary actions'],
            ['Reveal change through a fresh detail','Return attention to what has shifted']],
        transitions:['Unannounced short time skip','Compressed routine then close detail','Brief ellipsis']},
    resume:{title:'Interrupted task',weight:1,min:3,max:5,affinity:{action:2,consequence:1},
        phases:[
            ['Continue an existing task','Advance the activity already underway'],
            ['Attend briefly to a nearby established concern','Turn briefly to another concern already present'],
            ['Handle that concern with one small action','Give the intervening concern a practical response'],
            ['Resume the same task with a concrete step','Return to the original activity and act'],
            ['Move that task forward visibly','Show a concrete change in the ongoing task']
        ],
        transitions:['Keep the original task active','Carry relevant changes into the return'],
        routes:[
            {id:'early',label:'Diversion then return',orders:{3:[1,3,4],4:[0,1,3,4],5:[0,1,2,3,4]}},
            {id:'late',label:'Progress before diversion',orders:{3:[4,1,3],4:[0,4,1,3],5:[0,4,1,2,3]}}
        ]},
    revision:{title:'Attempt and adjustment',weight:1,min:3,max:5,affinity:{action:2,observation:2},
        phases:[
            ['Try one available method','Put the current approach into practice'],
            ['Observe what that attempt changes','Register the attempt’s actual result'],
            ['Adjust the method using its observable result','Refine the approach in response to what happened'],
            ['Apply the adjustment and show its immediate result','Try the revised method and show what changes'],
            ['Continue from that result with a practical action','Carry the result into the next available step'],
            ['Compare available methods against the current task','Briefly contrast two methods already available']
        ],
        transitions:['Keep the same practical goal','Let actual results guide each adjustment'],
        routes:[
            {id:'feedback',label:'Adjust from results',orders:{3:[0,2,3],4:[0,1,2,3],5:[0,1,2,3,4]}},
            {id:'compare',label:'Compare before trying',orders:{4:[5,0,2,3],5:[5,0,1,2,3]}}
        ]},
    funnel:{title:'Narrowing choices',weight:1,min:3,max:5,affinity:{observation:2,action:1,consequence:1},
        phases:[
            ['Show the current practical choice','Establish a choice facing the acting character'],
            ['Compare two already available ways forward','Contrast the practical options already present'],
            ['Check an existing constraint in the scene','Test the options against a visible limitation'],
            ['Narrow the options using the available evidence','Set aside an option for a concrete reason'],
            ['Have the acting character take the selected step','Put the acting character’s chosen method into action'],
            ['Try a small reversible step with one option','Probe one available approach through a limited action']
        ],
        transitions:['Keep comparisons brief and practical','Let the acting character commit through action'],
        routes:[
            {id:'compare',label:'Compare then commit',orders:{3:[1,3,4],4:[0,1,3,4],5:[0,1,2,3,4]}},
            {id:'probe',label:'Try then choose',orders:{3:[5,3,4],4:[0,5,3,4],5:[0,5,2,3,4]}}
        ]},
    zoom:{title:'Shift of scale',weight:1,min:3,max:5,affinity:{observation:3,action:1},
        phases:[
            ['Attend to a concrete detail already in view','Focus closely on a visible local detail'],
            ['Show a connected activity within the scene','Follow an activity linking the nearby details'],
            ['Widen attention to the reachable surroundings','Take in the immediate setting around the activity'],
            ['Narrow attention to what the acting character can use','Select a relevant detail within the current activity'],
            ['Let that focus lead into a concrete action','Act on something established within that view']
        ],
        transitions:['Keep time continuous as attention shifts','Stay within the character’s accessible surroundings'],
        routes:[
            {id:'outward',label:'Detail to surroundings',orders:{3:[0,2,4],4:[0,1,2,4],5:[0,1,2,3,4]}},
            {id:'inward',label:'Surroundings to detail',orders:{3:[2,0,4],4:[2,1,0,4],5:[2,1,0,3,4]}}
        ]},
    counterpoint:{title:'Counterpoint',weight:1,min:3,max:5,affinity:{social:2,observation:2,dialogue:1},
        phases:[
            ['Show one established response to the current situation','Follow one observable side of the present situation'],
            ['Contrast two observable sides of the same situation','Set the available responses or details in contrast'],
            ['Establish the shared practical context for a visible contrast','Show the practical concern linking two existing responses or details'],
            ['Let the contrast affect the acting character’s next action','Have the acting character respond to that difference concretely'],
            ['Follow the visible consequence of that action','Carry that action into an immediate practical result']
        ],
        transitions:['Compare material from the same situation','Keep contrasting behavior consistent with established characters'],
        routes:[
            {id:'reveal',label:'Contrast before shared context',orders:{3:[0,1,3],4:[0,1,2,3],5:[0,1,2,3,4]}},
            {id:'context',label:'Shared context before contrast',orders:{3:[2,1,3],4:[2,0,1,3],5:[2,0,1,3,4]}}
        ]},
    relay:{title:'Handoff',weight:1,min:3,max:5,affinity:{action:2,social:1,consequence:1},
        phases:[
            ['Continue a task or handle an object already present','Advance work on something already in the scene'],
            ['Pass a step to an established assistant-controlled participant or process','Transfer an available task between existing assistant-controlled participants or processes'],
            ['Follow the visible work at the receiving stage','Show what the receiving participant or process actually does'],
            ['Follow through on the handoff with a concrete action','Take the next available step after that transfer'],
            ['Show the handoff’s immediate practical effect','Let the visible result of the transfer register'],
            ['Receive the same task or object back in its current state','Bring that task or object back after the receiving stage']
        ],
        transitions:['Keep handoffs within established activity','Follow visible work without inventing another participant'],
        routes:[
            {id:'forward',label:'Transfer and follow through',orders:{3:[0,1,3],4:[0,1,2,3],5:[0,1,2,4,3]}},
            {id:'return',label:'Transfer and receive back',orders:{3:[1,5,3],4:[0,1,5,3],5:[0,1,2,5,3]}}
        ]},
    accumulate:{title:'Accumulation',weight:1,min:3,max:5,affinity:{consequence:2,action:1,observation:1},
        phases:[
            ['Show two small contributions already possible in this situation','Bring together two available details or actions with a shared effect'],
            ['Add another available contribution to the same situation','Let one further established detail or action contribute'],
            ['Let an early combined effect become visible','Show how the contributions begin to add up'],
            ['Show the contributions’ combined practical effect','Make the effect of those contributions concrete'],
            ['Act on the combined effect visible now','Respond to that combined result with a concrete action'],
            ['Carry one contribution further before combining the results','Follow one contributing action through before showing the whole effect']
        ],
        transitions:['Let separate contributions combine without forcing escalation','Keep the combined effect grounded in what actually occurred'],
        routes:[
            {id:'gather',label:'Gather before the combined effect',orders:{3:[0,3,4],4:[0,1,3,4],5:[0,1,5,3,4]}},
            {id:'build',label:'Build on an early effect',orders:{4:[0,2,1,4],5:[0,2,1,3,4]}}
        ]},
    discovery:{title:'Evidence and response',weight:1,min:3,max:5,affinity:{observation:3,action:1},
        phases:[
            ['Notice an observable detail in the current scene','Attend to evidence already available to the character'],
            ['Give one brief, provisional reading of that detail','Form a limited interpretation from what is visible'],
            ['Check another detail the character can actually observe','Compare the interpretation with another accessible piece of evidence'],
            ['Clarify or qualify what the visible evidence supports','Update the working interpretation without claiming unseen facts'],
            ['Take one practical action supported by what is known','Act concretely on the evidence available now'],
            ['Start from an interpretation the character has already expressed','Take up an assumption already established for the character']
        ],
        transitions:['Keep knowledge limited to accessible evidence','Retain uncertainty where the evidence remains incomplete'],
        routes:[
            {id:'examine',label:'Evidence before interpretation',orders:{3:[0,3,4],4:[0,2,3,4],5:[0,1,2,3,4]}},
            {id:'check',label:'Test an established interpretation',orders:{4:[5,2,3,4],5:[5,0,2,3,4]}}
        ]}
};
const SCE_STRUCTURE_ENDINGS = ['Finish on a completed small action, not a hook.',
    'Stay with the current activity as it continues.','End with a distinctive behavior or physical detail.',
    'Leave a conversation naturally ongoing without directing a question to the user.',
    'Allow a new ordinary priority to be underway.','Stop after a meaningful change; no forced cliffhanger.'];
const SCE_LEGACY_STRUCTURE_IDS = ['sustained','domino','parallel','echo','dialogue','pivot','anticlimax','mosaic','reverse','time'];
const SCE_ATTENTION_PROFILES = {
    steady:'spread attention evenly',front:'linger early',back:'linger late',middle:'linger in the middle',
    rising:'increase detail along the sequence',falling:'reduce detail along the sequence',
    alternating:'alternate longer and shorter moments',bookends:'linger at both ends',uneven:'vary attention irregularly'
};
const SCE_STOP = new Set(('a about after again all already also am an and any are as at back be because '+
    'been before being between both but by can cannot could did do does doing dont down each either '+
    'else even every for from get gets getting give go going got had has have having he her here him '+
    'his how i if im in into is it its just know like make many may me might more most much my no '+
    'not now of off on one only or other our out over own really said say she should since so some '+
    'still such than that the their them then there these they this those through to too under up '+
    'us very was we were what when where which while who why will with would yes you your yourself '+
    'character char user assistant system model prompt story scenes scene thoughts response message '+
    'messages words text instruction instructions').split(' '));
const SCE_HIDDEN_TAGS = ['think','thinking','analysis','reasoning','cot','brainstorm','planning',
    'tracker','scene_tracker','state_tracker','sce_tracker','hidden','ooc','metadata','script','style'];
const SCE_ADV_DEFAULTS = {intensity:55,maxLayers:3,contextGravity:75,contextScope:'full',customKeywords:'',keywordBoost:30,antiRepeat:true};
const SCE_STRUCTURE_DEFAULTS = {structureEnabled:false,structureInfluence:65,beatDensity:55,structureGrounding:75,structureAntiRepeat:true};
const SCE_FEEDBACK_DEFAULTS = {feedbackObserverEnabled:false,feedbackBalancerEnabled:false,feedbackStrength:65,feedbackWindow:8};
const SCE_ENDING_WATCH_DEFAULTS = {endingWatchEnabled:false,endingWatchStrength:85,endingWatchWindow:8,endingWatchMinimum:3};

function sceContext() { return globalThis.SillyTavern?.getContext?.(); }
function sceObject(value) { return !!value && typeof value==='object' && !Array.isArray(value); }
function sceBound(value,fallback,lo,hi) { const n=Number(value); return Number.isFinite(n)?Math.max(lo,Math.min(hi,Math.round(n))):fallback; }
function scePresetMatch(s) { return Object.keys(SCE_PRESETS).find(k=>Object.entries(SCE_PRESETS[k]).every(([p,v])=>s[p]===v))||'custom'; }
function sceSettings(context=sceContext()) {
    const store=sceObject(context?.extensionSettings)?context.extensionSettings:{};
    let s=store[SCE_SETTINGS_KEY];
    if(!sceObject(s)) s=store[SCE_SETTINGS_KEY]={};
    if(!['automatic','tool','off'].includes(s.mode))s.mode='automatic';
    if(typeof s.enabled!=='boolean')s.enabled=s.mode!=='off';
    if(!['user','system'].includes(s.role))s.role='user';
    for(const [key,value] of Object.entries({...SCE_ADV_DEFAULTS,...SCE_STRUCTURE_DEFAULTS,...SCE_FEEDBACK_DEFAULTS,...SCE_ENDING_WATCH_DEFAULTS}))
        if(s[key]===undefined)s[key]=value;
    for(const key of [...SCE_FEATURES,'antiRepeat','structureAntiRepeat','autopilotEnabled'])
        if(typeof s[key]!=='boolean')s[key]=['antiRepeat','structureAntiRepeat'].includes(key);
    if(typeof s.notifyAfterReply!=='boolean')s.notifyAfterReply=true;
    for(const [key,fallback] of Object.entries({intensity:55,contextGravity:75,keywordBoost:30,structureInfluence:65,
        beatDensity:55,structureGrounding:75,feedbackStrength:65,endingWatchStrength:85}))s[key]=sceBound(s[key],fallback,0,100);
    s.maxLayers=sceBound(s.maxLayers,3,1,5);
    if(!['full','recent'].includes(s.contextScope))s.contextScope='full';
    for(const key of ['customKeywords','hiddenTags'])s[key]=typeof s[key]==='string'?s[key].slice(0,2400):'';
    for(const key of ['feedbackWindow','endingWatchWindow'])s[key]=[4,8,16].includes(Number(s[key]))?Number(s[key]):8;
    s.endingWatchMinimum=Math.min(s.endingWatchWindow,[3,4,5].includes(Number(s.endingWatchMinimum))?Number(s.endingWatchMinimum):3);
    // A complete disabled legacy catalog means structure was intentionally Off.
    // New families must not turn that choice back on during migration.
    const legacyStructureOff=sceObject(s.structureWeights)&&SCE_LEGACY_STRUCTURE_IDS.every(id=>
        Object.hasOwn(s.structureWeights,id)&&Number(s.structureWeights[id])===0);
    for(const [field,defs] of [['categoryWeights',SCE_CATEGORIES],['structureWeights',SCE_STRUCTURE_FAMILIES]]) {
        if(!sceObject(s[field]))s[field]={};
        for(const [id,def] of Object.entries(defs)){
            const fallback=field==='structureWeights'&&legacyStructureOff?0:def.weight;
            s[field][id]=sceBound(s[field][id],fallback,0,3);
        }
    }
    if(!sceObject(s.featureOverrides))s.featureOverrides={};
    for(const key of SCE_FEATURES)if(!['auto','on','off'].includes(s.featureOverrides[key]))s.featureOverrides[key]='auto';
    // Fixed output formatting is not a novelty objective unless explicitly opted in.
    if(!sceObject(s.balanceTraits))s.balanceTraits={quotationBand:true,paragraphShape:false,endingMark:false};
    for(const key of ['quotationBand','paragraphShape','endingMark'])if(typeof s.balanceTraits[key]!=='boolean')s.balanceTraits[key]=key==='quotationBand';
    s.autopilotPreset=scePresetMatch(s);
    s.schemaVersion=171;
    return s;
}
function sceOn(s,key) {
    if(!s?.enabled || s.mode==='off')return false;
    const override=s.featureOverrides?.[key];
    return override==='off'?false:override==='on'?true:!!(s.autopilotEnabled||s[key]);
}
function sceEffective(s,key) {
    if(!sceOn(s,key))return false;
    if(key==='structureEnabled')return s.structureInfluence>0&&Object.values(s.structureWeights).some(x=>x>0);
    if(key==='feedbackBalancerEnabled')return sceEffective(s,'structureEnabled')&&sceOn(s,'feedbackObserverEnabled')&&s.feedbackStrength>0;
    if(key==='endingWatchEnabled')return s.endingWatchStrength>0;
    return true;
}
function sceApplyPreset(context,name) {
    if(!SCE_PRESETS[name])return false;
    Object.assign(sceSettings(context),SCE_PRESETS[name]);
    context?.saveSettingsDebounced?.();
    sceRefreshUI();
    return true;
}
class SceBoundedMap extends Map {
    constructor(limit=12){super();this.limit=limit;}
    set(key,value){super.delete(key);super.set(key,value);while(this.size>this.limit)super.delete(this.keys().next().value);return this;}
    get(key){if(!super.has(key))return undefined;const value=super.get(key);super.delete(key);super.set(key,value);return value;}
}
const SCE_FALLBACK_CHAT_IDS=new WeakMap();let sceFallbackChatCounter=0;
function getChatKey(context=sceContext()) {
    const avatar=context?.characters?.[context?.characterId]?.avatar;
    const owner=context?.groupId!=null?'group:'+context.groupId:'character:'+(avatar??context?.characterId??'local');
    const id=context?.chatId??context?.getCurrentChatId?.()??context?.chatMetadata?.chat_id;
    if(id!=null)return owner+'|'+String(id);
    const chat=context?.chat;
    if(chat&&typeof chat==='object'){
        if(!SCE_FALLBACK_CHAT_IDS.has(chat))SCE_FALLBACK_CHAT_IDS.set(chat,++sceFallbackChatCounter);
        return owner+'|temporary:'+SCE_FALLBACK_CHAT_IDS.get(chat);
    }
    return owner+'|unselected';
}
function randomInt(max) {
    if(!Number.isSafeInteger(max)||max<1||max>0x100000000)throw new RangeError('Random range must be 1..2^32');
    if(globalThis.crypto?.getRandomValues){const limit=0x100000000-(0x100000000%max),a=new Uint32Array(1);
        do{globalThis.crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%max;}
    return Math.floor(Math.random()*max);
}
function pick(values){return values.length?values[randomInt(values.length)]:null;}
function pickFresh(values,recent){const fresh=values.filter(x=>!recent.includes(x));return pick(fresh.length?fresh:values);}
function sceChance(pct){return randomInt(10000)<pct*100;}
function sceWeighted(items){const pool=items.filter(x=>Number.isFinite(x.weight)&&x.weight>0);if(!pool.length)return null;
    let n=randomInt(1000000)/1000000*pool.reduce((a,x)=>a+x.weight,0);for(const x of pool){n-=x.weight;if(n<0)return x.value;}return pool.at(-1).value;}
function sceFeedbackHash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16)+':'+text.length;}

// Per-message immutable snapshots. Bounded even when many chats stay reachable.
const SCE_RECORD_CACHE=new SceBoundedMap(256);
const sceWordIndexCache=new SceBoundedMap(12);
const SCE_MESSAGE_STATUS=new WeakMap();
const SCE_ANALYSIS_COUNTERS={records:0,tokenizations:0,indexBuilds:0,indexDeltas:0,motifBuilds:0};
function sceTagNames(extra=''){
    return new Set([...SCE_HIDDEN_TAGS,...String(extra).toLowerCase().split(/[\s,;]+/u).filter(x=>/^[a-z][a-z0-9_:-]{0,39}$/u.test(x))]);
}
function sceStoryText(value,extra='') {
    const hidden=sceTagNames(extra),raw=String(value??'').replace(/<!--[\s\S]*?(?:-->|$)/gu,' ');
    const tag=/<\/?([a-z][\w:-]*)\b[^>]*(?:>|$)/giu;
    const stack=[];let pos=0,out='';
    for(const m of raw.matchAll(tag)){
        if(!stack.length)out+=raw.slice(pos,m.index);
        const name=m[1].toLowerCase(),closing=m[0].startsWith('</'),self=/\/\s*>$/u.test(m[0]);
        if(hidden.has(name)){
            if(closing){const i=stack.lastIndexOf(name);if(i>=0)stack.splice(i);}
            else if(!self)stack.push(name);
        } else if(!stack.length)out+=name==='br'?'\n':name==='p'?'\n\n':' ';
        pos=m.index+m[0].length;
    }
    if(!stack.length)out+=raw.slice(pos);
    // Common non-HTML tracker wrappers; no assumptions about arbitrary brackets.
    out=out.replace(/\[(think|analysis|reasoning|planning|tracker|sce_tracker|ooc)\][\s\S]*?(?:\[\/\1\]|$)/giu,' ');
    return out.replace(/https?:\/\/\S+/gu,' ').replace(/\{\{[^}]+\}\}/gu,' ');
}
function sceFeedbackTextTokens(text){return String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[];}
function sceTokenize(text){
    SCE_ANALYSIS_COUNTERS.tokenizations++;
    return sceFeedbackTextTokens(text).filter(x=>x.length>=(/[\u3040-\u30ff\u3400-\u9fff]/u.test(x)?2:3)&&x.length<=28&&!SCE_STOP.has(x)&&!/^\d+$/u.test(x));
}
function sceEdgeSample(text,max){return text.length<=max?[text]:[text.slice(0,max/2),text.slice(-max/2)];}
function sceBuildRecord(raw,hiddenTags=''){
    SCE_ANALYSIS_COUNTERS.records++;
    const clean=sceStoryText(raw,hiddenTags),segments=sceEdgeSample(clean,4000);
    // Segment edges stay separate: never fabricate co-occurrences across an omission.
    const counts=new Map(),nearby=new Map(),unique=new Set();
    for(const segment of segments){const words=sceTokenize(segment);
        for(let j=0;j<words.length;j++){
            const w=words[j];unique.add(w);counts.set(w,(counts.get(w)||0)+1);
            const co=nearby.get(w)||new Map();
            for(let k=Math.max(0,j-2);k<=Math.min(words.length-1,j+2);k++)if(j!==k&&words[k]!==w)
                co.set(words[k],(co.get(words[k])||0)+1/(1+Math.abs(k-j)));
            nearby.set(w,co);
        }
    }
    return {raw,clean,hiddenTags,signature:sceFeedbackHash(raw),counts,nearby,unique,
        sampledChars:segments.reduce((a,s)=>a+s.length,0),fingerprint:null,motifs:new Map()};
}
function sceRecord(message,s=sceSettings()){
    const raw=String(message?.mes??'');const hit=SCE_RECORD_CACHE.get(message);
    if(hit&&hit.raw===raw&&hit.hiddenTags===s.hiddenTags)return hit;
    const record=sceBuildRecord(raw,s.hiddenTags);
    if(message&&typeof message==='object')SCE_RECORD_CACHE.set(message,record);
    return record;
}
function sceFeedbackMessageEligible(m){
    if(!m||m.is_user!==false||m.is_system||(m.gen_started!=null&&m.gen_finished==null)||typeof m.mes!=='string'||!m.mes.trim()||m.mes.trim()==='...'
        ||m.extra?.tool_calls||m.extra?.tool_result||m.extra?.type||m.extra?.is_partial||m.extra?.incomplete
        ||m.mes.trimStart().startsWith('[STORY CHAOS ENGINE'))return false;
    const ctx=sceContext(),processor=ctx?.streamingProcessor;
    if(processor&&ctx.chat?.[processor.messageId]===m&&(!processor.isFinished||processor.isStopped||processor.abortController?.signal?.aborted))return false;
    const known=SCE_MESSAGE_STATUS.get(m);
    return !known||known.raw!==m.mes||known.state==='completed';
}
function sceSnapshot(context=sceContext(),type='normal'){
    const chat=Array.isArray(context?.chat)?context.chat:[];
    const key=getChatKey(context),pending=sceLifecycleStart?.key===key?sceLifecycleStart:null;
    let replace=pending?.type===type?pending.replacement:null;
    // On current ST, regeneration has already removed its target before this hook.
    // Swipe retains its target. Older hosts are supported when STARTED captured it.
    if(type==='swipe'&&!replace&&chat.at(-1)?.is_user===false)replace=chat.at(-1);
    return chat.map((message,index)=>({message,index})).filter(x=>x.message!==replace);
}
function sceFeedbackReplyEntries(context,window,type='normal'){
    const source=context?._sceEntries||sceSnapshot(context,type),entries=[];
    for(let i=source.length-1;i>=0&&entries.length<window;i--)
        if(sceFeedbackMessageEligible(source[i].message))entries.push(source[i]);
    return entries.reverse();
}
function sceFingerprintRecord(record){
    if(record.fingerprint)return record.fingerprint;
    const text=record.clean,tokens=sceFeedbackTextTokens(text);
    const blocks=text.trim().split(/\n\s*\n+/u).filter(x=>x.trim()),sizes=blocks.map(x=>sceFeedbackTextTokens(x).length);
    const total=sizes.reduce((a,b)=>a+b,0)||1,avg=total/Math.max(1,sizes.length);
    const variation=sizes.length<=1?0:Math.sqrt(sizes.reduce((sum,n)=>sum+(n-avg)**2,0)/sizes.length)/Math.max(1,avg);
    const paragraphShape=sizes.length<=1?'single':sizes[0]/total>=.6?'front-heavy':sizes.at(-1)/total>=.6?'back-heavy':variation<=.3?'even':'mixed';
    let quoteChars=0;
    for(const match of text.matchAll(/"([^"\n]+)"|“([^”\n]+)”/gu))quoteChars+=(match[1]||match[2]||'').length;
    const quotationShare=quoteChars/Math.max(1,text.length),quotationBand=quotationShare<.2?'under 20%':quotationShare<.6?'20–60%':'over 60%';
    const end=text.trim().replace(/[\s*_\x60"'”’\])}]+$/gu,'');
    const endingMark=end.endsWith('…')||end.endsWith('...')?'ellipsis':({'?':'question mark','!':'exclamation mark','.':'period'}[end.slice(-1)]||'other');
    const fourGrams=new Set();
    const segments=tokens.length<=2200?[tokens]:[tokens.slice(0,1100),tokens.slice(-1100)];
    for(const segment of segments)for(let i=0;i+3<segment.length;i++)fourGrams.add(segment.slice(i,i+4).join(' '));
    return record.fingerprint={signature:record.signature,wordCount:tokens.length,paragraphs:blocks.length,
        quotationShare,quotationBand,paragraphShape,endingMark,openingFour:tokens.slice(0,4).join(' '),
        closingFour:tokens.slice(-4).join(' '),fourGrams,phrasesSampled:tokens.length>2200};
}
function sceFeedbackFingerprint(value){return sceFingerprintRecord(typeof value==='string'?sceBuildRecord(value):sceRecord(value));}
function sceFeedbackCachedFingerprint(message,s=sceSettings()){return sceFingerprintRecord(sceRecord(message,s));}
function sceFeedbackReplySamples(context,window,type='normal'){
    const s=context?._sceSettings||sceSettings(context);
    return sceFeedbackReplyEntries(context,window,type).map(x=>({...x,fingerprint:sceFeedbackCachedFingerprint(x.message,s)}));
}
function sceIndexDelta(state,record,delta){
    if(!delta)return;
    SCE_ANALYSIS_COUNTERS.indexDeltas++;
    for(const [word,n] of record.counts){const next=(state.counts.get(word)||0)+delta*n;
        if(next<1e-8)state.counts.delete(word);else state.counts.set(word,next);}
    for(const [word,links] of record.nearby){const target=state.nearby.get(word)||new Map();
        for(const [other,n] of links){const next=(target.get(other)||0)+delta*n;
            if(next<1e-8)target.delete(other);else target.set(other,next);}
        if(target.size)state.nearby.set(word,target);else state.nearby.delete(word);}
}
function sceWordIndex(context=sceContext()){
    const s=context?._sceSettings||sceSettings(context),key=getChatKey(context);
    const entries=context?._sceEntries||sceSnapshot(context),records=[];let budget=300000;
    for(let i=entries.length-1;i>=0;i--){
        if(s.contextScope==='recent'&&records.length>=16)break;
        const {message,index}=entries[i];
        if(!message||message.is_system||typeof message.mes!=='string'||message.extra?.tool_calls||message.extra?.tool_result)continue;
        const known=SCE_MESSAGE_STATUS.get(message);
        if(known&&known.raw===message.mes&&known.state!=='completed')continue;
        const record=sceRecord(message,s);if(record.sampledChars>budget)break;budget-=record.sampledChars;
        const age=records.length,weight=age<3?4:age<12?2.3:age<28?1.4:.55;
        records.push({record,message,index,age,weight});
        if(records.length>=256)break;
    }
    let state=sceWordIndexCache.get(key);
    if(!state)state={weights:new Map(),counts:new Map(),nearby:new Map(),index:null,order:[],roles:[]};
    const desired=new Map(records.map(x=>[x.record,x.weight]));
    const same=state.order.length===records.length&&records.every((x,i)=>state.order[i]===x.record&&state.weights.get(x.record)===x.weight&&state.roles[i]===x.message.is_user);
    if(same&&state.index)return state.index;
    for(const [r,w] of state.weights)if(!desired.has(r))sceIndexDelta(state,r,-w);
    for(const [r,w] of desired)sceIndexDelta(state,r,w-(state.weights.get(r)||0));
    state.weights=desired;state.order=records.map(x=>x.record);state.roles=records.map(x=>x.message.is_user);
    const recent=new Set();for(const x of records.slice(0,12))for(const w of x.record.unique)recent.add(w);
    const recentAssist=records.filter(x=>x.message.is_user===false).slice(0,8),df=new Map();
    for(const x of recentAssist)for(const w of x.record.unique)df.set(w,(df.get(w)||0)+1);
    const options=[...state.counts].map(([value,count])=>({value,
        weight:Math.min(16,1+Math.log2(1+count)*2)*(1-.55*(df.get(value)||0)/Math.max(1,recentAssist.length))}));
    state.index={options,nearby:state.nearby,recent,analyzed:records.length};
    SCE_ANALYSIS_COUNTERS.indexBuilds++;sceWordIndexCache.set(key,state);return state.index;
}
function scePersonalWords(value){return [...new Set(String(value||'').split(/[\n,;]+/gu)
    .map(x=>x.replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,48))
    .filter(x=>x&&x.split(' ').length<=4))].slice(0,80);}
const recentModes=new SceBoundedMap();
const sceRecentCueHistory=new SceBoundedMap();
const sceRecentAnchorHistory=new SceBoundedMap();
const SCE_STRUCTURE_HISTORY=new SceBoundedMap();
const SCE_STRUCTURE_ANCHORS=new SceBoundedMap();
function generateCreativeRoll(preview=false){return JSON.stringify(sceLayeredRoll(sceContext(),preview));}
function sceLayeredRoll(context=sceContext(),preview=false,structure=null){
    const s=context?._sceSettings||sceSettings(context),index=context?._sceIndex||sceWordIndex(context),key=getChatKey(context);
    const old=sceRecentCueHistory.get(key)||[],candidates=Object.entries(SCE_CATEGORIES)
        .filter(([id])=>s.categoryWeights[id]>0).map(([id,cat])=>({value:id,
            weight:s.categoryWeights[id]*(1+s.contextGravity/100*.7*Math.min(4,cat.triggers.filter(x=>index.recent.has(x)).length))}));
    const target=1+Array.from({length:s.maxLayers-1},()=>sceChance(s.intensity)).filter(Boolean).length,layers=[];
    while(layers.length<target&&candidates.length){
        const id=sceWeighted(candidates),def=SCE_CATEGORIES[id];
        // Architecture owns pacing when present. A pacing lens may refine but not contradict it.
        const pool=id==='pacing'&&structure?['Vary moment-to-moment duration inside the selected arrangement.']:def.cues;
        const recent=id==='direction'?(recentModes.get(key)||[]):old.filter(x=>x.startsWith(id+':')).map(x=>x.slice(id.length+1));
        const instruction=s.antiRepeat?pickFresh(pool,recent):pick(pool);
        layers.push({id,title:def.name,instruction});candidates.splice(candidates.findIndex(x=>x.value===id),1);
    }
    const enabled=layers.length>0,previous=sceRecentAnchorHistory.get(key)||[];
    const available=index.options.filter(x=>!s.antiRepeat||!previous.includes(x.value));
    const anchor=enabled&&index.options.length&&sceChance(s.contextGravity)?sceWeighted(available.length?available:index.options):null;
    const custom=scePersonalWords(s.customKeywords),sparks=[],free=layers.flatMap(x=>SCE_CATEGORIES[x.id].words);
    const count=s.intensity<35?1:s.intensity<85?2:3;
    for(let i=0;i<count;i++){
        let word=null;
        if(custom.length&&sceChance(s.keywordBoost))word=pickFresh(custom,sparks);
        else if(enabled&&index.options.length&&sceChance(s.contextGravity)){
            const linked=anchor&&index.nearby.get(anchor);
            const pool=linked?.size?[...linked].map(([value,weight])=>({value,weight})):index.options;
            word=sceWeighted(pool.filter(x=>x.value!==anchor&&!sparks.includes(x.value)));
        }else if(enabled&&free.length)word=pickFresh(free,sparks);
        if(word&&word!==anchor&&!sparks.includes(word))sparks.push(word);
    }
    // Disabled categories cannot leak legacy focus, pacing or wildcard directions.
    const result={roll:randomInt(1000)+1,creative_mode:layers[0]?.instruction||'Keyword-only / no creative lenses',
        anchor,word_sparks:sparks,layers,context_messages:index.analyzed};
    if(!preview){
        sceRecentCueHistory.set(key,[...layers.map(x=>x.id+':'+x.instruction),...old].slice(0,15));
        const direction=layers.find(x=>x.id==='direction');
        if(direction)recentModes.set(key,[direction.instruction,...(recentModes.get(key)||[])].slice(0,6));
        if(anchor)sceRecentAnchorHistory.set(key,[anchor,...previous].slice(0,5));
    }
    return result;
}

// Conservative activity recognition: evidence first, corrective instructions second.
const SCE_ENDING_ACTIONS=[
    {id:'messaging',label:'text or message activity',verb:'text|message|dm',
        patterns:[/\b(?:sent|send|sends|sending|typed|type|types|typing|wrote|write|writes|writing|drafted|drafts)\b[^.!?;\n]{0,64}\b(?:text|message|dm|sms)\b/giu,/\b(?:texted|texts|texting|messaged|messages|messaging|dmed|dming)\b/giu]},
    {id:'calling',label:'calls or dialing',verb:'call|dial',patterns:[/\b(?:called|calls|calling|dialed|dialled|dials|dialing|dialling)\b/giu]},
    {id:'embracing',label:'hugging or embracing',verb:'hug|embrace|cuddle',patterns:[/\b(?:gave|gives)\b[^.!?;\n]{0,48}\ba hug\b/giu,/\b(?:hugs|hugged|hugging|embraces|embraced|embracing|cuddles|cuddled|cuddling)\b/giu]},
    {id:'kissing',label:'kissing',verb:'kiss|smooch',patterns:[/\b(?:kisses|kissed|kissing|smooches|smooched|smooching)\b/giu]},
    {id:'laughing',label:'laughing',verb:'laugh|giggle|chuckle',patterns:[/\b(?:laughs|laughed|laughing|giggles|giggled|giggling|chuckles|chuckled|chuckling)\b/giu]},
    {id:'sighing',label:'sighing',verb:'sigh|exhale',patterns:[/\b(?:sighs|sighed|sighing|exhales|exhaled|exhaling)\b/giu]},
    {id:'walking',label:'walking or leaving',verb:'walk|leave|depart|exit',patterns:[/\b(?:walks|walked|walking|leaves|leaving|left|departs|departed|departing|exits|exited|exiting)\b/giu]},
    {id:'looking',label:'looking or glancing',verb:'look|glance|stare',patterns:[/\b(?:looks|looked|looking|glances|glanced|glancing|stares|stared|staring)\b/giu]},
    {id:'asking',label:'asking questions',verb:'ask|inquire|question',patterns:[/\b(?:asks|asked|asking|inquires|inquired|inquiring|questions|questioned|questioning)\b/giu]},
    {id:'crying',label:'crying',verb:'cry|sob|weep',patterns:[/\b(?:cries|cried|crying|sobs|sobbed|sobbing|weeps|wept|weeping)\b/giu]},
    {id:'drinking',label:'drinking',verb:'drink|sip',patterns:[/\b(?:drinks|drank|drinking|sips|sipped|sipping)\b/giu]},
    {id:'eating',label:'eating',verb:'eat|chew|munch',patterns:[/\b(?:eats|ate|eating|chews|chewed|chewing|munches|munched|munching)\b/giu]},
    {id:'touching',label:'touching or grasping',verb:'touch|grab|grasp',patterns:[/\b(?:touches|touched|touching|grabs|grabbed|grabbing|grasps|grasped|grasping)\b/giu]},
    {id:'sleeping',label:'sleeping',verb:'sleep|doze',patterns:[/\b(?:sleeps|slept|sleeping|dozes|dozed|dozing)\b/giu]},
    {id:'smiling',label:'smiling or grinning',verb:'smile|grin',patterns:[/\b(?:smiles|smiled|smiling|grins|grinned|grinning)\b/giu]},
    {id:'writing',label:'writing',verb:'write|scribble|jot',patterns:[/\b(?:writes|wrote|writing|scribbles|scribbled|scribbling|jots|jotted|jotting)\b/giu]},
    {id:'waiting',label:'waiting',verb:'wait|linger',patterns:[/\b(?:waits|waited|waiting|lingers|lingered|lingering)\b/giu]},
];
const SCE_ENDING_STOP=new Set([...SCE_STOP,'someone','something','another','finally','eventually','meanwhile','suddenly']);
function sceRegexEscape(text){return String(text).replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');}
function sceKnownActors(context=sceContext()){
    const names=new Map();
    const add=n=>{if(typeof n==='string'&&n.trim().length>=2&&n.length<=80)names.set(n.trim().toLowerCase(),n.trim());};
    add(context?.name2);add(context?.name1);
    const chars=Array.isArray(context?.characters)?context.characters:[];
    // Character metadata is trusted for names only, never as a claim about actions.
    add(chars[context?.characterId]?.name);
    if(context?.groupId!=null)for(const c of chars)add(c?.name);
    for(const m of (context?.chat||[]).slice(-40))if(m?.is_user===false&&!m.is_system)add(m.name);
    return names;
}
function sceEndingTail(text){return sceStoryText(text).trim().split(/\n\s*\n+/u).slice(-2).join('\n\n').slice(-720);}
function sceLocalClause(prefix){return prefix.split(/[.!?;\n]|,\s*(?:(?:and|but|then|while)\s+)?|\b(?:but|then)\b/iu).at(-1)||'';}
function sceIsNegated(prefix){return /\b(?:not|never|no longer|without|refused to|avoided|stop|stops|stopped|avoid|don['’]t|doesn['’]t|didn['’]t|won['’]t|wouldn['’]t|couldn['’]t|can['’]t)\b/iu.test(sceLocalClause(prefix));}
function sceIsHypothetical(prefix){return /\b(?:would|could|might|should|will|may|if|plans? to|wants? to|wanted to|about to|used to|going to)\b/iu.test(sceLocalClause(prefix));}
function sceInsideQuote(text,at){
    const prefix=text.slice(0,at);
    return (prefix.match(/"/gu)||[]).length%2===1 || (prefix.lastIndexOf('“')>prefix.lastIndexOf('”'));
}
function sceActorEvidence(tail,at,actors){
    const prefix=tail.slice(Math.max(0,at-220),at).replace(/[*`]/gu,''),clause=sceLocalClause(prefix);
    const modifiers='(?:\\s+(?:[\\p{L}]+ly|again|still|just|finally|quietly|carefully|slowly|quickly|is|was|has|had|then|already))*\\s*';
    for(const [id,name] of actors){
        const subject=new RegExp('(?:^|\\b(?:and|while)\\s+)'+sceRegexEscape(name)+modifiers+'$','iu');
        if(subject.test(clause.trim()))return {actor:name,confidence:.96};
    }
    if(/(?:^|\b(?:and|while)\s+)(?:she|he|they)\s+(?:(?:\p{L}+ly|still|just|was|is|had|has)\s+)*$/iu.test(clause.trimEnd()+' ')){
        const nearby=[...actors.values()].filter(n=>new RegExp('\\b'+sceRegexEscape(n)+'\\b','iu').test(prefix));
        const possible=[...prefix.matchAll(/\b\p{Lu}[\p{L}'’-]+/gu)].map(x=>x[0]).filter(n=>!SCE_ENDING_STOP.has(n.toLowerCase())&&!/ly$/u.test(n)&&!['Then','Before','After','While'].includes(n));
        if(nearby.length===1&&possible.every(n=>n.toLowerCase()===nearby[0].toLowerCase()))return {actor:nearby[0],confidence:.86};
        return {actor:null,confidence:.58};
    }
    // A trailing participle can refer to a sole known subject in this sentence.
    const sentence=prefix.split(/[.!?;\n]/u).at(-1)||'';
    const nearby=[...actors.values()].filter(n=>new RegExp('\\b'+sceRegexEscape(n)+'\\b','iu').test(sentence));
    if(nearby.length===1&&/ing\b/iu.test(tail.slice(at,at+18))&&
        !/\b(?:read|reads|heard|saw|watched|mentioned|described|remembered|said|told)\b/iu.test(sentence))
        return {actor:nearby[0],confidence:.8};
    return {actor:null,confidence:.35};
}
function sceEndingNamedActor(tail,at,actors=sceKnownActors()){return sceActorEvidence(tail,at,actors).actor;}
function sceEndingNormalizedToken(token){return String(token).toLowerCase();}
function sceEndingMotifs(text,actors=sceKnownActors()){
    SCE_ANALYSIS_COUNTERS.motifBuilds++;
    const tail=sceEndingTail(text),motifs=new Map();
    for(const action of SCE_ENDING_ACTIONS){
        for(const pattern of action.patterns)for(const m of tail.matchAll(pattern)){
            if(m.index<tail.length-350)continue;
            const prefix=tail.slice(0,m.index),evidence=sceActorEvidence(tail,m.index,actors);
            if(sceIsNegated(prefix)||sceIsHypothetical(prefix))continue;
            const quoted=sceInsideQuote(tail,m.index),confidence=quoted?Math.min(.4,evidence.confidence):evidence.confidence;
            if(confidence<.5)continue; // Noun mentions and unknown sentence-initial adverbs abstain.
            const generic={key:'act:'+action.id,label:action.label,kind:'activity',group:action.id,actor:null,specific:false,
                confidence:Math.min(.65,confidence)};
            const oldGeneric=motifs.get(generic.key);if(!oldGeneric||oldGeneric.confidence<generic.confidence)motifs.set(generic.key,generic);
            if(evidence.actor){const key='actor:'+evidence.actor.toLowerCase()+':'+action.id;
                const motif={key,label:evidence.actor+' + '+action.label,kind:'activity',group:action.id,
                    actor:evidence.actor,specific:true,confidence};
                if(!motifs.has(key)||motifs.get(key).confidence<confidence)motifs.set(key,motif);}
        }
    }
    // Literal sequences only. No stop-word removal or stemming creates fake phrases.
    const words=sceFeedbackTextTokens(tail).slice(-30);
    for(let i=0;i+3<words.length;i++){
        const phrase=words.slice(i,i+4);
        if(phrase.filter(w=>!SCE_ENDING_STOP.has(w)).length<3||phrase.some(w=>/^(?:never|not|don't|didn't)$/u.test(w)))continue;
        const key='phrase:'+phrase.join(' ');
        motifs.set(key,{key,label:'literal closing wording: '+phrase.join(' '),kind:'phrase',group:null,
            actor:null,specific:false,confidence:.82});
    }
    return [...motifs.values()];
}
function sceCachedMotifs(message,s,actors){
    const record=sceRecord(message,s),key=[...actors.keys()].sort().join('|');
    if(!record.motifs.has(key)){
        if(record.motifs.size>=2)record.motifs.clear();
        record.motifs.set(key,sceEndingMotifs(record.clean,actors));
    }
    return record.motifs.get(key);
}
function sceRequestedActivities(text,actors,currentActor=null){
    const result=[];
    // Inspect the whole user turn, not the ending sampler. Semicolons isolate intent.
    const clauses=sceStoryText(text).split(/[.!?;\n]+/u);
    for(const clause of clauses){
        const command=/\b(?:have|make|let|ask|tell|want|please|can you|could you|continue|keep)\b/iu.exec(clause);
        const direct=/^\s*(?:please\s+)?(?:text|message|call|dial|hug|embrace|kiss|laugh|sigh|walk|leave|look|ask|cry|drink|sip|eat|touch|sleep|smile|write|wait|send)\b/iu.test(clause);
        const addressed=[...actors.values()].find(n=>new RegExp('^\\s*'+sceRegexEscape(n)+'\\s*,','iu').test(clause));
        if(!command&&!direct&&!addressed)continue;
        let actor=addressed||null;
        const named=/\b(?:have|make|let|ask|tell)\s+([\p{L}][\p{L}'’-]*)/iu.exec(clause);
        if(named&&!/^(?:her|him|them|me|us|someone|the)$/iu.test(named[1]))actor=actors.get(named[1].toLowerCase())||named[1];
        if(!actor){const present=[...actors.values()].filter(n=>new RegExp('\\b'+sceRegexEscape(n)+'\\b','iu').test(clause));
            if(present.length===1)actor=present[0];else if(present.length>1)continue;}
        if(!actor)actor=currentActor||'*';
        for(const action of SCE_ENDING_ACTIONS){
            const stems=action.verb.split('|').flatMap(v=>[v,v.replace(/e$/u,'')+'ing',v+'ing',v+'s',v+'es',v+'ed']);
            const re=new RegExp('\\b(?:'+stems.map(sceRegexEscape).join('|')+(action.id==='messaging'?'|send\\s+(?:[\\p{L}]+\\s+){0,4}(?:text|message)':'')+')\\b','giu');
            for(const m of clause.matchAll(re)){
                if(command&&m.index<command.index)continue;
                const before=clause.slice(0,m.index);
                if(sceIsNegated(before))continue;
                result.push({actor:actor.toLowerCase(),group:action.id});break;
            }
        }
    }
    return result;
}
function sceEndingObserve(context=sceContext(),type='normal'){
    const s=context?._sceSettings||sceSettings(context),samples=sceFeedbackReplyEntries(context,s.endingWatchWindow,type);
    const actors=sceKnownActors(context),detected=new Map(),recent=new Set(samples.slice(-3).map(x=>x.index));
    for(const sample of samples)for(const motif of sceCachedMotifs(sample.message,s,actors)){
        const item=detected.get(motif.key)||{...motif,count:0,recent:0,confidenceSum:0};
        item.count++;if(recent.has(sample.index))item.recent++;item.confidenceSum+=motif.confidence;detected.set(motif.key,item);
    }
    return {samples,actors,motifs:[...detected.values()].map(x=>({...x,confidence:x.confidenceSum/x.count,total:samples.length}))};
}
function sceEndingWatch(context=sceContext(),type='normal'){
    const s=context?._sceSettings||sceSettings(context);
    if(!sceEffective(s,'endingWatchEnabled'))return null;
    const report=sceEndingObserve(context,type);if(report.samples.length<4)return null;
    const lastUser=(context?._sceEntries||sceSnapshot(context,type)).slice().reverse().find(x=>x.message?.is_user===true)?.message;
    const requested=sceRequestedActivities(lastUser?.mes||'',report.actors,context?.name2);
    const confidenceFloor=.97-.24*s.endingWatchStrength/100;
    const minimum=Math.min(s.endingWatchWindow,s.endingWatchMinimum+(s.endingWatchStrength<40?1:0));
    const available=report.motifs.filter(x=>x.count>=Math.max(minimum,x.kind==='phrase'?4:minimum)&&x.recent>=2&&
        x.confidence>=confidenceFloor&&x.count/x.total>=.8-.45*s.endingWatchStrength/100&&
        !(x.kind==='activity'&&requested.some(r=>r.group===x.group&&(r.actor==='*'||x.actor&&r.actor===x.actor.toLowerCase()))));
    available.sort((a,b)=>Number(b.specific)-Number(a.specific)||b.confidence-a.confidence||b.count-a.count||b.recent-a.recent);
    return available.length?{...available[0],strength:s.endingWatchStrength}:null;
}

function sceStructureSettings(context=sceContext()){return context?._sceSettings||sceSettings(context);}
function sceStructureSignals(context=sceContext()){
    const s=context?._sceSettings||sceSettings(context);
    const text=(context?._sceEntries||sceSnapshot(context)).slice(-12).filter(x=>x.message&&!x.message.is_system&&typeof x.message.mes==='string')
        .map(x=>sceRecord(x.message,s).clean.slice(-2500)).join('\n');
    const count=re=>Math.min(5,(text.match(re)||[]).length);
    return {dialogue:count(/["“”]|\b(?:said|asked|replied|whispered|shouted|spoke|told)\b/giu),
        action:count(/\b(?:grabbed|lifted|opened|closed|walked|ran|moved|sat|stood|picked|dropped|carried|pushed|pulled|reached|turned|shoved|placed|held|touched|followed)\b/giu),
        consequence:count(/\b(?:again|already|because|afterward|remembered|earlier|forgot|returned|result|therefore|owed)\b/giu),
        social:count(/\b(?:friend|guest|neighbor|partner|family|apology|promise|jealous|trust|argument)\b/giu),
        observation:count(/\b(?:noticed|watched|saw|heard|glanced|looked|observed|realized|stared|wondered)\b/giu)};
}
function sceStructureTargetCount(density){const base=1+Math.round(density*4/100),jitter=density>10&&density<90?randomInt(3)-1:0;return Math.min(5,Math.max(1,base+jitter));}
function sceStructureBlueprint(id,count){
    const f=SCE_STRUCTURE_FAMILIES[id],middle=[],used=[];
    const choose=pool=>sceStructurePhase(pool,used);
    if(id==='sustained')return count>1?[choose(f.phases[0]),choose(f.phases[1])]:[choose(f.phases[0])];
    if(id==='parallel'){
        for(let i=0;i<count;i++)middle.push((i%2?'Thread B: ':'Thread A: ')+choose(f.phases[i%2]));
        if(count>=4&&sceChance(30))middle[middle.length-1]=choose(f.phases[2]);return middle;
    }
    if(id==='mosaic'){for(let i=0;i<count;i++)middle.push(choose(f.phases[i%f.phases.length]));return middle;}
    if(id==='pivot'){
        const turn=1+randomInt(Math.max(1,count-1));
        for(let i=0;i<count;i++)middle.push(choose(f.phases[i<turn?0:i===turn?1:2]));return middle;
    }
    const first=choose(f.phases[0]);
    if(count===2)return [first,choose(f.phases[id==='domino'?2:1])];
    for(let i=0;i<count-2;i++)middle.push(choose(f.phases[1]));
    return [first,...middle,choose(f.phases[2])];
}
function sceStructurePhase(pool,used){
    const fresh=pool.filter(x=>!used.includes(x)),different=pool.filter(x=>x!==used.at(-1));
    const role=pick(fresh.length?fresh:different.length?different:pool);used.push(role);return role;
}
function sceStructurePlan(id,count,history,antiRepeat){
    const f=SCE_STRUCTURE_FAMILIES[id],routes=(f.routes||[]).filter(route=>route.orders[count]?.length===count);
    if(!routes.length)return {beats:sceStructureBlueprint(id,count),routeId:null,route:null,phaseOrder:null};
    const pool=routes.map(route=>{
        const position=antiRepeat?history.slice(0,4).findIndex(x=>x.family===id&&x.routeId===route.id):-1;
        return {value:route,weight:position<0?1:.3+.15*position};
    });
    const route=sceWeighted(pool),phaseOrder=route.orders[count].slice(),used=[];
    return {beats:phaseOrder.map(index=>sceStructurePhase(f.phases[index],used)),routeId:route.id,route:route.label,phaseOrder};
}
function sceStructureAttention(count,influence,history=[],antiRepeat=true){
    if(count===1)return {weights:[1],mode:'steady',label:SCE_ATTENTION_PROFILES.steady};
    const available=Object.keys(SCE_ATTENTION_PROFILES).filter(id=>count>=3||!['middle','bookends'].includes(id));
    const mode=sceWeighted(available.map(id=>{
        const position=antiRepeat?history.slice(0,3).findIndex(x=>x.attentionMode===id):-1;
        return {value:id,weight:position<0?1:.35+.2*position};
    }));
    const spread=Math.max(1,Math.ceil(influence/25)),peak=1+spread;
    let weights=Array.from({length:count},(_,i)=>{
        if(mode==='front')return i===0?peak:1;
        if(mode==='back')return i===count-1?peak:1;
        if(mode==='middle')return i===Math.floor(count/2)?peak:1;
        if(mode==='rising')return 1+Math.round(spread*i/(count-1));
        if(mode==='falling')return 1+Math.round(spread*(count-1-i)/(count-1));
        if(mode==='alternating')return i%2===0?peak:1;
        if(mode==='bookends')return i===0||i===count-1?peak:1;
        if(mode==='uneven')return 1+randomInt(spread+1);
        return 1;
    });
    if(mode==='uneven'&&weights.every(x=>x===weights[0])){
        const i=randomInt(count);weights[i]=weights[i]===1?peak:1;
    }
    return {weights,mode,label:SCE_ATTENTION_PROFILES[mode]};
}
function sceStructureHistoryItem(structure){
    return {family:structure.familyId,signature:structure.signature,routeId:structure.routeId,attentionMode:structure.attentionMode};
}
function sceStructuralRoll(context=sceContext(),preview=false,type='normal'){
    const s=sceStructureSettings(context);if(!sceEffective(s,'structureEnabled'))return null;
    const key=getChatKey(context),history=SCE_STRUCTURE_HISTORY.get(key)||[],signals=sceStructureSignals(context);
    const target=sceStructureTargetCount(s.beatDensity),influence=s.structureInfluence/100;
    const pool=Object.entries(SCE_STRUCTURE_FAMILIES).filter(([id])=>s.structureWeights[id]>0).map(([id,f])=>{
        const compatible=Object.entries(f.affinity).reduce((a,[signal,w])=>a+(signals[signal]||0)*w,0);
        let weight=s.structureWeights[id]*(1+s.structureGrounding/100*Math.min(8,compatible)*.14)/(1+Math.max(0,f.min-target));
        if(['mosaic','reverse','pivot','time','anticlimax'].includes(id))weight*=1+influence;
        if(s.structureAntiRepeat){const position=history.slice(0,4).findIndex(x=>x.family===id);
            if(position>=0)weight*=.18+.16*position;}
        return {value:id,weight};
    });
    if(sceEffective(s,'feedbackBalancerEnabled')){
        const factors=sceFeedbackFactors(context,sceFeedbackObserve(context,type));
        for(const item of pool)item.weight*=factors.factors.get(item.value)?.factor||1;
    }
    const familyId=sceWeighted(pool);if(!familyId)return null;
    const f=SCE_STRUCTURE_FAMILIES[familyId],count=Math.max(f.min,Math.min(f.max,target));
    let result;
    for(let attempt=0;attempt<6;attempt++){
        const plan=sceStructurePlan(familyId,count,history,s.structureAntiRepeat);
        const attention=sceStructureAttention(count,s.structureInfluence,history,s.structureAntiRepeat);
        result={family:f.title,familyId,count,routeId:plan.routeId,route:plan.route,phaseOrder:plan.phaseOrder,
            beats:plan.beats.map((role,i)=>({role,attention:attention.weights[i]})),attention:attention.weights,
            attentionMode:attention.mode,attentionLabel:attention.label,transition:pick(f.transitions),
            influence:s.structureInfluence,grounding:s.structureGrounding,
            kind:s.structureInfluence>=80?'strong execution':s.structureInfluence>=50?'moderate execution':'gentle execution'};
        // Measure the structure actually emitted. Run IDs, hidden choices, and a
        // closing cue suppressed by a correction do not create apparent novelty.
        result.signature=sceFormatStructure(result);
        if(!s.structureAntiRepeat||!history.some(x=>x.signature===result.signature))break;
    }
    const index=context?._sceIndex||sceWordIndex(context),prior=SCE_STRUCTURE_ANCHORS.get(key)||[];
    const candidates=index.options.filter(x=>!s.structureAntiRepeat||!prior.includes(x.value)),anchors=[];
    if(index.options.length&&sceChance(s.structureGrounding))anchors.push(sceWeighted(candidates.length?candidates:index.options));
    result.ending=pick(SCE_STRUCTURE_ENDINGS);result.anchors=anchors;
    if(!preview){SCE_STRUCTURE_HISTORY.set(key,[sceStructureHistoryItem(result),...history].slice(0,8));
        if(anchors.length)SCE_STRUCTURE_ANCHORS.set(key,[...anchors,...prior].slice(0,10));}
    return result;
}
const SCE_FEEDBACK_TRAITS=[['quotationBand','Quotation coverage band'],['paragraphShape','Paragraph-length arrangement'],['endingMark','Terminal punctuation']];
const SCE_FEEDBACK_STATES=new SceBoundedMap();
let sceModelEpoch=0;
function sceFeedbackIdentity(context){
    // Prefer stable host information. Model/profile-change events also reset state.
    const model=context?.chatCompletionSettings?.model??context?.model??context?.onlineStatus??'';
    return getChatKey(context)+'|'+(context?.characterId??'')+'|'+(context?.mainApi??'')+'|'+String(model);
}
function sceFeedbackState(context=sceContext()){
    const key=sceFeedbackIdentity(context);let state=SCE_FEEDBACK_STATES.get(key);
    if(!state){
        const saved=context?.chatMetadata?.storyChaosEngineLearning;
        const outcomes=saved?.schema===171&&saved.identity===key&&Array.isArray(saved.outcomes)?saved.outcomes.slice(-96).filter(sceValidOutcome):[];
        state={pending:null,outcomes};SCE_FEEDBACK_STATES.set(key,state);
    }
    return state;
}
function sceValidOutcome(o){return sceObject(o)&&Number.isInteger(o.index)&&o.index>=0&&typeof o.signature==='string'&&
    !!SCE_STRUCTURE_FAMILIES[o.family]&&sceObject(o.fingerprint)&&
    SCE_FEEDBACK_TRAITS.every(([key])=>typeof o.fingerprint[key]==='string');}
function sceFeedbackPersist(context,state){
    if(!sceObject(context?.chatMetadata)||!context?.saveMetadataDebounced)return;
    context.chatMetadata.storyChaosEngineLearning={schema:171,identity:sceFeedbackIdentity(context),outcomes:state.outcomes.slice(-96)};
    context.saveMetadataDebounced();
}
function sceFeedbackReconcile(context=sceContext()){
    const state=sceFeedbackState(context),chat=context?.chat||[];
    state.outcomes=state.outcomes.filter(x=>{
        const m=chat[x.index];return sceValidOutcome(x)&&sceFeedbackMessageEligible(m)&&
            sceRecord(m,context?._sceSettings||sceSettings(context)).signature===x.signature&&(m.swipe_id??null)===(x.swipeId??null);
    });
    return state;
}
function sceFeedbackPending(context,familyId,type='normal'){
    // Only a verified generation receipt may convert this into a learned outcome.
    if(!familyId)return;sceFeedbackState(context).pending={family:familyId,type,runId:sceActiveRun?.id??null};
}
function sceFeedbackComplete(context,run,message,index){
    if(!run.familyId||!run.observer||run.state!=='completed')return;
    const state=sceFeedbackReconcile(context),fp=sceFeedbackCachedFingerprint(message);
    state.outcomes=state.outcomes.filter(o=>o.index!==index);
    state.outcomes.push({index,family:run.familyId,signature:fp.signature,swipeId:message.swipe_id??null,
        fingerprint:{quotationBand:fp.quotationBand,paragraphShape:fp.paragraphShape,endingMark:fp.endingMark}});
    state.outcomes=state.outcomes.slice(-96);state.pending=null;sceFeedbackPersist(context,state);
}
function sceFeedbackDominant(samples){
    if(samples.length<4)return [];const result=[];
    for(const [key,label] of SCE_FEEDBACK_TRAITS){const counts=new Map();
        for(const x of samples){const v=x.fingerprint[key];counts.set(v,(counts.get(v)||0)+1);}
        const [value,count]=[...counts].sort((a,b)=>b[1]-a[1])[0];
        if(count>=Math.ceil(samples.length*.67))result.push({key,label,value,count,total:samples.length});}
    return result;
}
function sceFeedbackObserve(context=sceContext(),type='normal'){
    const s=context?._sceSettings||sceSettings(context),samples=sceFeedbackReplySamples(context,s.feedbackWindow,type);
    const frequency=key=>{const out={};for(const x of samples){const v=x.fingerprint[key];out[v]=(out[v]||0)+1;}return out;};
    const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:0;};
    const repeated=key=>{const m=new Map();for(const x of samples){const p=x.fingerprint[key];if(p)m.set(p,(m.get(p)||0)+1);}return [...m.values()].filter(n=>n>1).reduce((a,b)=>a+b,0);};
    const grams=new Map();for(const x of samples)for(const p of x.fingerprint.fourGrams)grams.set(p,(grams.get(p)||0)+1);
    return {available:samples.length,window:s.feedbackWindow,samples,medianWords:median(samples.map(x=>x.fingerprint.wordCount)),
        medianParagraphs:median(samples.map(x=>x.fingerprint.paragraphs)),meanQuotationPercent:samples.length?
            Math.round(100*samples.reduce((a,x)=>a+x.fingerprint.quotationShare,0)/samples.length):0,
        quotationBands:frequency('quotationBand'),paragraphShapes:frequency('paragraphShape'),endings:frequency('endingMark'),
        repeatedOpeningReplies:repeated('openingFour'),repeatedClosingReplies:repeated('closingFour'),
        sharedFourTokenSequences:[...grams.values()].filter(n=>n>=2).length,dominant:sceFeedbackDominant(samples),
        phraseSampling:samples.some(x=>x.fingerprint.phrasesSampled)};
}
function sceFeedbackFactors(context,report){
    const s=context?._sceSettings||sceSettings(context),factors=new Map(),result={ready:false,matched:0,dominant:[],factors};
    if(!sceEffective(s,'feedbackBalancerEnabled')||!report||report.available<4)return result;
    const traits=report.dominant.filter(x=>s.balanceTraits[x.key]);if(!traits.length)return result;
    const state=sceFeedbackState(context),chat=context?.chat||[];
    const outcomes=state.outcomes.filter(o=>sceValidOutcome(o)&&sceFeedbackMessageEligible(chat[o.index])&&
        sceRecord(chat[o.index],s).signature===o.signature&&(chat[o.index].swipe_id??null)===(o.swipeId??null));
    const associations=[];
    for(const id of Object.keys(SCE_STRUCTURE_FAMILIES)){
        const matches=outcomes.filter(x=>x.family===id);if(matches.length<2||s.structureWeights[id]===0)continue;
        const agreement=traits.reduce((sum,d)=>sum+matches.filter(x=>x.fingerprint[d.key]===d.value).length/matches.length,0)/traits.length;
        associations.push({id,agreement,samples:matches.length});
    }
    // No relative evidence means no effective adjustment, including common punctuation.
    if(associations.length<2||Math.max(...associations.map(x=>x.agreement))-Math.min(...associations.map(x=>x.agreement))<.05)return result;
    const baseline=associations.reduce((sum,x)=>sum+x.agreement,0)/associations.length;
    for(const x of associations){const confidence=Math.min(1,(x.samples-1)/4);
        const factor=Math.max(.6,Math.min(1.4,1+s.feedbackStrength/100*.8*(baseline-x.agreement)*confidence));
        factors.set(x.id,{factor,samples:x.samples});result.matched+=x.samples;}
    result.ready=true;result.dominant=traits;return result;
}
function sceFeedbackReportText(context=sceContext(),type='normal'){
    const s=sceSettings(context),r=sceFeedbackObserve(context,type),f=sceFeedbackFactors(context,r),w=sceEndingWatch(context,type);
    const freq=obj=>Object.entries(obj).map(([k,n])=>k+': '+n).join(' · ')||'none';
    const lines=['STRUCTURAL OBSERVER | measurements, not quality scores',
        'Model replies analyzed: '+r.available+' / '+r.window,'Median words: '+r.medianWords,'Median paragraphs: '+r.medianParagraphs,
        'Mean matched quotation coverage: '+r.meanQuotationPercent+'%','Quotation coverage bands: '+freq(r.quotationBands),
        'Paragraph-length arrangements: '+freq(r.paragraphShapes),'Terminal punctuation: '+freq(r.endings),
        'Replies sharing an exact 4-token opening: '+r.repeatedOpeningReplies,
        'Replies sharing an exact 4-token closing: '+r.repeatedClosingReplies,
        'Distinct 4-token sequences present in at least 2 replies: '+r.sharedFourTokenSequences,
        'Phrase analysis: '+(r.phraseSampling?'bounded head/tail samples; totals above use complete cleaned text':'complete'),
        '', 'BALANCER | successful, matched generations only',
        'Observer effective: '+sceOn(s,'feedbackObserverEnabled'),'Balancer effective: '+sceEffective(s,'feedbackBalancerEnabled'),
        'Evidence-based family adjustments: '+(f.ready?'relative differences observed':'none / insufficient contrasting evidence')];
    for(const [id,x] of f.factors)lines.push(SCE_STRUCTURE_FAMILIES[id].title+': ×'+x.factor.toFixed(3)+' ('+x.samples+' matched replies)');
    lines.push('','CLOSING-BEAT WATCH | lexical evidence, not semantic understanding',
        'Effective: '+sceEffective(s,'endingWatchEnabled'),
        'Corrective hint: '+(w?w.label+' ('+w.count+'/'+w.total+')':'none meeting evidence threshold'),
        'A family/outcome association is observational, not evidence of causation.');
    if(sceEffective(s,'endingWatchEnabled')){
        const weak=sceEndingObserve(context,type).motifs.filter(x=>x.kind==='activity'&&x.count>=s.endingWatchMinimum&&x.confidence<.75);
        lines.push('Low-confidence activity matches (not instructions): '+weak.length);
    }
    return lines.join('\n');
}

// One precedence-ordered packet. Preview and generation share this builder.
function sceFormatPrompt(roll){
    const lines=[];for(const x of roll?.layers||[])lines.push('Lens ['+x.title+']: '+x.instruction);
    if(roll?.word_sparks?.length)lines.push('Optional words: '+roll.word_sparks.map(x=>'"'+x+'"').join(', '));
    return lines.join('\n');
}
function sceFormatStructure(structure){
    if(!structure)return '';
    return ['Form: '+structure.family+' ('+structure.kind+').',
        structure.route?'Route: '+structure.route+'.':null,
        'Phases: '+structure.beats.map(x=>x.role).join(' → ')+'.',
        'Attention: '+structure.attention.join(':')+' ('+structure.attentionLabel+'); not paragraph counts.',
        'Transition: '+structure.transition+'.'].filter(Boolean).join('\n');
}
function sceFormatEndingWatch(watch){
    if(!watch)return '';
    if(watch.kind==='phrase')return 'Repeated closing wording ('+watch.count+'/'+watch.total+'): "'+watch.label.replace(/^literal closing wording: /u,'')+'". Vary the wording without forcing new events.';
    return 'Recurring close ('+watch.count+'/'+watch.total+'): '+watch.label+'. Avoid repeating or relocating this habit unless explicitly requested or required by continuity.';
}
function sceFormatCombined(roll,structure,watch=null,marker=''){
    if(!(roll?.layers?.length||roll?.word_sparks?.length||structure||watch))return '';
    const anchors=[...new Set([roll?.anchor,...(structure?.anchors||[])].filter(Boolean))].slice(0,1);
    const lines=['[STORY CHAOS ENGINE'+(marker?' '+marker:'')+']',
        'Preserve continuity, character knowledge, user agency and established formatting. These cues suggest possibilities, not facts.'];
    if(watch)lines.push(sceFormatEndingWatch(watch));
    if(structure)lines.push(sceFormatStructure(structure));
    const creative=sceFormatPrompt(roll);if(creative)lines.push(creative);
    if(anchors.length)lines.push('Existing context word: "'+anchors[0]+'".');
    if(structure&&!watch)lines.push('Close: '+structure.ending);
    lines.push('Use compatible cues in concrete events; skip conflicts. Output fiction only.','[/STORY CHAOS ENGINE]');
    return lines.join('\n');
}
function sceBuildPacket(context=sceContext(),preview=false,type='normal',marker=''){
    const s=structuredCloneSafe(sceSettings(context));
    const snapshot={...context,_sceSettings:s,_sceEntries:sceSnapshot(context,type)};
    snapshot._sceIndex=sceWordIndex(snapshot);
    const structure=sceStructuralRoll(snapshot,true,type),creative=sceLayeredRoll(snapshot,true,structure);
    const warning=sceEndingWatch(snapshot,type);
    // Soft caps are applied to choices, never by truncating continuity or agency instructions.
    let prompt=sceFormatCombined(creative,structure,warning,marker);
    while(prompt.split(/\s+/u).length>250&&creative.layers.length>1){creative.layers.pop();prompt=sceFormatCombined(creative,structure,warning,marker);}
    const packet={prompt,creative,structure,warning,settings:s,snapshot,words:prompt?prompt.trim().split(/\s+/u).length:0};
    if(!preview)sceCommitPacketHistory(context,packet);
    return packet;
}
function structuredCloneSafe(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
function sceCommitPacketHistory(context,p){
    const key=getChatKey(context),old=sceRecentCueHistory.get(key)||[];
    sceRecentCueHistory.set(key,[...p.creative.layers.map(x=>x.id+':'+x.instruction),...old].slice(0,15));
    const d=p.creative.layers.find(x=>x.id==='direction');if(d)recentModes.set(key,[d.instruction,...(recentModes.get(key)||[])].slice(0,6));
    if(p.creative.anchor)sceRecentAnchorHistory.set(key,[p.creative.anchor,...(sceRecentAnchorHistory.get(key)||[])].slice(0,5));
    if(p.structure){
        SCE_STRUCTURE_HISTORY.set(key,[sceStructureHistoryItem(p.structure),...(SCE_STRUCTURE_HISTORY.get(key)||[])].slice(0,8));
        if(p.structure.anchors.length)SCE_STRUCTURE_ANCHORS.set(key,[...p.structure.anchors,...(SCE_STRUCTURE_ANCHORS.get(key)||[])].slice(0,10));}
}

// Host integration. Rendering is evidence of display, NOT evidence of success.
const SCE_RUN_RECEIPTS=new SceBoundedMap();
let sceLifecycleStart=null,sceActiveRun=null,sceRunCounter=0,sceRuntimeEnabled=true;
let sceListeningSource=null,sceListeners=[],sceUiInitObserver=null,sceBootstrapTimer=null;
let sceToolRegistered=false,sceFinishTimer=null;
function sceClearPrompt(context=sceContext()) {context?.setExtensionPrompt?.(SCE_PROMPT_ID,'',1,0,false,1);}
function sceSafeClear(context=sceContext()){try{sceClearPrompt(context);}catch(error){console.warn('[Story Chaos Engine] Unable to clear the host prompt.',error);}}
function sceRunReceipt(context=sceContext()){return SCE_RUN_RECEIPTS.get(getChatKey(context))||null;}
function sceSetReceipt(context,receipt){if(receipt)SCE_RUN_RECEIPTS.set(getChatKey(context),receipt);else SCE_RUN_RECEIPTS.delete(getChatKey(context));sceRenderReceipt(context);}
function sceReceiptText(run){
    if(!run)return 'No generation checked in this session.';
    const guidance=run.payloadSeen?'guidance observed in assembled request':run.prompt?'guidance installed locally; outgoing request unverified':'no guidance selected';
    const labels={prepared:'Preparing reply',rendered:'Reply rendered; checking completion',completed:'✓ Host completion verified',
        stopped:'Stopped / partial',failed:'Generation failed / partial',unverified:'Completion unverified',
        invalidated:'Receipt invalidated by an edit or swipe',disabled:'Engine disabled',legacy:'Legacy tool output prepared'};
    let text=(labels[run.state]||'Status unavailable')+' · '+guidance;
    if(run.state==='completed')text+=' · '+run.words+' words';
    if(run.family)text+=' · '+run.family;
    if(run.warningSent)text+=' · repetition nudge included';
    if(run.repeatLabel)text+=' · recurring ending still observed';
    if(run.reason)text+=' · '+run.reason;
    return text;
}
function sceRenderReceipt(context=sceContext()){
    if(typeof document==='undefined')return;const el=document.getElementById('sce_run_receipt');if(!el)return;
    const run=sceRunReceipt(context);el.textContent=sceReceiptText(run);el.dataset.state=run?.state||'idle';
}
function sceReleaseRunSignal(run){if(!run)return;if(run.signal&&run.abortListener)run.signal.removeEventListener?.('abort',run.abortListener);run.signal=null;run.abortListener=null;run.processor=null;run.previousProcessor=null;}
function sceMarkUnsuccessful(run,state,reason){
    if(!run)return;run.state=state;run.reason=reason||'';
    if(run.toast&&typeof globalThis.toastr?.clear==='function')globalThis.toastr.clear(run.toast);run.toast=null;
    const ctx=sceContext();
    if(ctx&&getChatKey(ctx)===run.key){
        const m=ctx.chat?.[run.targetIndex];
        if(m?.is_user===false&&(run.targetMatched||sceCurrentRunMessage(ctx,run,run.targetIndex)))SCE_MESSAGE_STATUS.set(m,{raw:m.mes,state});
        const learned=sceFeedbackState(ctx);
        learned.pending=null;
        if(run.messageIndex!=null){learned.outcomes=learned.outcomes.filter(o=>o.index!==run.messageIndex);sceFeedbackPersist(ctx,learned);}
        sceSetReceipt(ctx,run);
    }
}
function sceGenerationStarted(type,options={},dryRun=false){
    if(dryRun)return;
    const context=sceContext();if(!context)return;
    const kind=type||'normal';
    if(!['normal','swipe','regenerate'].includes(kind)){
        // A quiet/continuation request has its own lifecycle. Its stop/end events
        // must never revoke or certify a prior normal response.
        if(sceActiveRun){
            if(!['completed','failed','stopped','invalidated'].includes(sceActiveRun.state))
                sceMarkUnsuccessful(sceActiveRun,'unverified','Overlapping unsupported generation');
            sceReleaseRunSignal(sceActiveRun);
        }
        sceActiveRun=null;sceLifecycleStart=null;
        return;
    }
    if(sceActiveRun){
        sceReleaseRunSignal(sceActiveRun);
        if(!['completed','failed','stopped','invalidated','disabled'].includes(sceActiveRun.state))
            sceMarkUnsuccessful(sceActiveRun,'unverified','Superseded by a new generation');
    }
    sceActiveRun=null;
    const last=context.chat?.at(-1);
    sceLifecycleStart={key:getChatKey(context),type:kind,started:Date.now(),signal:options?.signal||null,
        replacement:['swipe','regenerate'].includes(kind)&&last?.is_user===false?last:null};
}
function scePayloadText(data){
    const strings=[];
    const content=value=>{if(typeof value==='string')strings.push(value);else if(Array.isArray(value))
        for(const block of value)if(block?.type==='text'&&typeof block.text==='string')strings.push(block.text);};
    if(typeof data==='string')content(data);
    else if(Array.isArray(data)){for(const item of data)content(item?.content);}
    else if(sceObject(data)){
        for(const list of [data.messages,data.chat,Array.isArray(data.prompt)?data.prompt:null])if(Array.isArray(list))for(const m of list)content(m?.content);
        if(typeof data.prompt==='string')content(data.prompt);if(typeof data.input==='string')content(data.input);
    }
    return strings;
}
function sceObservePayload(data,dryRun=false,priority=1){
    const run=sceActiveRun,context=sceContext();
    if(!run||!context||getChatKey(context)!==run.key||dryRun||data?.dryRun||['stopped','failed','disabled','invalidated'].includes(run.state))return;
    const texts=scePayloadText(data);if(!texts.length)return;
    const normalize=t=>t.replace(/\s+/gu,' ').trim();
    const found=texts.some(t=>normalize(t).includes(normalize(run.prompt))&&t.includes(run.id));
    if(priority>=run.payloadPriority){run.payloadSeen=!!run.prompt&&found;run.payloadPriority=priority;}
    if(typeof data?.stream==='boolean')run.streaming=data.stream;
    const processor=context.streamingProcessor;
    if(processor&&processor!==run.previousProcessor){run.processor=processor;run.streaming=true;}
    sceRenderReceipt(context);
}
function sceCurrentRunMessage(context,run,id){
    if(id!==run.targetIndex)return null;const message=context.chat?.[id];
    if(!message||message.is_user!==false||message.is_system||typeof message.mes!=='string'||!message.mes.trim()||message.mes.trim()==='...'
        ||message.extra?.tool_calls||message.extra?.tool_result||message.extra?.type)return null;
    // A swipe must differ in text OR carry genuinely newer generation metadata.
    // Merely moving the swipe picker or rendering an old slot is not new evidence.
    if(run.before){
        const newer=Number(new Date(message.gen_started))>run.before.started&&Number(new Date(message.gen_finished))>=run.started;
        if(message.mes===run.before.raw&&!newer)return null;
        if((message.swipe_id??null)!==run.before.swipe&&Number(new Date(message.gen_finished))<run.started)return null;
    }
    return message;
}
function sceCaptureProcessor(context,run){
    const p=context.streamingProcessor;
    if(p&&p!==run.previousProcessor&&(p.messageId===run.targetIndex||p.messageId===-1||p.messageId==null)){
        run.processor=p;run.streaming=true;
    }
    return run.processor;
}
function sceReceive(messageId,type){
    const context=sceContext(),run=sceActiveRun,id=Number(messageId);
    if(!context||!run||getChatKey(context)!==run.key||['first_message','impersonate','quiet','continue'].includes(type))return;
    const message=sceCurrentRunMessage(context,run,id);if(!message)return;
    run.received=true;run.targetMatched=true;run.message=message;run.messageIndex=id;sceCaptureProcessor(context,run);
    sceScheduleFinish(run);
}
function sceReplyRendered(messageId,type){
    const context=sceContext(),run=sceActiveRun,id=Number(messageId);
    if(!context||!run||getChatKey(context)!==run.key||['first_message','impersonate','quiet','continue'].includes(type))return;
    if(['stopped','failed','disabled','invalidated'].includes(run.state))return;
    const message=sceCurrentRunMessage(context,run,id);if(!message)return;
    run.rendered=true;run.targetMatched=true;run.message=message;run.messageIndex=id;
    const p=sceCaptureProcessor(context,run);
    if(run.signal?.aborted||p?.abortController?.signal?.aborted||p?.isStopped){sceMarkUnsuccessful(run,'failed','Stream or request was aborted');return;}
    if(['prepared','unverified'].includes(run.state))run.state='rendered';
    sceRenderReceipt(context);sceScheduleFinish(run);
}
function sceGenerationEnded(){
    const context=sceContext(),run=sceActiveRun;if(!context||!run||getChatKey(context)!==run.key)return;
    run.ended=true;sceCaptureProcessor(context,run);sceScheduleFinish(run);
}
function sceGenerationStopped(){
    if(!sceActiveRun)return;sceMarkUnsuccessful(sceActiveRun,'stopped','Host stop event');
    if(sceFinishTimer){clearTimeout(sceFinishTimer);sceFinishTimer=null;}
}
function sceScheduleFinish(run){
    if(sceFinishTimer)clearTimeout(sceFinishTimer);
    if(typeof setTimeout==='function')sceFinishTimer=setTimeout(()=>{sceFinishTimer=null;sceGuard(sceFinalizeRun)(run);},0);
    else sceGuard(sceFinalizeRun)(run);
}
function sceFinalizeRun(run=sceActiveRun){
    const context=sceContext();
    if(!run||run!==sceActiveRun||!context||getChatKey(context)!==run.key)return;
    if(['failed','stopped','disabled','invalidated'].includes(run.state))return;
    const processor=sceCaptureProcessor(context,run);
    if(run.signal?.aborted||processor?.abortController?.signal?.aborted||processor?.isStopped){sceMarkUnsuccessful(run,'failed','Stream or request was aborted');return;}
    if(['failed','stopped','disabled','invalidated'].includes(run.state))return;
    const message=sceCurrentRunMessage(context,run,run.targetIndex);
    const streamed=processor?.messageId===run.targetIndex&&processor?.isFinished===true&&processor?.isStopped===false&&processor?.abortController?.signal?.aborted===false&&
        (processor.timeStarted==null||Number(new Date(processor.timeStarted))===Number(new Date(message?.gen_started)));
    const started=Number(new Date(message?.gen_started)),finished=Number(new Date(message?.gen_finished));
    const nonStream=run.streaming===false&&run.payloadSeen&&Number.isFinite(started)&&Number.isFinite(finished)&&
        finished>=started&&finished>=run.started&&(!run.before||started>run.before.started);
    const verified=message&&run.received&&run.rendered&&run.ended&&(streamed||nonStream);
    if(!verified){
        if(run.ended){run.state='unverified';run.reason=message?'Host completion evidence incomplete':'No matching completed response';sceSetReceipt(context,run);}
        return;
    }
    if(run.state==='completed')return;
    run.state='completed';run.reason='';run.completionRaw=message.mes;run.completionSwipe=message.swipe_id??null;
    SCE_MESSAGE_STATUS.set(message,{raw:message.mes,state:'completed'});
    const fp=sceFeedbackCachedFingerprint(message,run.settings);run.words=fp.wordCount;
    const warning=sceEndingWatch(context);run.repeatLabel=warning?.label||null;
    sceFeedbackComplete(context,run,message,run.targetIndex);sceSetReceipt(context,run);
    if(run.packet&&!run.historyCommitted){sceCommitPacketHistory(context,run.packet);run.historyCommitted=true;}
    if(run.settings.notifyAfterReply&&typeof globalThis.toastr?.info==='function'){
        run.toast=globalThis.toastr.info('🎲 Host completion verified · '+run.words+' words'+(run.payloadSeen?' · guidance seen in request':' · outgoing guidance unverified'),
            'Story Chaos Engine',{timeOut:2400,extendedTimeOut:800,preventDuplicates:true,progressBar:false});
    }
}
function sceHistoryChanged(){
    const ctx=sceContext();if(!ctx)return;const run=sceRunReceipt(ctx);
    if(run?.state==='completed'){
        const m=ctx.chat?.[run.targetIndex];
        if(!m||m.mes!==run.completionRaw||(m.swipe_id??null)!==run.completionSwipe)sceMarkUnsuccessful(run,'invalidated','Changed response is not the verified generation');
    }
    sceFeedbackReconcile(ctx);sceRefreshUI();
}
function sceChatChanged(){
    if(sceActiveRun){
        const run=sceActiveRun;sceReleaseRunSignal(run);
        if(!['completed','stopped','failed','invalidated'].includes(run.state)){run.state='unverified';run.reason='Chat changed during generation';}
        sceActiveRun=null;
    }
    sceLifecycleStart=null;sceSafeClear();sceRefreshUI();
}
function sceModelChanged(){
    sceModelEpoch++;SCE_FEEDBACK_STATES.clear();
    const context=sceContext();
    if(context?.chatMetadata?.storyChaosEngineLearning){delete context.chatMetadata.storyChaosEngineLearning;context.saveMetadataDebounced?.();}
    sceChatChanged();
}
function sceGuard(fn){return(...args)=>{try{return fn(...args);}catch(error){console.warn('[Story Chaos Engine] Non-blocking event fallback.',error);}};}
function sceSubscribeEvents(context=sceContext()){
    const source=context?.eventSource,types=context?.eventTypes;
    if(!source?.on||!types||source===sceListeningSource)return;
    sceUnsubscribeEvents();sceListeningSource=source;
    const handlers={GENERATION_STARTED:sceGenerationStarted,GENERATION_STOPPED:sceGenerationStopped,GENERATION_ENDED:sceGenerationEnded,
        MESSAGE_RECEIVED:sceReceive,CHARACTER_MESSAGE_RENDERED:sceReplyRendered,CHAT_CHANGED:sceChatChanged,
        MESSAGE_EDITED:sceHistoryChanged,MESSAGE_UPDATED:sceHistoryChanged,MESSAGE_DELETED:sceHistoryChanged,
        MESSAGE_SWIPED:sceHistoryChanged,MESSAGE_SWIPE_DELETED:sceHistoryChanged,
        CHATCOMPLETION_MODEL_CHANGED:sceModelChanged,CHATCOMPLETION_SOURCE_CHANGED:sceModelChanged,
        MAIN_API_CHANGED:sceModelChanged,CONNECTION_PROFILE_LOADED:sceModelChanged,
        CHAT_COMPLETION_PROMPT_READY:(data)=>sceObservePayload(data,data?.dryRun,1),
        GENERATE_AFTER_DATA:(data,dry)=>sceObservePayload(data,dry,2),
        CHAT_COMPLETION_SETTINGS_READY:(data)=>sceObservePayload(data,false,3),
        TEXT_COMPLETION_SETTINGS_READY:(data)=>sceObservePayload(data,false,3),
        APP_READY:sceInit,EXTENSION_SETTINGS_LOADED:sceRefreshUI};
    for(const [name,fn] of Object.entries(handlers))if(types[name]){const guarded=sceGuard(fn);source.on(types[name],guarded);sceListeners.push([types[name],guarded]);}
}
function sceUnsubscribeEvents(){
    for(const [event,fn] of sceListeners){if(sceListeningSource?.removeListener)sceListeningSource.removeListener(event,fn);else sceListeningSource?.off?.(event,fn);}
    sceListeners=[];sceListeningSource=null;
}
globalThis.storyChaosEngineInterceptor=async function(_chat,_contextSize,_abort,type){
    const context=sceContext();if(!context?.setExtensionPrompt)return;
    try{
        const settings=sceSettings(context),kind=type||'normal';
        sceSubscribeEvents(context);
        if(!sceRuntimeEnabled||!settings.enabled||settings.mode!=='automatic'||!['normal','regenerate','swipe'].includes(kind)){
            sceSafeClear(context);return;
        }
        if(sceActiveRun){sceReleaseRunSignal(sceActiveRun);if(!['completed','failed','stopped','invalidated'].includes(sceActiveRun.state))
            sceMarkUnsuccessful(sceActiveRun,'unverified','Replaced by another request');}
        sceActiveRun=null;
        const lifecycle=sceLifecycleStart?.key===getChatKey(context)&&sceLifecycleStart.type===kind?sceLifecycleStart:null;
        const started=lifecycle?.started??Date.now(),targetIndex=kind==='swipe'?Math.max(0,(context.chat?.length||0)-1):(context.chat?.length||0);
        const prior=kind==='swipe'?context.chat?.[targetIndex]:null;
        const id='SCE-'+(++sceRunCounter)+'-'+randomInt(1000000);
        const packet=sceBuildPacket(context,true,kind,id);
        // Preparation is synchronous. One atomic replacement, or a clear in the failure handler.
        context.setExtensionPrompt(SCE_PROMPT_ID,packet.prompt,1,0,false,settings.role==='system'?0:1);
        const run={id,key:getChatKey(context),type:kind,started,targetIndex,state:'prepared',prompt:packet.prompt,packet:{creative:packet.creative,structure:packet.structure},
            settings:packet.settings,layers:packet.creative.layers.length,family:packet.structure?.family||null,
            familyId:packet.structure?.familyId||null,observer:sceOn(packet.settings,'feedbackObserverEnabled'),
            warningSent:!!packet.warning,payloadSeen:false,payloadPriority:0,streaming:null,received:false,rendered:false,ended:false,
            before:prior?{raw:prior.mes,swipe:prior.swipe_id??null,started:Number(new Date(prior.gen_started))||0}:null,
            previousProcessor:context.streamingProcessor||null,processor:null,signal:lifecycle?.signal||null};
        sceActiveRun=run;
        if(run.signal){run.abortListener=()=>sceMarkUnsuccessful(run,'stopped','Request signal aborted');run.signal.addEventListener?.('abort',run.abortListener,{once:true});}
        sceSetReceipt(context,run);if(run.signal?.aborted)sceMarkUnsuccessful(run,'stopped','Request signal already aborted');
        if(packet.structure&&run.observer)sceFeedbackPending(context,packet.structure.familyId,kind);
        const label=typeof document!=='undefined'?document.getElementById('sce_last_roll'):null;
        if(label)label.textContent='Prepared '+run.layers+' lens(es) · '+packet.words+' injected words';
    }catch(error){
        console.error('[Story Chaos Engine] Preparation failed; ordinary generation remains available.',error);
        sceSafeClear(context);
        if(sceActiveRun)sceMarkUnsuccessful(sceActiveRun,'failed','Extension preparation error');
        else sceSetReceipt(context,{state:'failed',reason:'Extension preparation error',prompt:''});
    }
};
function register(){
    const context=sceContext();if(!context?.registerFunctionTool)return false;
    context.registerFunctionTool({name:'story_chaos_roll',displayName:'Story Chaos Roll',description:'Get optional creative and structural guidance for the next fiction reply. Takes no arguments.',
        parameters:{$schema:'http://json-schema.org/draft-04/schema#',type:'object',properties:{},additionalProperties:false},
        action:async()=>{const current=sceContext(),s=sceSettings(current);if(!sceRuntimeEnabled||!s.enabled||s.mode!=='tool')return '{}';
            // An invoked tool consumes its selections, without asserting response completion.
            const packet=sceBuildPacket(current,false);sceSetReceipt(current,{state:'legacy',prompt:packet.prompt,
                reason:'Completion monitoring requires automatic mode'});
            return JSON.stringify({...packet.creative,structural:packet.structure,endingWatch:packet.warning,guidance:packet.prompt});},
        formatMessage:()=> 'Creative guidance prepared',stealth:false});return true;
}
function sceSyncTool(context=sceContext()){
    const s=sceSettings(context),wanted=sceRuntimeEnabled&&s.enabled&&s.mode==='tool';
    if(wanted&&!sceToolRegistered)sceToolRegistered=register();
    else if(!wanted&&sceToolRegistered){context?.unregisterFunctionTool?.('story_chaos_roll');sceToolRegistered=false;}
}
function sceDispose(){
    sceRuntimeEnabled=false;sceReleaseRunSignal(sceActiveRun);
    if(sceActiveRun&&sceActiveRun.state!=='completed')sceMarkUnsuccessful(sceActiveRun,'disabled','Extension disabled');
    sceActiveRun=null;sceLifecycleStart=null;
    if(sceFinishTimer)clearTimeout(sceFinishTimer);sceFinishTimer=null;
    if(sceBootstrapTimer)clearTimeout(sceBootstrapTimer);sceBootstrapTimer=null;
    sceUiInitObserver?.disconnect();sceUiInitObserver=null;sceUnsubscribeEvents();sceSafeClear();sceSyncTool();
    for(const map of [SCE_RECORD_CACHE,sceWordIndexCache,SCE_FEEDBACK_STATES,SCE_RUN_RECEIPTS,recentModes,sceRecentCueHistory,sceRecentAnchorHistory,SCE_STRUCTURE_HISTORY,SCE_STRUCTURE_ANCHORS])map.clear();
    if(typeof document!=='undefined')document.getElementById('sce_settings')?.remove();
}

// UI values are assigned with .value / .textContent, never interpolated as HTML.
function sceNode(id){return typeof document!=='undefined'?document.getElementById('sce_'+id):null;}
function sceMutate(mutator){
    const ctx=sceContext();if(!ctx)return;mutator(sceSettings(ctx));sceSettings(ctx);ctx.saveSettingsDebounced?.();sceRefreshUI();
}
function sceSlider(id,label,min=0,max=100){return '<label class="sce_line" for="sce_'+id+'"><span>'+label+'</span><output id="sce_'+id+'_out"></output></label>'+ '<input type="range" id="sce_'+id+'" min="'+min+'" max="'+max+'" step="1">';}
function sceWeightControls(defs,prefix){return Object.entries(defs).map(([id,def])=>
    '<label class="sce_cat" for="sce_'+prefix+id+'"><span>'+(def.name||def.title)+'</span>'+ '<select class="text_pole" id="sce_'+prefix+id+'"><option value="0">Off</option><option value="1">Low</option><option value="2">Normal</option><option value="3">High</option></select></label>').join('');}
function sceFeatureControl(key,label){return '<label class="sce_line" for="sce_override_'+key+'"><span>'+label+'</span>'+ '<select class="text_pole" id="sce_override_'+key+'"><option value="auto">Auto</option><option value="on">On</option><option value="off">Off</option></select></label>'+ '<small id="sce_effective_'+key+'"></small>';}
function sceAdvancedUI(panel){
    const root=panel.querySelector('.sce_main_body');if(!root)return;
    const section=document.createElement('details');section.className='sce_group sce_advanced';
    section.innerHTML='<summary>Advanced controls</summary><div class="sce_stack">'+
        '<label for="sce_mode">Operating mode</label><select class="text_pole" id="sce_mode"><option value="automatic">Automatic injection</option><option value="tool">Legacy function calling</option><option value="off">Off</option></select>'+
        '<small id="sce_legacy_note">Legacy mode requires provider tool support and has no verified completion receipts.</small>'+
        '<label for="sce_role">Injection role</label><select class="text_pole" id="sce_role"><option value="user">User</option><option value="system">System</option></select>'+
        sceSlider('intensity','Creative randomness')+sceSlider('layers','Maximum creative lenses',1,5)+sceSlider('gravity','Context gravity')+
        '<label for="sce_scope">Context window</label><select class="text_pole" id="sce_scope"><option value="full">Available history (bounded)</option><option value="recent">Recent 16 story messages</option></select>'+
        '<details class="sce_group"><summary>Creative category weights</summary>'+sceWeightControls(SCE_CATEGORIES,'cat_')+'</details>'+
        '<label class="sce_line" for="sce_antirepeat"><span>Discourage recent cues and anchors</span><input type="checkbox" id="sce_antirepeat"></label>'+
        '<label for="sce_hidden_tags">Additional hidden block names (optional)</label><input class="text_pole" type="text" id="sce_hidden_tags" maxlength="2400" placeholder="my_tracker, character_state">'+
        '<small>Names of XML-like blocks to exclude from analysis. Unclosed recognized blocks are also excluded.</small>'+
        '</div>';
    root.appendChild(section);
}
function sceStructureUI(panel){
    const section=document.createElement('details');section.className='sce_group sce_structure_section';
    section.innerHTML='<summary>Structural Entropy</summary><div class="sce_stack">'+sceFeatureControl('structureEnabled','Structural guidance')+
        sceSlider('structure_influence','Structure influence')+sceSlider('structure_density','Beat density')+sceSlider('structure_grounding','Context grounding')+
        '<label class="sce_line" for="sce_structure_anti_repeat"><span>Discourage recently used structures</span><input type="checkbox" id="sce_structure_anti_repeat"></label>'+
        '<small>'+Object.keys(SCE_STRUCTURE_FAMILIES).length+' families with automatic route and attention variation. Soft recency penalties avoid a forced rotation; attention ratios do not set paragraph counts.</small>'+
        '<details class="sce_group"><summary>Structure family weights</summary>'+sceWeightControls(SCE_STRUCTURE_FAMILIES,'structure_')+'</details></div>';
    panel.querySelector('.sce_main_body')?.appendChild(section);
}
function sceFeedbackUI(panel){
    const section=document.createElement('details');section.className='sce_group sce_feedback_section';
    section.innerHTML='<summary>Monitoring and feedback</summary><div class="sce_stack">'+
        sceFeatureControl('feedbackObserverEnabled','Structural Observer')+sceFeatureControl('feedbackBalancerEnabled','Adaptive Balancer')+
        sceSlider('feedback_strength','Balancing strength')+
        '<label for="sce_feedback_window">Previous replies to measure</label><select class="text_pole" id="sce_feedback_window"><option value="4">4</option><option value="8">8</option><option value="16">16</option></select>'+
        '<details class="sce_group"><summary>Traits the Balancer may vary</summary>'+
        SCE_FEEDBACK_TRAITS.map(([key,label])=>'<label class="sce_line"><span>'+label+'</span><input type="checkbox" id="sce_trait_'+key+'"></label>').join('')+
        '<small>Punctuation and paragraph arrangement are not variation targets by default. Leave them off when your main prompt fixes the format.</small></details>'+
        sceFeatureControl('endingWatchEnabled','Closing-Beat Watch')+sceSlider('ending_strength','Correction sensitivity')+
        '<small>Lower values require stronger evidence. This is a heuristic sensitivity control, not a probability of correctness.</small>'+
        '<label for="sce_ending_window">Previous replies to check</label><select class="text_pole" id="sce_ending_window"><option value="4">4</option><option value="8">8</option><option value="16">16</option></select>'+
        '<label for="sce_ending_minimum">Minimum matching endings</label><select class="text_pole" id="sce_ending_minimum"><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>'+
        '<div class="sce_actions"><button type="button" class="menu_button" id="sce_feedback_analyze">Analyze replies</button><button type="button" class="menu_button" id="sce_feedback_reset">Reset learned associations</button></div>'+
        '<pre class="sce_preview" id="sce_feedback_report" hidden></pre></div>';
    panel.querySelector('.sce_main_body')?.appendChild(section);
}
const SCE_UI_SLIDERS=[['intensity','intensity'],['layers','maxLayers'],['gravity','contextGravity'],['keywordboost','keywordBoost'],
    ['structure_influence','structureInfluence'],['structure_density','beatDensity'],['structure_grounding','structureGrounding'],
    ['feedback_strength','feedbackStrength'],['ending_strength','endingWatchStrength']];
function sceRefreshUI(){
    const ctx=sceContext();if(!ctx||typeof document==='undefined'||!document.getElementById('sce_settings'))return;
    const s=sceSettings(ctx);
    const value=(id,v)=>{const el=sceNode(id);if(el)el.value=String(v);};
    const check=(id,v)=>{const el=sceNode(id);if(el)el.checked=!!v;};
    check('enabled',s.enabled&&s.mode!=='off');check('autopilot',s.autopilotEnabled);check('notify',s.notifyAfterReply);
    value('preset',scePresetMatch(s));value('keywords',s.customKeywords);value('hidden_tags',s.hiddenTags);value('mode',s.mode);value('role',s.role);value('scope',s.contextScope);
    check('antirepeat',s.antiRepeat);check('structure_anti_repeat',s.structureAntiRepeat);
    for(const [id,key] of SCE_UI_SLIDERS){value(id,s[key]);const out=sceNode(id+'_out');if(out)out.textContent=s[key]+(id==='layers'?'':'%');}
    for(const [id,key] of [['feedback_window','feedbackWindow'],['ending_window','endingWatchWindow'],['ending_minimum','endingWatchMinimum']])value(id,s[key]);
    const minimum=sceNode('ending_minimum');if(minimum?.options)for(const option of minimum.options)option.disabled=Number(option.value)>s.endingWatchWindow;
    for(const key of SCE_FEATURES){value('override_'+key,s.featureOverrides[key]);const label=sceNode('effective_'+key);
        if(label)label.textContent='Effective: '+(sceEffective(s,key)?'On':'Off / prerequisite disabled')+' · '+
            (s.featureOverrides[key]==='auto'?(s.autopilotEnabled?'controlled by Autopilot':'using saved individual setting'):'explicit override');}
    for(const [key] of SCE_FEEDBACK_TRAITS)check('trait_'+key,s.balanceTraits[key]);
    for(const id of Object.keys(SCE_CATEGORIES))value('cat_'+id,s.categoryWeights[id]);
    for(const id of Object.keys(SCE_STRUCTURE_FAMILIES))value('structure_'+id,s.structureWeights[id]);
    sceRenderReceipt(ctx);
}
function sceCancelCurrent(reason){
    sceSafeClear();
    if(sceActiveRun){if(sceActiveRun.state!=='completed')sceMarkUnsuccessful(sceActiveRun,'unverified',reason);sceReleaseRunSignal(sceActiveRun);sceActiveRun=null;}
    sceLifecycleStart=null;
}
function sceBindUI(){
    const on=(id,event,fn)=>{const el=sceNode(id);if(!el)throw new Error('Missing control: '+id);el.addEventListener(event,fn);};
    on('enabled','change',e=>{sceMutate(s=>{s.enabled=e.target.checked;if(s.enabled&&s.mode==='off')s.mode='automatic';});
        if(!e.target.checked)sceCancelCurrent('Engine disabled');sceSyncTool();});
    on('autopilot','change',e=>{sceMutate(s=>{s.autopilotEnabled=e.target.checked;if(s.autopilotEnabled){s.enabled=true;s.mode='automatic';}});sceSyncTool();});
    on('apply_preset','click',()=>sceApplyPreset(sceContext(),sceNode('preset').value));
    on('keywords','input',e=>sceMutate(s=>{s.customKeywords=e.target.value.slice(0,2400);}));
    on('hidden_tags','input',e=>sceMutate(s=>{s.hiddenTags=e.target.value.slice(0,2400);}));
    on('notify','change',e=>sceMutate(s=>{s.notifyAfterReply=e.target.checked;}));
    on('mode','change',e=>{sceMutate(s=>{s.mode=e.target.value;if(s.mode!=='automatic')s.autopilotEnabled=false;if(s.mode==='off')s.enabled=false;});sceCancelCurrent('Operating mode changed');sceSyncTool();});
    on('role','change',e=>sceMutate(s=>{s.role=e.target.value;}));
    on('scope','change',e=>sceMutate(s=>{s.contextScope=e.target.value;}));
    on('antirepeat','change',e=>sceMutate(s=>{s.antiRepeat=e.target.checked;}));
    on('structure_anti_repeat','change',e=>sceMutate(s=>{s.structureAntiRepeat=e.target.checked;}));
    for(const [id,key] of SCE_UI_SLIDERS)on(id,'input',e=>sceMutate(s=>{s[key]=Number(e.target.value);}));
    for(const key of SCE_FEATURES)on('override_'+key,'change',e=>sceMutate(s=>{s.featureOverrides[key]=e.target.value;}));
    for(const [key] of SCE_FEEDBACK_TRAITS)on('trait_'+key,'change',e=>sceMutate(s=>{s.balanceTraits[key]=e.target.checked;}));
    for(const [id,key] of [['feedback_window','feedbackWindow'],['ending_window','endingWatchWindow'],['ending_minimum','endingWatchMinimum']])
        on(id,'change',e=>sceMutate(s=>{s[key]=Number(e.target.value);}));
    for(const id of Object.keys(SCE_CATEGORIES))on('cat_'+id,'change',e=>sceMutate(s=>{s.categoryWeights[id]=Number(e.target.value);}));
    for(const id of Object.keys(SCE_STRUCTURE_FAMILIES))on('structure_'+id,'change',e=>sceMutate(s=>{s.structureWeights[id]=Number(e.target.value);}));
    on('preview','click',()=>{const p=sceBuildPacket(sceContext(),true);const el=sceNode('preview_text');
        el.textContent=(p.prompt||'No active cues or keywords.')+'\n\nSampled preview · '+p.words+' words. Includes adaptive selection and eligible ending corrections; does not consume history.';el.hidden=false;});
    on('feedback_analyze','click',()=>{const el=sceNode('feedback_report');el.textContent=sceFeedbackReportText();el.hidden=false;});
    on('feedback_reset','click',()=>{const ctx=sceContext();SCE_FEEDBACK_STATES.delete(sceFeedbackIdentity(ctx));
        if(ctx?.chatMetadata){delete ctx.chatMetadata.storyChaosEngineLearning;ctx.saveMetadataDebounced?.();}
        const el=sceNode('feedback_report');el.textContent='Learned associations cleared. Saved story messages are unchanged.';el.hidden=false;});
}
function sceWaitForSettingsPanel(){
    if(sceUiInitObserver||!sceRuntimeEnabled||typeof document==='undefined'||!document.body||typeof MutationObserver!=='function')return;
    sceUiInitObserver=new MutationObserver(()=>{
        if(!sceContext()||!document.getElementById('extensions_settings'))return;
        sceUiInitObserver.disconnect();sceUiInitObserver=null;sceInit();
    });sceUiInitObserver.observe(document.body,{childList:true,subtree:true});
}
function sceInit(){
    if(!sceRuntimeEnabled)return;const ctx=sceContext();if(!ctx){sceWaitForSettingsPanel();return;}
    sceSubscribeEvents(ctx);sceSettings(ctx);sceSyncTool(ctx);
    if(typeof document==='undefined')return;
    const root=document.getElementById('extensions_settings');if(!root){sceWaitForSettingsPanel();return;}
    if(document.getElementById('sce_settings')){sceRefreshUI();return;}
    const panel=document.createElement('div');panel.id='sce_settings';
    panel.innerHTML='<details class="sce_main_group"><summary>🎲 Story Chaos Engine · v'+SCE_VERSION+'</summary><div class="sce_main_body">'+
        '<label class="sce_line" for="sce_enabled"><strong>Engine enabled</strong><input type="checkbox" id="sce_enabled"></label>'+
        '<label class="sce_line" for="sce_autopilot"><span>Autopilot</span><input type="checkbox" id="sce_autopilot"></label>'+
        '<small>Autopilot supplies defaults. Explicit feature Off overrides are always honored.</small>'+
        '<label for="sce_preset">Creative tuning</label><div class="sce_actions"><select class="text_pole" id="sce_preset"><option value="custom">Custom / current settings</option><option value="subtle">Subtle</option><option value="balanced">Balanced</option><option value="wild">Wild</option></select><button type="button" class="menu_button" id="sce_apply_preset">Apply preset</button></div>'+
        '<label for="sce_keywords">Your optional keywords</label><textarea class="text_pole" id="sce_keywords" rows="3" maxlength="2400" placeholder="coffee, velvet, awkward pause"></textarea>'+
        sceSlider('keywordboost','Keyword influence')+
        '<label class="sce_line" for="sce_notify"><span>Brief verified-completion notifications</span><input type="checkbox" id="sce_notify"></label>'+
        '<div class="sce_run_receipt" id="sce_run_receipt" role="status" aria-live="polite"></div>'+
        '<small>Host completion and observed prompt inclusion are separate checks. Neither proves the model followed its cues.</small>'+
        '<small id="sce_last_roll">No roll this session.</small>'+
        '<button type="button" class="menu_button" id="sce_preview">Preview complete packet</button><pre class="sce_preview" id="sce_preview_text" hidden></pre>'+
        '</div></details>';
    root.appendChild(panel);
    try{sceAdvancedUI(panel);sceStructureUI(panel);sceFeedbackUI(panel);sceBindUI();sceRefreshUI();}
    catch(error){panel.remove();console.error('[Story Chaos Engine] Settings UI failed.',error);}
}
globalThis.storyChaosEngineLifecycle={
    enable(){sceRuntimeEnabled=true;sceInit();},disable:sceDispose,activate:sceInit,
};
if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sceInit,{once:true});else sceInit();
}

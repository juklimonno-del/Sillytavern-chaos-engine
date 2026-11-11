// Story Chaos Engine v1.4.0: prompt injection by default, legacy function calling optional.
// No external API calls, server dependencies, or model-generated random inputs.

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
    'character-specific initiative',
    'a neglected object or setting detail',
    'unspoken social expectations',
    'an existing promise or obligation',
    'a secondary character’s independent agenda',
    'a physical task with practical consequences',
    'a different interpretation of something already said',
    'an unexpected but believable bit of competence',
    'an embarrassing but non-catastrophic mistake',
    'a habit, grudge, fixation, or preference',
    'a change in who has the conversational initiative',
    'the environment carrying on regardless of the cast',
    'ordinary logistics',
    'a minor discovery that matters to one character',
    'a previous action causing a delayed consequence',
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

const recentModes = new Map();

function randomInt(max) {
    if (!Number.isSafeInteger(max) || max < 1) throw new Error('Invalid random range');
    if (globalThis.crypto?.getRandomValues) {
        // Rejection sampling avoids modulo bias.
        const range = 0x100000000;
        const limit = range - (range % max);
        const buffer = new Uint32Array(1);
        do {
            globalThis.crypto.getRandomValues(buffer);
        } while (buffer[0] >= limit);
        return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
}

function pick(values) {
    return values[randomInt(values.length)];
}

function pickFresh(values, recent) {
    const available = values.filter(value => !recent.includes(value));
    return pick(available.length ? available : values);
}

function getChatKey() {
    const context = SillyTavern.getContext();
    return String(context.chatId ?? context.chatMetadata?.chat_id ?? 'session');
}

function generateCreativeRoll(preview = false) {
    const key = getChatKey();
    const recent = recentModes.get(key) ?? [];
    const mode = pickFresh(MODES, recent);
    if (!preview) recentModes.set(key, [mode, ...recent].slice(0, 6));

    const result = {
        roll: randomInt(1000) + 1,
        creative_mode: mode,
        focus: pick(FOCUSES),
    };

    // Vary the *number* of cues, so every turn does not acquire a fixed recipe.
    if (randomInt(100) < 48) result.rhythm = pick(RHYTHMS);
    if (randomInt(100) < 28) result.wildcard = pick(WILDCARDS);

    result.guidance = 'Use these as optional creative directions, not literal events or mandatory beats. Preserve established characters, continuity, and the user character’s agency. Do not quote these fields or force a complication merely to satisfy the roll.';
    return JSON.stringify(result);
}

function register() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context?.registerFunctionTool) {
        console.warn('[Story Chaos Engine] Function tool registration is not available.');
        return;
    }

    context.registerFunctionTool({
        name: 'story_chaos_roll',
        displayName: 'Story Chaos Roll',
        description: 'Before writing the next normal roleplay or fiction reply, call this tool once to receive externally randomized creative directions. The function takes NO arguments, so the author cannot select a convenient result. Apply the cues flexibly and preserve continuity. Never narrate the tool output.',
        parameters: {
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
        action: async () => {
            const roll = sceLayeredRoll(context);
            const structure = sceSettings(context).structureEnabled ? sceStructuralRoll(context) : null;
            return JSON.stringify({...roll, structural: structure});
        },
        formatMessage: () => 'Rolling a new creative direction...',
        stealth: false,
    });

    console.info('[Story Chaos Engine] story_chaos_roll registered.');
}


// --- Gemini-compatible automatic injection ---
// SillyTavern executes this hook before assembling the next generation prompt.
// This avoids the second API request that some OpenAI->Google proxies reject.
const SCE_PROMPT_ID = 'story_chaos_engine_auto';
const SCE_SETTINGS_KEY = 'storyChaosEngine';
let sceToolRegistered = false;

function sceSettings(context = globalThis.SillyTavern?.getContext?.()) {
    if (!context?.extensionSettings) return { mode: 'automatic', role: 'user' };
    const settings = context.extensionSettings[SCE_SETTINGS_KEY] ??= {};
    if (!['automatic', 'tool', 'off'].includes(settings.mode)) settings.mode = 'automatic';
    if (!['user', 'system'].includes(settings.role)) settings.role = 'user';
    for (const [name, fallback] of Object.entries(SCE_ADV_DEFAULTS)) {
        if (settings[name] === undefined) settings[name] = fallback;
    }
    settings.intensity = sceBound(settings.intensity, 55, 0, 100);
    settings.maxLayers = sceBound(settings.maxLayers, 3, 1, 5);
    settings.contextGravity = sceBound(settings.contextGravity, 75, 0, 100);
    settings.keywordBoost = sceBound(settings.keywordBoost, 30, 0, 100);
    if (!['full','recent'].includes(settings.contextScope)) settings.contextScope = 'full';
    if (typeof settings.customKeywords !== 'string') settings.customKeywords = '';
    settings.customKeywords = settings.customKeywords.slice(0, 2400);
    if (typeof settings.antiRepeat !== 'boolean') settings.antiRepeat = true;
    if (!settings.categoryWeights || typeof settings.categoryWeights !== 'object') settings.categoryWeights = {};
    for (const [name, cat] of Object.entries(SCE_CATEGORIES)) {
        settings.categoryWeights[name] = sceBound(settings.categoryWeights[name], cat.weight, 0, 3);
    }
    for (const [key, fallback] of Object.entries(SCE_STRUCTURE_DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = fallback;
    }
    if (typeof settings.structureEnabled !== 'boolean') settings.structureEnabled = false;
    settings.structureInfluence = sceBound(settings.structureInfluence, 65, 0, 100);
    settings.beatDensity = sceBound(settings.beatDensity, 55, 0, 100);
    settings.structureGrounding = sceBound(settings.structureGrounding, 75, 0, 100);
    if (typeof settings.structureAntiRepeat !== 'boolean') settings.structureAntiRepeat = true;
    if (!settings.structureWeights || typeof settings.structureWeights !== 'object' ||
        Array.isArray(settings.structureWeights)) settings.structureWeights = {};
    for (const [id,family] of Object.entries(SCE_STRUCTURE_FAMILIES)) {
        settings.structureWeights[id] = sceBound(settings.structureWeights[id], family.weight, 0, 3);
    }
    return settings;
}

function sceClearPrompt(context) {
    context?.setExtensionPrompt?.(SCE_PROMPT_ID, '', 1, 0, false, 1);
}

function sceFormatPrompt(roll) {
    const lines = [
        '[STORY CHAOS ENGINE: EXTERNAL CREATIVE CUES, NOT CHARACTER SPEECH]',
        'Roll: ' + roll.roll + '/1000 | Randomness: ' + sceSettings().intensity + '/100',
    ];
    if (roll.anchor) lines.push('Existing story anchor: "' + roll.anchor + '"');
    if (roll.word_sparks?.length) lines.push('Optional word sparks: ' +
        roll.word_sparks.map(x=>'"'+x+'"').join(', '));
    for (const layer of (roll.layers || []))
        lines.push('Optional lens [' + layer.title + ']: ' + layer.instruction);
    lines.push(
        'These are separate creative possibilities, NOT a mandatory beat sequence; discard anything that does not fit.',
        'Preserve existing characters, established continuity, output formatting, and the human user character’s choices.',
        'Scene anchors come from prior story text. All word sparks are suggestions, not canon facts.',
        'This is an extension-generated note, not dialogue from {{user}} or {{char}}. Do not quote it or describe the roll.',
        '[/STORY CHAOS ENGINE]'
    );
    return lines.join('\n');
}

// Invoked automatically for each non-dry-run generation by SillyTavern.
globalThis.storyChaosEngineInterceptor = async function(_chat, _contextSize, _abort, type) {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context?.setExtensionPrompt) return;

    const options = sceSettings(context);
    if (options.mode !== 'automatic' ||
        ![undefined, null, '', 'normal', 'regenerate', 'swipe'].includes(type)) {
        sceClearPrompt(context);
        return;
    }
    const result = sceLayeredRoll(context);
    const structural = options.structureEnabled ? sceStructuralRoll(context) : null;
    // Depth 0 in a USER role keeps Gemini proxies from ending the prompt on
    // a model turn. Users can switch to a system-role injection if preferred.
    const role = options.role === 'system' ? 0 : 1;
    context.setExtensionPrompt(SCE_PROMPT_ID, sceFormatCombined(result, structural), 1, 0, false, role);
    const label = typeof document !== 'undefined' && document.getElementById('sce_last_roll');
    if (label) label.textContent = 'Latest roll: ' + result.roll + ' · ' + result.creative_mode;
    console.debug('[Story Chaos Engine] Automatic seed injected.');
};

function sceSyncTool(context = globalThis.SillyTavern?.getContext?.()) {
    if (!context) return;
    const wanted = sceSettings(context).mode === 'tool';
    if (wanted && !sceToolRegistered) {
        register();
        sceToolRegistered = true;
    } else if (!wanted && sceToolRegistered) {
        context.unregisterFunctionTool?.('story_chaos_roll');
        sceToolRegistered = false;
    }
}


/* Layered randomness (v1.3): browser-side, no additional API round trip. */
const SCE_CATEGORIES = {
    direction: {name:'Story direction',weight:3,triggers:[],cues:[],words:['detour','priority','surprise','callback']},
    character: {name:'Character impulses',weight:2,triggers:['want','need','habit','pride','refuse'],cues:[
        'A private priority quietly changes a character’s behavior.',
        'An ordinary habit suggests an unexpected next action.',
        'Someone makes a confident but questionable personal choice.'
    ],words:['impulse','fixation','habit','pride']},
    dialogue: {name:'Dialogue & voice',weight:2,triggers:['ask','speak','talk','question','whisper'],cues:[
        'Let a character speak in their own peculiar rhythm.',
        'A tiny misunderstanding redirects the exchange.',
        'Someone answers a serious question with a mundane concern.'
    ],words:['pause','tangent','interruption','misquote']},
    social: {name:'Relationships & friction',weight:2,triggers:['friend','trust','jealous','kiss','promise'],cues:[
        'A social expectation quietly changes what someone does.',
        'Two characters interpret the same gesture differently.',
        'Someone becomes surprisingly petty about a minor issue.'
    ],words:['favor','grudge','courtesy','obligation']},
    setting: {name:'Setting & objects',weight:2,triggers:['room','door','table','couch','kitchen','window','rain'],cues:[
        'An overlooked object already present becomes relevant.',
        'The environment creates a practical obstacle.',
        'An ordinary object is repurposed in an unexpected way.'
    ],words:['hinge','scratch','clutter','texture']},
    consequences: {name:'Callbacks & consequences',weight:2,triggers:['remember','earlier','forgot','again','broken','owed'],cues:[
        'A small previous action has a believable delayed consequence.',
        'An old obligation quietly changes the situation.',
        'Something earlier becomes unexpectedly useful.'
    ],words:['receipt','aftermath','reminder','reversal']},
    humor: {name:'Humor & absurdity',weight:1,triggers:['laugh','funny','joke','ridiculous','embarrass'],cues:[
        'An unremarkable problem is taken much too personally.',
        'An awkward reaction is funnier than a clever punchline.',
        'Someone argues passionately about a trivial detail.'
    ],words:['deadpan','pettiness','audacity','nonsense']},
    physical: {name:'Physical & sensory',weight:1,triggers:['touch','warm','cold','noise','soft','smell'],cues:[
        'A physical detail redirects attention for a moment.',
        'A concrete task briefly becomes the scene’s focus.',
        'An odd sensory discomfort shapes someone’s choices.'
    ],words:['friction','rattle','weight','static']},
    curiosity: {name:'Curiosity & discovery',weight:1,triggers:['notice','strange','missing','wonder','clue'],cues:[
        'Someone notices a small, overlooked discrepancy.',
        'A mundane assumption is quietly questioned.',
        'A passing curiosity leads into an unconventional tangent.'
    ],words:['trace','glimpse','oddity','rumor']},
    pacing: {name:'Pacing & structure',weight:1,triggers:[],cues:[
        'Let one interaction unfold without artificial escalation.',
        'Vary the balance of action, dialogue, and description.',
        'A brief time skip might be more interesting than another reaction.'
    ],words:['pause','drift','cutaway','snapshot']},
    wildcard: {name:'Wildcards & detours',weight:1,triggers:[],cues:[
        'A small distraction deserves attention for its own sake.',
        'Someone has an independent, unrelated errand.',
        'The obvious dramatic reaction is declined.'
    ],words:['swerve','sidequest','coincidence','improvisation']}
};
const SCE_STOP = new Set(('a about after again all already also am an and any are as at back be because ' +
    'been before being between both but by can cannot could did do does doing dont down each either ' +
    'else even every for from get gets getting give go going got had has have having he her here him ' +
    'his how i if im in into is it its just know like make many may me might more most much my no ' +
    'not now of off on one only or other our out over own really said say she should since so some ' +
    'still such than that the their them then there these they this those through to too under up ' +
    'us very was we were what when where which while who why will with would yes you your yourself ' +
    'character char user assistant system model prompt story scenes scene thoughts response message ' +
    'messages words text instruction instructions').split(' '));
const sceRecentCueHistory = new Map();
const sceRecentAnchorHistory = new Map();
const sceWordIndexCache = new Map();
const SCE_ADV_DEFAULTS = {
    intensity:55,maxLayers:3,contextGravity:75,contextScope:'full',
    customKeywords:'',keywordBoost:30,antiRepeat:true
};

function sceBound(value,fallback,lo,hi) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(lo,Math.min(hi,Math.round(number))) : fallback;
}
function sceChance(pct) { return randomInt(10000) < pct * 100; }
function sceWeighted(items) {
    if (!items.length) return null;
    const total = items.reduce((sum,x)=>sum+Math.max(0,x.weight),0);
    if (!total) return pick(items).value;
    let n = randomInt(1000000)/1000000 * total;
    for (const x of items) { n-=Math.max(0,x.weight); if (n<0) return x.value; }
    return items[items.length-1].value;
}
function sceTokenize(text) {
    const tokens = globalThis.Intl?.Segmenter ?
        [...new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)]
            .filter(x=>x.isWordLike).map(x=>x.segment) :
        (text.match(/[\p{L}\p{M}]+/gu)||[]);
    return tokens.map(x=>x.toLocaleLowerCase()).filter(x=>
        x.length >= (/[\u3040-\u30ff\u3400-\u9fff]/u.test(x)?2:3) &&
        x.length<=28 && !SCE_STOP.has(x) && !/^\d+$/u.test(x));
}
function sceWordIndex(context) {
    const chat = Array.isArray(context?.chat)?context.chat:[];
    const opts = sceSettings(context);
    const key = getChatKey();
    const last = chat[chat.length-1]?.mes||'';
    const signature = opts.contextScope+'|'+chat.length+'|'+last.length+'|'+last.slice(-120);
    const cache = sceWordIndexCache.get(key);
    if (cache?.signature===signature) return cache.index;

    const counts = new Map(), nearby = new Map(), recent = new Set();
    let budget = 300000, analyzed = 0;
    for (let i=chat.length-1;i>=0;i--) {
        const age = chat.length-1-i;
        if (opts.contextScope==='recent' && analyzed>=16) break;
        const msg = chat[i];
        if (!msg || msg.is_system || typeof msg.mes!=='string' ||
            msg.extra?.tool_calls || msg.extra?.tool_result) continue;
        const text = msg.mes.slice(0,4000)
            .replace(/<[^>]*>|https?:\/\/\S+|\{\{[^}]+\}\}/g,' ');
        if (text.length>budget) break;
        budget-=text.length;
        analyzed++;
        const words=sceTokenize(text);
        const weight=age<3?4:age<12?2.3:age<28?1.4:0.55;
        for (let j=0;j<words.length;j++) {
            const word=words[j];
            counts.set(word,(counts.get(word)||0)+weight);
            if (age<12) recent.add(word);
            const co=nearby.get(word)||new Map();
            for (let k=Math.max(0,j-2);k<=Math.min(words.length-1,j+2);k++)
                if (j!==k && words[j]!==words[k])
                    co.set(words[k],(co.get(words[k])||0)+weight/(1+Math.abs(k-j)));
            nearby.set(word,co);
        }
    }
    const options=[...counts].map(([value,count])=>
        ({value,weight:Math.min(16,1+Math.log2(1+count)*2)}));
    const index={options,nearby,recent,analyzed};
    sceWordIndexCache.set(key,{signature,index});
    if (sceWordIndexCache.size>8) sceWordIndexCache.delete(sceWordIndexCache.keys().next().value);
    return index;
}
function scePersonalWords(value) {
    return [...new Set(String(value||'').split(/[\n,;]+/g)
        .map(x=>x.replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu,' ')
            .replace(/\s+/g,' ').trim().slice(0,48))
        .filter(x=>x && x.split(' ').length<=4))].slice(0,80);
}
function sceLayeredRoll(context = globalThis.SillyTavern?.getContext?.(),preview=false) {
    const opts=sceSettings(context);
    const base=JSON.parse(generateCreativeRoll(preview));
    const index=sceWordIndex(context);
    const key=getChatKey();
    const old=sceRecentCueHistory.get(key)||[];
    const candidates=Object.entries(SCE_CATEGORIES)
        .filter(([name])=>opts.categoryWeights[name]>0)
        .map(([name,cat])=>({value:name,
            weight:opts.categoryWeights[name] *
                (1+opts.contextGravity/100*0.7*Math.min(4,cat.triggers.filter(x=>index.recent.has(x)).length))
        }));
    const target=1+Array.from({length:opts.maxLayers-1},
        ()=>sceChance(opts.intensity)).filter(Boolean).length;
    const layers=[];
    while(layers.length<target && candidates.length) {
        const id=sceWeighted(candidates), def=SCE_CATEGORIES[id];
        const pool=id==='direction'?[base.creative_mode]:def.cues;
        const fresh=opts.antiRepeat?pool.filter(s=>!old.includes(id+':'+s)):pool;
        const instruction=pick(fresh.length?fresh:pool);
        layers.push({id,title:def.name,instruction});
        if (!preview) {old.unshift(id+':'+instruction);old.length=Math.min(15,old.length);}
        candidates.splice(candidates.findIndex(x=>x.value===id),1);
    }
    if (!preview) sceRecentCueHistory.set(key,old);

    const prev=sceRecentAnchorHistory.get(key)||[];
    const fresh=opts.antiRepeat?index.options.filter(x=>!prev.includes(x.value)):index.options;
    const anchor=index.options.length&&sceChance(opts.contextGravity)?
        sceWeighted(fresh.length?fresh:index.options):null;
    if(anchor&&!preview) sceRecentAnchorHistory.set(key,[anchor,...prev].slice(0,5));
    const custom=scePersonalWords(opts.customKeywords);
    const free=layers.flatMap(x=>SCE_CATEGORIES[x.id].words);
    const sparks=[];
    const sparkCount=opts.intensity<35?1:opts.intensity<85?2:3;
    for (let i=0;i<sparkCount;i++) {
        let word=null;
        if(custom.length&&sceChance(opts.keywordBoost)) word=pick(custom);
        else if(index.options.length&&sceChance(opts.contextGravity)) {
            const nearby=anchor&&index.nearby.get(anchor);
            word=nearby?.size?sceWeighted([...nearby].map(([value,weight])=>({value,weight}))):
                sceWeighted(index.options);
        } else word=pick(free.length?free:SCE_CATEGORIES.direction.words);
        if(word && word!==anchor && !sparks.includes(word)) sparks.push(word);
    }
    return {...base,anchor,word_sparks:sparks,layers,context_messages:index.analyzed};
}



/* Structural Entropy v1.4: independent narrative architecture.
 * The engine rolls abstract phases. Gemini creates the actual story beats.
 * No model call, API request, persistence, or external analysis is used.
 */
const SCE_STRUCTURE_DEFAULTS = {
    structureEnabled: false,
    structureInfluence: 65,
    beatDensity: 55,
    structureGrounding: 75,
    structureAntiRepeat: true,
};
const SCE_STRUCTURE_FAMILIES = {
    sustained: {
        title: 'Sustained moment', weight: 3, min: 1, max: 2,
        affinity: {dialogue:1, action:1, observation:1},
        phases: [['Sustain one ongoing interaction','Explore a practical task in detail','Stay with one character initiative'],
                 ['Let a minor consequence register','Allow a small aside without changing the primary focus']],
        transitions: ['Unbroken continuity','Brief natural aside','Subtle shift of attention'],
    },
    domino: {
        title: 'Domino chain', weight: 2, min: 2, max: 5,
        affinity: {action:2, consequence:2},
        phases: [['Begin with an action already possible','Let a small decision create the first change'],
                 ['Follow a direct consequence','Follow a character response','Let a practical aftereffect develop'],
                 ['Carry the latest consequence forward','Leave circumstances visibly changed']],
        transitions: ['Direct cause and effect','Physical follow-through','Action-to-reaction handoff'],
    },
    parallel: {
        title: 'Parallel threads', weight: 2, min: 2, max: 5,
        affinity: {dialogue:1, action:1, social:2},
        phases: [['Follow an existing activity','Return to the first activity with a changed detail'],
                 ['Attend to a second independent activity','Let someone pursue a separate priority'],
                 ['Let two activities brush against one another, if natural','Keep activities separate without forcing convergence']],
        transitions: ['Alternating perspectives without omniscient leakage','Intercut ongoing activities','Shift between independent concerns'],
    },
    echo: {
        title: 'Delayed echo', weight: 2, min: 3, max: 5,
        affinity: {consequence:2, observation:2},
        phases: [['Notice a small established detail','Let an ordinary choice create an unnoticed implication'],
                 ['Pursue an immediate interaction instead','Allow attention to drift elsewhere'],
                 ['Return to an earlier detail in a changed context','Let an earlier action matter without a grand reveal']],
        transitions: ['Temporary digression and later return','Loose association and callback','Delayed consequence'],
    },
    dialogue: {
        title: 'Conversational drift', weight: 2, min: 2, max: 5,
        affinity: {dialogue:3, social:1},
        phases: [['Begin with a character-specific conversational impulse','Stay with the present exchange'],
                 ['Let a detail suggest a tangential topic','Follow an unexpected association','Make room for an awkward conversational turn'],
                 ['Leave the topic in motion','Return to the original concern only if someone wants to']],
        transitions: ['Topic association','Speaker-led redirection','Natural conversational interruption'],
    },
    pivot: {
        title: 'Directional pivot', weight: 2, min: 2, max: 5,
        affinity: {action:2, observation:1},
        phases: [['Establish one active priority','Develop the ongoing activity'],
                 ['A believable new priority redirects attention','A character chooses a different immediate objective'],
                 ['Follow through on the new activity','Explore consequences of the changed priority']],
        transitions: ['Abrupt but motivated switch','A practical redirection','A character-led change of focus'],
    },
    anticlimax: {
        title: 'Deliberate anti-climax', weight: 2, min: 2, max: 4,
        affinity: {dialogue:1, social:1, observation:1},
        phases: [['Allow an expectation to form naturally','Notice an apparent opportunity for drama'],
                 ['Let the obvious reaction fail to happen','Someone chooses a mundane concern instead'],
                 ['Continue with ordinary life','Give a trivial detail disproportionate attention']],
        transitions: ['Expectation quietly deflated','A casual refusal to escalate','Ordinary action takes over'],
    },
    mosaic: {
        title: 'Mosaic of moments', weight: 1, min: 2, max: 5,
        affinity: {observation:2, social:1},
        phases: [['Notice a distinctive small behavior','Focus on a mundane physical detail'],
                 ['Follow a nearby independent activity','A minor social interaction occupies the foreground'],
                 ['Let a separate observation develop','Return to an earlier detail, optionally']],
        transitions: ['Loose associative cuts','A collection of adjacent moments','Brief focus changes'],
    },
    reverse: {
        title: 'Consequence first', weight: 1, min: 2, max: 4,
        affinity: {consequence:2, observation:1},
        phases: [['Begin with the immediate result of an established or plausible action','Start from a present consequence'],
                 ['Briefly reveal the cause through concrete context','Let preceding actions become clear without a long flashback'],
                 ['Continue from the consequence','Show what the new circumstance makes possible']],
        transitions: ['Short backward glance','A reveal through physical evidence','Present consequence followed by its origin'],
    },
    time: {
        title: 'Elastic time', weight: 1, min: 2, max: 4,
        affinity: {action:1, observation:2},
        phases: [['Begin in one ongoing activity','Stay close to a small present moment'],
                 ['Skip an uneventful stretch of time','Compress repeated ordinary actions'],
                 ['Reveal change through a fresh detail','Return attention to what has shifted']],
        transitions: ['Unannounced short time skip','Compressed routine then close detail','Brief ellipsis'],
    },
};
const SCE_STRUCTURE_ENDINGS = [
    'Finish on a completed small action, not a hook.',
    'Stay with the current activity as it continues.',
    'End with a distinctive behavior or physical detail.',
    'Leave a conversation naturally ongoing without directing a question to the user.',
    'Allow a new ordinary priority to be underway.',
    'Stop after a meaningful change in circumstances; no forced cliffhanger.',
];
const SCE_STRUCTURE_HISTORY = new Map();
const SCE_STRUCTURE_ANCHORS = new Map();

function sceStructureSettings(context = globalThis.SillyTavern?.getContext?.()) {
    return sceSettings(context);
}
function sceStructureSignals(context) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const recent = chat.slice(-12)
        .filter(m => m && !m.is_system && typeof m.mes === 'string' &&
            !m.extra?.tool_calls && !m.extra?.tool_result)
        .map(m => m.mes.slice(0, 2500)).join('\n');
    const count = (re) => Math.min(5, (recent.match(re) || []).length);
    return {
        dialogue: count(/["“”]|(?:\b(?:said|asked|replied|whispered|shouted|spoke|told)\b)/giu),
        action: count(/\b(?:grabbed|lifted|opened|closed|walked|ran|moved|sat|stood|picked|dropped|carried|pushed|pulled|reached|turned|shoved|placed|held|touched|followed)\b/giu),
        consequence: count(/\b(?:again|already|because|afterward|remembered|earlier|forgot|returned|result|therefore|owed)\b/giu),
        social: count(/\b(?:friend|guest|neighbor|partner|family|apology|promise|jealous|trust|argument)\b/giu),
        observation: count(/\b(?:noticed|watched|saw|heard|glanced|looked|observed|realized|stared|wondered)\b/giu),
    };
}
function sceStructureTargetCount(density) {
    const baseline = 1 + Math.round(density * 4 / 100);
    // A little variation at intermediate settings avoids a fixed number per turn.
    const jitter = density > 10 && density < 90 ? randomInt(3) - 1 : 0;
    return Math.min(5, Math.max(1, baseline + jitter));
}
function sceStructureBlueprint(familyId, count) {
    const first = [], middle = [], last = [];
    const families = SCE_STRUCTURE_FAMILIES;
    const f = families[familyId];
    const choose = (set) => pick(set);
    if (familyId === 'sustained') {
        first.push(choose(f.phases[0]));
        if (count > 1) last.push(choose(f.phases[1]));
        return [...first, ...last];
    }
    if (familyId === 'parallel') {
        // Threads are independent; meeting is never mandatory.
        for (let i = 0; i < count; i++) {
            if (i % 2 === 0) middle.push('Thread A: ' + choose(f.phases[0]));
            else middle.push('Thread B: ' + choose(f.phases[1]));
        }
        if (count >= 4 && sceChance(30)) middle[middle.length - 1] = choose(f.phases[2]);
        return middle;
    }
    if (familyId === 'mosaic') {
        for (let i = 0; i < count; i++)
            middle.push(choose(f.phases[i % f.phases.length]));
        return middle;
    }
    if (familyId === 'pivot') {
        const turn = Math.max(1, Math.min(count - 1, 1 + randomInt(Math.max(1, count - 1))));
        for (let i = 0; i < count; i++) {
            middle.push(i < turn ? choose(f.phases[0]) :
                i === turn ? choose(f.phases[1]) : choose(f.phases[2]));
        }
        return middle;
    }
    if (familyId === 'echo') {
        first.push(choose(f.phases[0]));
        for (let i = 0; i < count - 2; i++) middle.push(choose(f.phases[1]));
        last.push(choose(f.phases[2]));
        return [...first, ...middle, ...last];
    }
    if (familyId === 'reverse' || familyId === 'time' || familyId === 'anticlimax' || familyId === 'dialogue') {
        first.push(choose(f.phases[0]));
        for (let i = 0; i < count - 2; i++) middle.push(choose(f.phases[1]));
        last.push(choose(f.phases[2]));
        return count === 2 ? [first[0], choose(f.phases[1])] : [...first, ...middle, ...last];
    }
    // Domino: start with an action, then follow whatever consequences make sense.
    first.push(choose(f.phases[0]));
    for (let i = 0; i < count - 2; i++) middle.push(choose(f.phases[1]));
    last.push(choose(f.phases[2]));
    return count === 2 ? [first[0], last[0]] : [...first, ...middle, ...last];
}
function sceStructureAttention(count, influence) {
    const spread = Math.max(1, Math.ceil(influence / 25));
    const weights = Array.from({length:count}, () => 1 + randomInt(spread + 1));
    if (weights.length > 1 && weights.every(w => w === weights[0])) {
        const at = randomInt(count);
        weights[at] = weights[at] === 1 ? 2 : weights[at] - 1;
    }
    return weights;
}
function sceStructuralRoll(context = globalThis.SillyTavern?.getContext?.(), preview = false) {
    const options = sceStructureSettings(context);
    if (!options.structureEnabled || options.structureInfluence <= 0) return null;
    const key = getChatKey();
    const grounding = options.structureGrounding / 100;
    const influence = options.structureInfluence / 100;
    const signals = sceStructureSignals(context);
    const history = SCE_STRUCTURE_HISTORY.get(key) || [];
    const recentFamilyIds = history.slice(0, 4).map(x => x.family);
    const target = sceStructureTargetCount(options.beatDensity);
    const pool = Object.entries(SCE_STRUCTURE_FAMILIES)
        .filter(([id]) => options.structureWeights[id] > 0)
        .map(([id, family]) => {
            const compatible = Object.entries(family.affinity)
                .reduce((value, [signal, weight]) => value + (signals[signal] || 0) * weight, 0);
            const noveltyBoost = ['mosaic','reverse','pivot','time','anticlimax'].includes(id) ? 1 + influence : 1;
            const distancePenalty = 1 / (1 + Math.max(0, family.min - target));
            return {
                value: id,
                weight: options.structureWeights[id] * noveltyBoost *
                    (1 + grounding * Math.min(8, compatible) * .14) * distancePenalty,
            };
        });
    if (!pool.length) return null;

    // Exclude the last four families when alternatives exist; if every enabled
    // family was just used, fall back gracefully rather than returning nothing.
    const freshFamilies = options.structureAntiRepeat
        ? pool.filter(item => !recentFamilyIds.includes(item.value)) : pool;
    const familyId = sceWeighted(freshFamilies.length ? freshFamilies : pool);
    const family = SCE_STRUCTURE_FAMILIES[familyId];
    const count = Math.max(family.min, Math.min(family.max, target));
    // Re-roll the internal arrangement if it duplicates a recent blueprint.
    // This also helps when a user enables only one structural family.
    let beats, attention, transition, ending, signature;
    for (let attempt = 0; attempt < 6; attempt++) {
        beats = sceStructureBlueprint(familyId, count);
        attention = sceStructureAttention(count, options.structureInfluence);
        transition = pick(family.transitions);
        ending = pick(SCE_STRUCTURE_ENDINGS);
        signature = familyId + ':' + count + ':' + attention.join('-') + ':' +
            transition + ':' + beats.join('|');
        if (!options.structureAntiRepeat || !history.some(item => item.signature === signature)) break;
    }
    const index = sceWordIndex(context);
    const oldAnchors = SCE_STRUCTURE_ANCHORS.get(key) || [];
    const candidates = options.structureAntiRepeat
        ? index.options.filter(x => !oldAnchors.includes(x.value)) : index.options;
    const anchors = [];
    const maxAnchors = options.structureGrounding > 60 ? 2 : 1;
    for (let i = 0; i < maxAnchors && index.options.length; i++) {
        if (!sceChance(options.structureGrounding)) break;
        const remaining = (candidates.length ? candidates : index.options)
            .filter(x => !anchors.includes(x.value));
        if (!remaining.length) break;
        const word = sceWeighted(remaining);
        if (word) anchors.push(word);
    }
    if (!preview && anchors.length) SCE_STRUCTURE_ANCHORS.set(key,
        [...anchors, ...oldAnchors].slice(0, 10));
    if (!preview) SCE_STRUCTURE_HISTORY.set(key,
        [{family:familyId,signature}, ...history].slice(0, 8));
    return {
        family: family.title,
        familyId,
        count,
        beats: beats.map((role,i) => ({role,attention:attention[i]})),
        attention,
        transition, ending, anchors,
        influence: options.structureInfluence,
        grounding: options.structureGrounding,
        kind: options.structureInfluence >= 75 ? 'strong creative preference' :
            options.structureInfluence >= 40 ? 'moderate nudge' : 'light suggestion',
    };
}
function sceFormatStructure(structure) {
    if (!structure) return '';
    const lines = [
        '[STRUCTURAL ENTROPY: OPTIONAL RESPONSE ARCHITECTURE, NOT PREWRITTEN PLOT]',
        'Structural family: ' + structure.family + ' (' + structure.kind + ')',
        'Development density: ' + structure.count + ' area(s) of attention, not paragraph requirements',
        'Relative attention: ' + structure.attention.join(' : '),
        'Connection style: ' + structure.transition,
    ];
    if (structure.anchors.length) {
        lines.push('Existing story words to consider (not mandatory): ' +
            structure.anchors.map(x => '"' + x + '"').join(', '));
    }
    lines.push('Possible abstract phases:');
    for (let i = 0; i < structure.beats.length; i++) {
        lines.push((i+1) + '. ' + structure.beats[i].role);
    }
    lines.push(
        'Suggested closing behavior: ' + structure.ending,
        'Create actual events and character behavior only from the established fiction. No new user-character decisions or dialogue.',
        'Phases indicate distribution of narrative attention, not fixed events, required escalations, or a beat-by-beat outline.',
        'If the current scene naturally supports fewer or different developments, merge or skip phases. Do not force a payoff.',
        'Do not override existing word count, paragraph, narration, dialogue, or continuity requirements.',
        'Do not mention these directions in the fiction.',
        '[/STRUCTURAL ENTROPY]'
    );
    return lines.join('\n');
}
function sceFormatCombined(creativeRoll, structure) {
    const base = sceFormatPrompt(creativeRoll);
    return structure ? base + '\n\n' + sceFormatStructure(structure) : base;
}
function sceStructureUI(panel, config) {
    if (typeof document === 'undefined') return;
    const root = panel.querySelector('details > div');
    if (!root) return;
    const section = document.createElement('section');
    section.className = 'sce_structure_section';
    const weights = Object.entries(SCE_STRUCTURE_FAMILIES).map(([id, family]) =>
        '<label class="sce_cat" for="sce_structure_' + id + '"><span>' + family.title + '</span>' +
        '<select class="text_pole" id="sce_structure_' + id + '">' +
        '<option value="0">Off</option><option value="1">Low</option>' +
        '<option value="2">Normal</option><option value="3">High</option></select></label>'
    ).join('');
    section.innerHTML = [
        '<details class="sce_group sce_structure_group">',
        '<summary>🧬 Structural Entropy <small>independent beat architecture</small></summary>',
        '<label class="sce_line" for="sce_structure_enable"><span>Enable structural rolls</span>',
        '<input type="checkbox" id="sce_structure_enable"></label>',
        '<small>Off by default when updating, so your existing creative results stay unchanged until you opt in.</small>',
        '<div class="sce_line"><label for="sce_structure_influence">Structure influence</label>',
        '<output id="sce_structure_influence_out"></output></div>',
        '<input type="range" id="sce_structure_influence" min="0" max="100">',
        '<div class="sce_line"><label for="sce_structure_density">Beat density</label>',
        '<output id="sce_structure_density_out"></output></div>',
        '<input type="range" id="sce_structure_density" min="0" max="100">',
        '<div class="sce_line"><label for="sce_structure_grounding">Context grounding</label>',
        '<output id="sce_structure_grounding_out"></output></div>',
        '<input type="range" id="sce_structure_grounding" min="0" max="100">',
        '<small>Grounding favors structural families fitting recent dialogue/actions, and attaches existing story words. It is lexical, not semantic analysis.</small>',
        '<label class="sce_line" for="sce_structure_anti_repeat"><span>Avoid repeating recent structures</span>',
        '<input type="checkbox" id="sce_structure_anti_repeat"></label>',
        '<details class="sce_group"><summary>Structure family weights</summary>' + weights + '</details>',
        '<div class="sce_actions"><button class="menu_button" type="button" id="sce_structure_preview">🎲 Preview structure</button></div>',
        '<pre class="sce_preview" id="sce_structure_output" hidden></pre>',
        '<small>Gemini still writes every actual beat. The extension never invents established facts or calls another model.</small>',
        '</details>',
    ].join('');
    root.appendChild(section);
    const el = id => section.querySelector('#sce_' + id);
    const save = (key,value) => {
        const current = sceSettings();
        current[key] = value;
        globalThis.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
    };
    el('structure_enable').checked = config.structureEnabled;
    el('structure_enable').addEventListener('change', e => save('structureEnabled', e.target.checked));
    el('structure_anti_repeat').checked = config.structureAntiRepeat;
    el('structure_anti_repeat').addEventListener('change', e => save('structureAntiRepeat', e.target.checked));
    for (const [id,key] of [
        ['structure_influence','structureInfluence'],
        ['structure_density','beatDensity'],
        ['structure_grounding','structureGrounding'],
    ]) {
        const slider = el(id), output = el(id+'_out');
        slider.value = config[key];
        output.textContent = slider.value + '%';
        slider.addEventListener('input', e => {
            const n = Number(e.target.value);
            output.textContent = n + '%';
            save(key,n);
        });
    }
    for (const [id] of Object.entries(SCE_STRUCTURE_FAMILIES)) {
        const select = el('structure_'+id);
        select.value = config.structureWeights[id];
        select.addEventListener('change', e => {
            sceSettings().structureWeights[id] = Number(e.target.value);
            globalThis.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
        });
    }
    el('structure_preview').addEventListener('click', () => {
        const output = el('structure_output');
        output.textContent = sceFormatStructure(sceStructuralRoll(globalThis.SillyTavern?.getContext?.(),true)) ||
            'Structural Entropy is disabled or has no enabled structure families.';
        output.hidden = false;
    });
}

function sceAdvancedUI(panel, config) {
    const root = panel.querySelector('details > div');
    if (!root) return;
    const block = document.createElement('section');
    block.className = 'sce_advanced';
    block.innerHTML = [
        '<div class="sce_line"><label for="sce_intensity">Creative randomness</label><output id="sce_intensity_out"></output></div>',
        '<input type="range" id="sce_intensity" min="0" max="100" step="1">',
        '<small>0 = one light suggestion; 100 = more independent layers, greater variety.</small>',
        '<div class="sce_line"><label for="sce_layers">Maximum creative layers</label><output id="sce_layers_out"></output></div>',
        '<input type="range" id="sce_layers" min="1" max="5" step="1">',
        '<div class="sce_line"><label for="sce_gravity">Context gravity</label><output id="sce_gravity_out"></output></div>',
        '<input type="range" id="sce_gravity" min="0" max="100" step="1">',
        '<small>High = favor words from the current story and compatible categories. Low = wider, stranger associations.</small>',
        '<label for="sce_scope">Context window</label>',
        '<select id="sce_scope" class="text_pole">',
        '<option value="full">Whole available chat (up to 300,000 characters)</option>',
        '<option value="recent">Recent 16 story messages</option></select>',
        '<details class="sce_group" open><summary>Creative categories & weights</summary>',
        ...Object.entries(SCE_CATEGORIES).map(([id, cat]) =>
            '<label for="sce_cat_' + id + '" class="sce_cat"><span>' + cat.name + '</span>' +
            '<select class="text_pole" id="sce_cat_' + id + '">' +
            '<option value="0">Off</option><option value="1">Low</option>' +
            '<option value="2">Normal</option><option value="3">High</option>' +
            '</select></label>'),
        '</details>',
        '<details class="sce_group"><summary>Custom keywords</summary>',
        '<label for="sce_keywords">Words or short phrases, comma or newline separated</label>',
        '<textarea id="sce_keywords" class="text_pole" rows="3" maxlength="2400" placeholder="coffee, velvet, awkward pause"></textarea>',
        '<div class="sce_line"><label for="sce_keywordboost">Custom keyword preference</label><output id="sce_keywordboost_out"></output></div>',
        '<input type="range" id="sce_keywordboost" min="0" max="100" step="1">',
        '<small>Increase to include your own words more often. The other keywords are extracted locally from the chat.</small>',
        '</details>',
        '<label class="sce_line" for="sce_antirepeat"><span>Avoid recently used cues and anchors</span>',
        '<input type="checkbox" id="sce_antirepeat"></label>',
        '<button type="button" class="menu_button" id="sce_preview">🎲 Preview a roll</button>',
        '<pre class="sce_preview" id="sce_preview_text" hidden></pre>',
        '<small>Preview is local: no API request, no chat history edits, and no consumption of anti-repeat history.</small>'
    ].join('');
    root.appendChild(block);
    const el = id => block.querySelector('#sce_' + id);
    function store(name, value) {
        sceSettings()[name] = value;
        globalThis.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
    }
    const sliders = [
        ['intensity','intensity','%'],
        ['layers','maxLayers',''],
        ['gravity','contextGravity','%'],
        ['keywordboost','keywordBoost','%'],
    ];
    for (const [id, property, suffix] of sliders) {
        const slider = el(id);
        const output = el(id + '_out');
        slider.value = config[property];
        output.textContent = slider.value + suffix;
        slider.addEventListener('input', e => {
            output.textContent = e.target.value + suffix;
            store(property, Number(e.target.value));
        });
    }
    el('scope').value = config.contextScope;
    el('scope').addEventListener('change', e => store('contextScope', e.target.value));
    for (const [id] of Object.entries(SCE_CATEGORIES)) {
        const input = el('cat_' + id);
        input.value = config.categoryWeights[id];
        input.addEventListener('change', e => {
            sceSettings().categoryWeights[id] = Number(e.target.value);
            globalThis.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
        });
    }
    el('keywords').value = config.customKeywords;
    el('keywords').addEventListener('input', e => store('customKeywords', e.target.value.slice(0,2400)));
    el('antirepeat').checked = config.antiRepeat;
    el('antirepeat').addEventListener('change', e => store('antiRepeat', e.target.checked));
    el('preview').addEventListener('click', () => {
        const output = el('preview_text');
        const current = globalThis.SillyTavern?.getContext?.();
        output.textContent = sceFormatCombined(
            sceLayeredRoll(current, true),
            sceSettings(current).structureEnabled ? sceStructuralRoll(current, true) : null
        );
        output.hidden = false;
    });
}

function sceInit() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) return;
    const settings = sceSettings(context);
    sceSyncTool(context);
    const root = typeof document !== 'undefined' && document.getElementById('extensions_settings');
    if (!root || document.getElementById('sce_settings')) return;
    const panel = document.createElement('div');
    panel.id = 'sce_settings';
    panel.innerHTML = [
        '<details style="border:1px solid var(--SmartThemeBorderColor);padding:.7em;margin:.5em 0;border-radius:6px">',
        '<summary style="cursor:pointer;font-weight:bold">🎲 Story Chaos Engine · v1.4.0</summary>',
        '<div style="display:flex;flex-direction:column;gap:.6em;padding-top:.8em">',
        '<label for="sce_mode">Mode</label>',
        '<select id="sce_mode" class="text_pole">',
        '<option value="automatic">Automatic prompt injection (Gemini workaround)</option>',
        '<option value="tool">Legacy function calling</option>',
        '<option value="off">Off</option></select>',
        '<label for="sce_role">Automatic injection role</label>',
        '<select id="sce_role" class="text_pole">',
        '<option value="user">User role (Gemini proxy-friendly)</option>',
        '<option value="system">System role</option></select>',
        '<small>Automatic mode rolls once per normal generation, without a tool call. Remove the old "call story_chaos_roll" instruction from your prompts.</small>',
        '<small id="sce_last_roll">No rolls this session.</small>',
        '</div></details>',
    ].join('');
    root.appendChild(panel);
    const modeSelect = panel.querySelector('#sce_mode');
    const roleSelect = panel.querySelector('#sce_role');
    modeSelect.value = settings.mode;
    roleSelect.value = settings.role;
    modeSelect.addEventListener('change', () => {
        settings.mode = modeSelect.value;
        sceClearPrompt(context);
        sceSyncTool(context);
        context.saveSettingsDebounced?.();
    });
    roleSelect.addEventListener('change', () => {
        settings.role = roleSelect.value;
        context.saveSettingsDebounced?.();
    });
    sceAdvancedUI(panel, settings);
    sceStructureUI(panel, settings);
    console.info('[Story Chaos Engine] v1.4.0 initialized:', settings.mode);
}

// The default mode does NOT register a function tool, even when function
// calling is enabled for other extensions.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sceInit, { once: true });
    } else {
        sceInit();
    }
}

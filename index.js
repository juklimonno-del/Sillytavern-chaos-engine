// Story Chaos Engine v1.7.0: prompt injection by default, legacy function calling optional.
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

const SCE_FALLBACK_CHAT_IDS = new WeakMap();
let sceFallbackChatCounter = 0;
function getChatKey(context = globalThis.SillyTavern?.getContext?.()) {
    const owner = context?.groupId != null ? 'group:' + context.groupId :
        context?.characterId != null ? 'character:' + context.characterId : 'local';
    const chatId = context?.chatId ?? context?.getCurrentChatId?.() ??
        context?.chatMetadata?.chat_id;
    if (chatId != null) return owner + '|' + String(chatId);
    const chat = context?.chat;
    if (chat && typeof chat === 'object') {
        if (!SCE_FALLBACK_CHAT_IDS.has(chat))
            SCE_FALLBACK_CHAT_IDS.set(chat, ++sceFallbackChatCounter);
        return owner + '|temporary:' + SCE_FALLBACK_CHAT_IDS.get(chat);
    }
    return owner + '|unselected';
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
    return true;
}


// --- Gemini-compatible automatic injection ---
// SillyTavern executes this hook before assembling the next generation prompt.
// This avoids the second API request that some OpenAI->Google proxies reject.
const SCE_PROMPT_ID = 'story_chaos_engine_auto';
const SCE_SETTINGS_KEY = 'storyChaosEngine';
const SCE_AUTOPILOT_DEFAULTS = Object.freeze({
    autopilotEnabled:false, notifyAfterReply:true, autopilotPreset:'balanced',
});
let sceToolRegistered = false;

function sceSettings(context = globalThis.SillyTavern?.getContext?.()) {
    if (!context?.extensionSettings) return { mode: 'automatic', role: 'user' };
    let settings = context.extensionSettings[SCE_SETTINGS_KEY] ??= {};
    if (!settings || typeof settings !== 'object' || Array.isArray(settings))
        settings = context.extensionSettings[SCE_SETTINGS_KEY] = {};
    for (const [name,value] of Object.entries(SCE_AUTOPILOT_DEFAULTS)) {
        if (settings[name] === undefined) settings[name] = value;
    }
    if (typeof settings.autopilotEnabled !== 'boolean') settings.autopilotEnabled = false;
    if (typeof settings.notifyAfterReply !== 'boolean') settings.notifyAfterReply = true;
    if (!['subtle','balanced','wild'].includes(settings.autopilotPreset))
        settings.autopilotPreset = 'balanced';
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
    if (!settings.categoryWeights || typeof settings.categoryWeights !== 'object' || Array.isArray(settings.categoryWeights)) settings.categoryWeights = {};
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
    for (const [name, defaultValue] of Object.entries(SCE_FEEDBACK_DEFAULTS)) {
        if (settings[name] === undefined) settings[name] = defaultValue;
    }
    if (typeof settings.feedbackObserverEnabled !== 'boolean') settings.feedbackObserverEnabled = false;
    if (typeof settings.feedbackBalancerEnabled !== 'boolean') settings.feedbackBalancerEnabled = false;
    settings.feedbackStrength = sceBound(settings.feedbackStrength, 65, 0, 100);
    if (![4, 8, 16].includes(Number(settings.feedbackWindow))) settings.feedbackWindow = 8;
    else settings.feedbackWindow = Number(settings.feedbackWindow);
    for (const [name, defaultValue] of Object.entries(SCE_ENDING_WATCH_DEFAULTS)) {
        if (settings[name] === undefined) settings[name] = defaultValue;
    }
    if (typeof settings.endingWatchEnabled !== 'boolean') settings.endingWatchEnabled = false;
    settings.endingWatchStrength = sceBound(settings.endingWatchStrength, 85, 0, 100);
    if (![4, 8, 16].includes(Number(settings.endingWatchWindow))) settings.endingWatchWindow = 8;
    else settings.endingWatchWindow = Number(settings.endingWatchWindow);
    if (![3, 4, 5].includes(Number(settings.endingWatchMinimum))) settings.endingWatchMinimum = 3;
    else settings.endingWatchMinimum = Number(settings.endingWatchMinimum);
    return settings;
}

function sceOn(settings,key) {
    return !!(settings?.autopilotEnabled || settings?.[key]);
}
function sceClearPrompt(context) {
    context?.setExtensionPrompt?.(SCE_PROMPT_ID, '', 1, 0, false, 1);
}

function sceFormatPrompt(roll) {
    const lines = [
        '[STORY CHAOS ENGINE: EXTERNAL CREATIVE CUES, NOT CHARACTER SPEECH]',
        'Roll: ' + roll.roll + '/1000 | Randomness: ' + sceSettings().intensity + '/100',
    ];
    if (roll.focus) lines.push('Optional focus: ' + roll.focus);
    if (roll.rhythm) lines.push('Optional pacing: ' + roll.rhythm);
    if (roll.wildcard) lines.push('Optional wildcard: ' + roll.wildcard);
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

/* Generation receipts: confirmation is based on SillyTavern's rendered assistant
 * message event, not guesses about whether an LLM obeyed its creative cues. */
const SCE_RUN_RECEIPTS = new Map();
let sceListeningSource = null;
function sceRunReceipt(context = globalThis.SillyTavern?.getContext?.()) {
    return SCE_RUN_RECEIPTS.get(getChatKey(context)) || null;
}
function sceSetReceipt(context, receipt) {
    const key = getChatKey(context);
    if (receipt) SCE_RUN_RECEIPTS.set(key,receipt);
    else SCE_RUN_RECEIPTS.delete(key);
    if (SCE_RUN_RECEIPTS.size>12) SCE_RUN_RECEIPTS.delete(SCE_RUN_RECEIPTS.keys().next().value);
    sceRenderReceipt(context);
}
function sceReceiptText(receipt) {
    if (!receipt) return 'No generated reply checked this session.';
    if (receipt.state==='prepared') return 'Preparing reply · guidance installed; awaiting completion.';
    if (receipt.state==='stopped') return 'Generation stopped · no completed reply verified.';
    if (receipt.state==='error') return 'Extension fallback · guidance unavailable for this turn.';
    const details=[receipt.layers+' creative lens(es)'];
    if (receipt.structure) details.push(receipt.structure);
    if (receipt.closingHint) details.push('repetition nudge sent');
    if (receipt.repeatLabel) details.push('recurring ending: '+receipt.repeatLabel);
    return '✓ Reply completed after Chaos guidance was installed · '+details.join(' · ');
}
function sceRenderReceipt(context = globalThis.SillyTavern?.getContext?.()) {
    if (typeof document==='undefined') return;
    const el=document.getElementById?.('sce_run_receipt');
    if (!el) return;
    const receipt=sceRunReceipt(context);
    el.textContent=sceReceiptText(receipt);
    if (el.dataset) el.dataset.state=receipt?.state||'idle';
}
function sceReplyRendered(messageId,type) {
    try { sceHandleReplyRendered(messageId,type); }
    catch(error) { console.warn('[Story Chaos Engine] Receipt update failed.',error); }
}
function sceHandleReplyRendered(messageId,type) {
    const context=globalThis.SillyTavern?.getContext?.();
    if (!context || type==='first_message' || type==='impersonate') return;
    const receipt=sceRunReceipt(context);
    if (!receipt || receipt.state!=='prepared') return;
    const id=Number(messageId);
    const chat=Array.isArray(context.chat)?context.chat:[];
    const message=chat[id];
    if (!Number.isInteger(id) || !sceFeedbackMessageEligible(message)) return;
    if (receipt.type==='normal' && id<receipt.startIndex) return;
    if (receipt.type!=='normal' && id<receipt.startIndex-1) return;
    // SillyTavern may publish a swipe event for a regeneration. Match the
    // pending injection and message position, not provider-specific type names.
    const actual=sceFeedbackCachedFingerprint(message);
    const repeating=sceOn(sceSettings(context),'endingWatchEnabled') ?
        sceEndingWatch(context,'normal') : null;
    const finished={...receipt,state:'completed',messageIndex:id,
        words:actual.wordCount,repeatLabel:repeating?.label||null};
    sceSetReceipt(context,finished);
    const options=sceSettings(context);
    if (options.notifyAfterReply && typeof globalThis.toastr?.info==='function') {
        const summary='🎲 Reply finished after Chaos guidance ('+actual.wordCount+' words)' +
            (repeating?' · recurring ending detected':'');
        globalThis.toastr.info(summary,'Story Chaos Engine',{
            timeOut:2400,extendedTimeOut:1000,preventDuplicates:true,progressBar:false,
        });
    }
}
function sceChatChanged() { sceRenderReceipt(); }
function sceGenerationStopped() {
    const context=globalThis.SillyTavern?.getContext?.();
    const receipt=sceRunReceipt(context);
    if (receipt?.state==='prepared') sceSetReceipt(context,{...receipt,state:'stopped'});
}
function sceSubscribeEvents(context) {
    const source=context?.eventSource, types=context?.eventTypes;
    if (!source?.on || !types || source===sceListeningSource) return;
    if (sceListeningSource?.removeListener && sceSubscribeEvents.types) {
        const old=sceSubscribeEvents.types;
        sceListeningSource.removeListener(old.CHARACTER_MESSAGE_RENDERED,sceReplyRendered);
        sceListeningSource.removeListener(old.GENERATION_STOPPED,sceGenerationStopped);
        sceListeningSource.removeListener(old.CHAT_CHANGED,sceChatChanged);
    }
    if (types.CHARACTER_MESSAGE_RENDERED)
        source.on(types.CHARACTER_MESSAGE_RENDERED,sceReplyRendered);
    if (types.GENERATION_STOPPED)
        source.on(types.GENERATION_STOPPED,sceGenerationStopped);
    if (types.CHAT_CHANGED)
        source.on(types.CHAT_CHANGED,sceChatChanged);
    sceListeningSource=source;
    sceSubscribeEvents.types=types;
}
globalThis.storyChaosEngineInterceptor = async function(_chat,_contextSize,_abort,type) {
    const context=globalThis.SillyTavern?.getContext?.();
    if (!context?.setExtensionPrompt) return;
    const kind=type || 'normal';
    try {
        const options=sceSettings(context);
        if (options.mode!=='automatic' ||
            ![undefined,null,'','normal','regenerate','swipe'].includes(type)) {
            sceClearPrompt(context);
            const prior=sceRunReceipt(context);
            if (prior?.state==='prepared') sceSetReceipt(context,null);
            return;
        }
        const result=sceLayeredRoll(context);
        if (sceOn(options,'structureEnabled') && sceOn(options,'feedbackObserverEnabled'))
            sceFeedbackReconcile(context,kind);
        const structural=sceOn(options,'structureEnabled') ?
            sceStructuralRoll(context,false,kind) : null;
        const endingWatch=sceOn(options,'endingWatchEnabled') ?
            sceEndingWatch(context,kind) : null;
        const role=options.role==='system'?0:1;
        const prompt=sceFormatCombined(result,structural,endingWatch);
        context.setExtensionPrompt(SCE_PROMPT_ID,prompt,1,0,false,role);
        sceSetReceipt(context,{
            state:'prepared',type:kind,startIndex:context.chat?.length??0,
            layers:result.layers.length,structure:structural?.family||null,
            closingHint:!!endingWatch,
        });
        if (sceOn(options,'structureEnabled') && sceOn(options,'feedbackObserverEnabled') && structural)
            sceFeedbackPending(context,structural.familyId,kind);
        const label=typeof document!=='undefined' && document.getElementById('sce_last_roll');
        if (label) label.textContent='Latest roll: '+result.roll+' · '+result.creative_mode;
        console.debug('[Story Chaos Engine] Automatic depth-0 guidance injected.');
    } catch(error) {
        console.error('[Story Chaos Engine] Prompt preparation failed; clearing guidance.',error);
        try { sceClearPrompt(context); } catch(clearError) { console.error(clearError); }
        sceSetReceipt(context,{state:'error',layers:0,structure:null,closingHint:false});
    }
};

function sceSyncTool(context = globalThis.SillyTavern?.getContext?.()) {
    if (!context) return;
    const wanted = sceSettings(context).mode === 'tool';
    if (wanted && !sceToolRegistered) {
        sceToolRegistered = register() === true;
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
// Strip only recognized internal reasoning/tracker blocks, not story prose.
function sceStoryText(value) {
    let text = String(value ?? '');
    text = text.replace(/<!--[\s\S]*?-->/gu,' ');
    text = text.replace(/<(think|thinking|analysis|reasoning|cot|brainstorm|tracker|scene_tracker|state_tracker|hidden|ooc|metadata)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,' ');
    return text.replace(/<[^>]*>/gu,' ').replace(/https?:\/\/\S+/gu,' ')
        .replace(/\{\{[^}]+\}\}/gu,' ');
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
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const opts = sceSettings(context);
    const key = getChatKey(context);
    const records = [];
    let budget = 300000;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (opts.contextScope === 'recent' && records.length >= 16) break;
        const msg = chat[i];
        if (!msg || msg.is_system || typeof msg.mes !== 'string' ||
            msg.extra?.tool_calls || msg.extra?.tool_result) continue;
        const raw = msg.mes.slice(0,4000);
        if (raw.length > budget) break;
        budget -= raw.length;
        records.push({index:i,age:chat.length-1-i,raw,sig:sceFeedbackHash(raw)});
    }
    // Content hashes also detect older edits and same-length swipe replacements.
    const signature = opts.contextScope + '|' + chat.length + '|' +
        records.map(x=>x.index+':'+x.sig).join('|');
    const cached = sceWordIndexCache.get(key);
    if (cached?.signature===signature) return cached.index;
    const counts = new Map(), nearby = new Map(), recent = new Set();
    for (const {age,raw} of records) {
        const words=sceTokenize(sceStoryText(raw));
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
    // Familiar context remains eligible, but repetitive nouns don't monopolize
    // every new random anchor. A small lexical novelty penalty is symmetric.
    const recentAssist=records.filter(x=>chat[x.index]?.is_user===false).slice(0,8);
    const documentFrequency=new Map();
    for(const rec of recentAssist) {
        for(const word of new Set(sceTokenize(sceStoryText(rec.raw))))
            documentFrequency.set(word,(documentFrequency.get(word)||0)+1);
    }
    const options=[...counts].map(([value,count])=>{
        const fraction=(documentFrequency.get(value)||0)/Math.max(1,recentAssist.length);
        const weight=Math.min(16,1+Math.log2(1+count)*2)*(1-0.55*fraction);
        return {value,weight};
    });
    const index={options,nearby,recent,analyzed:records.length};
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
    const key=getChatKey(context);
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
        .map(m => sceStoryText(m.mes).slice(0, 2500)).join('\n');
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
function sceStructuralRoll(context = globalThis.SillyTavern?.getContext?.(), preview = false, type = 'normal') {
    const options = sceStructureSettings(context);
    if (!sceOn(options, 'structureEnabled') || options.structureInfluence <= 0) return null;
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

    // Optional empirical feedback only. No hardcoded preferred style or
    // unearned assumptions about what each structural family will produce.
    if (!preview && sceOn(options, 'feedbackObserverEnabled') && sceOn(options, 'feedbackBalancerEnabled')) {
        const report = sceFeedbackObserve(context, type);
        const observed = sceFeedbackFactors(context, report);
        for (const item of pool) {
            item.weight *= observed.factors.get(item.value)?.factor || 1;
        }
    }

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
    const adherence = structure.influence >= 80
        ? 'Strong execution: let this selected architecture visibly determine the next passage\'s distribution of attention. Use its distinct phases where continuity permits rather than falling back to a familiar reaction-dialogue-closing pattern.'
        : structure.influence >= 50
            ? 'Moderate execution: make the selected architecture recognizable in the next passage when consistent with the scene. Do not merely mention the idea and then follow the usual story rhythm.'
            : 'Gentle execution: allow the selected architecture to influence the next passage without turning it into a rigid outline.';
    lines.push(
        'Structure execution: ' + adherence,
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
function sceFormatCombined(creativeRoll, structure, endingWatch = null) {
    const sections = [sceFormatPrompt(creativeRoll)];
    if (structure) sections.push(sceFormatStructure(structure));
    if (endingWatch) sections.push(sceFormatEndingWatch(endingWatch));
    return sections.join('\n\n');
}

/* Neutral Structural Observer & optional empirical Balancer (v1.5).
 *
 * Observer: surface measurements of previous model replies, never opinions
 * about tone, morality, quality, character decisions or desirable outcomes.
 *
 * Balancer: learns associations between structural families and *measured*
 * reply fingerprints in this browser session. It has no fixed target style.
 * Only repeated observed traits may affect family weights, and only after
 * at least two confirmed matched outcomes for an individual family.
 * The original family-weight selection remains untouched when evidence
 * is insufficient. No extra network requests or model calls.
 */
const SCE_FEEDBACK_DEFAULTS = Object.freeze({
    feedbackObserverEnabled: false,
    feedbackBalancerEnabled: false,
    feedbackStrength: 65,
    feedbackWindow: 8,
});
const SCE_FEEDBACK_STATES = new Map();
const SCE_FEEDBACK_TRAITS = Object.freeze([
    ['quotationBand', 'Quotation coverage band'],
    ['paragraphShape', 'Paragraph-length arrangement'],
    ['endingMark', 'Terminal punctuation'],
]);

function sceFeedbackMessageEligible(m) {
    return !!m && m.is_user === false && !m.is_system &&
        typeof m.mes === 'string' && m.mes.trim().length > 0 &&
        !m.extra?.tool_calls && !m.extra?.tool_result && !m.extra?.type &&
        !m.mes.trimStart().startsWith('[STORY CHAOS ENGINE');
}

function sceFeedbackHash(text) {
    // A lightweight version signature used ONLY to invalidate edited/swiped
    // reply associations. Not a security or identity hash.
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16) + ':' + text.length;
}
function sceFeedbackTextTokens(text) {
    const tokens=String(text).toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)||[];
    if(tokens.length<=2200)return tokens;
    // Keep actual opening and closing tokens even in very long completions.
    return [...tokens.slice(0,1100),'__truncated__',...tokens.slice(-1099)];
}
function sceFeedbackFingerprint(messageOrText) {
    const raw = typeof messageOrText === 'string' ? messageOrText : messageOrText?.mes || '';
    const plain=sceStoryText(raw);
    // Sample both edges, rather than incorrectly treating an early truncation
    // point as the actual reply ending.
    const text=plain.length<=16000 ? plain :
        plain.slice(0,8000)+'\n\n'+plain.slice(-8000);
    const tokens = sceFeedbackTextTokens(text);
    const blocks = text.trim().split(/\n\s*\n+/u).filter(x => x.trim());
    const sizes = blocks.map(x => sceFeedbackTextTokens(x).length);
    const total = sizes.reduce((a,b)=>a+b, 0) || 1;
    const firstShare = sizes.length ? sizes[0] / total : 0;
    const lastShare = sizes.length ? sizes[sizes.length-1] / total : 0;
    const avg = total / Math.max(1,sizes.length);
    const variation = sizes.length <= 1 ? 0 :
        Math.sqrt(sizes.reduce((sum,n)=>sum+Math.pow(n-avg,2),0) / sizes.length) / Math.max(1,avg);
    const paragraphShape = sizes.length <= 1 ? 'single' :
        firstShare >= 0.60 ? 'front-heavy' :
        lastShare >= 0.60 ? 'back-heavy' :
        variation <= 0.3 ? 'even' : 'mixed';
    // Exact quote-delimiter matching. This is not a semantic dialogue detector.
    let quoteChars = 0;
    const quoteExp = /"([^"\n]{1,1500})"|“([^”\n]{1,1500})”/gu;
    for (const match of text.matchAll(quoteExp)) quoteChars += (match[1] || match[2] || '').length;
    const quotationShare = quoteChars / Math.max(1,text.length);
    const quotationBand = quotationShare < .20 ? 'under 20%' :
        quotationShare < .60 ? '20–60%' : 'over 60%';
    // Remove trailing formatting and closing quotes, not substantive marks.
    const terminal = text.trim().replace(/[\s*_\x60"'”’\])}]+$/gu,'').slice(-1);
    const endingMark = terminal === '?' ? 'question mark' :
        terminal === '!' ? 'exclamation mark' :
        terminal === '.' ? 'period' :
        terminal === '…' ? 'ellipsis' : 'other';
    const phrases = new Set();
    for (let i=0; i<tokens.length-3; i++) {
        if (!tokens.slice(i,i+4).includes('__truncated__'))
            phrases.add(tokens.slice(i,i+4).join(' '));
    }
    return {
        signature: sceFeedbackHash(raw),
        wordCount: tokens.length,
        paragraphs: sizes.length,
        quotationShare, quotationBand, paragraphShape, endingMark,
        openingFour: tokens.slice(0,4).join(' '),
        closingFour: tokens.slice(-4).join(' '),
        fourGrams: phrases,
    };
}
const SCE_REPLY_FINGERPRINT_CACHE = new WeakMap();
function sceFeedbackReplyEntries(context, window, type='normal') {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const entries = [];
    for (let i=0;i<chat.length;i++)
        if (sceFeedbackMessageEligible(chat[i])) entries.push({index:i,message:chat[i]});
    // A regenerating/swiping reply is about to be replaced, not evidence.
    if ((type==='swipe'||type==='regenerate') && entries.length) entries.pop();
    return entries.slice(-window);
}
function sceFeedbackCachedFingerprint(message) {
    const signature = sceFeedbackHash(message?.mes || '');
    const cached = SCE_REPLY_FINGERPRINT_CACHE.get(message);
    if (cached?.signature===signature) return cached.fingerprint;
    const fingerprint=sceFeedbackFingerprint(message);
    SCE_REPLY_FINGERPRINT_CACHE.set(message,{signature,fingerprint});
    return fingerprint;
}
function sceFeedbackReplySamples(context, window, type='normal') {
    return sceFeedbackReplyEntries(context,window,type)
        .map(x=>({...x,fingerprint:sceFeedbackCachedFingerprint(x.message)}));
}

function sceFeedbackDominant(samples) {
    if (samples.length < 4) return [];
    const results = [];
    for (const [key, label] of SCE_FEEDBACK_TRAITS) {
        const frequencies = new Map();
        for (const sample of samples) {
            const value = sample.fingerprint[key];
            frequencies.set(value,(frequencies.get(value)||0)+1);
        }
        const [value,count] = [...frequencies].sort((a,b)=>b[1]-a[1])[0];
        if (count >= Math.ceil(samples.length * .67)) {
            results.push({key, label, value, count, total:samples.length});
        }
    }
    return results;
}
function sceFeedbackObserve(context, type='normal') {
    const config = sceSettings(context);
    const window = config.feedbackWindow;
    const samples = sceFeedbackReplySamples(context, window, type);
    const frequencies = key => {
        const result = {};
        for (const sample of samples) {
            const value = sample.fingerprint[key];
            result[value] = (result[value] || 0) + 1;
        }
        return result;
    };
    const median = values => {
        if (!values.length) return 0;
        const a = [...values].sort((x,y)=>x-y);
        return (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)]) / 2;
    };
    const repeated = key => {
        const occur = new Map();
        for (const x of samples) {
            const phrase = x.fingerprint[key];
            if (phrase.length) occur.set(phrase,(occur.get(phrase)||0)+1);
        }
        return [...occur.values()].filter(n=>n>1).reduce((a,b)=>a+b,0);
    };
    const fourgramDocFrequency = new Map();
    for (const x of samples) for (const phrase of x.fingerprint.fourGrams) {
        fourgramDocFrequency.set(phrase,(fourgramDocFrequency.get(phrase)||0)+1);
    }
    const repeats = [...fourgramDocFrequency.values()].filter(v=>v>=2).length;
    return {
        available: samples.length,
        window,
        medianWords: median(samples.map(x=>x.fingerprint.wordCount)),
        medianParagraphs: median(samples.map(x=>x.fingerprint.paragraphs)),
        meanQuotationPercent: samples.length ?
            Math.round(100 * samples.reduce((sum,x)=>sum+x.fingerprint.quotationShare,0)/samples.length) : 0,
        quotationBands: frequencies('quotationBand'),
        paragraphShapes: frequencies('paragraphShape'),
        endings: frequencies('endingMark'),
        repeatedOpeningReplies: repeated('openingFour'),
        repeatedClosingReplies: repeated('closingFour'),
        sharedFourTokenSequences: repeats,
        dominant: sceFeedbackDominant(samples),
        // Only in-memory aggregate/fingerprint information; not raw chat.
        samples,
    };
}
function sceFeedbackState(context) {
    const key = getChatKey();
    if (!SCE_FEEDBACK_STATES.has(key)) {
        SCE_FEEDBACK_STATES.set(key,{pending:null,outcomes:[]});
        if (SCE_FEEDBACK_STATES.size > 12) {
            SCE_FEEDBACK_STATES.delete(SCE_FEEDBACK_STATES.keys().next().value);
        }
    }
    return SCE_FEEDBACK_STATES.get(key);
}
function sceFeedbackReconcile(context, type='normal') {
    const state = sceFeedbackState(context);
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    if (state.pending) {
        const i = chat.findIndex((msg,idx)=>idx>=state.pending.startIndex &&
            sceFeedbackMessageEligible(msg));
        if (i>=0) {
            const fingerprint = sceFeedbackFingerprint(chat[i]);
            state.outcomes = state.outcomes.filter(o=>o.index!==i);
            state.outcomes.push({
                family:state.pending.family, index:i,
                signature:fingerprint.signature,
                fingerprint: {
                    quotationBand:fingerprint.quotationBand,
                    paragraphShape:fingerprint.paragraphShape,
                    endingMark:fingerprint.endingMark,
                },
            });
            state.outcomes=state.outcomes.slice(-96);
        }
        // A missing response was likely aborted; never guess an attribution.
        state.pending=null;
    }
    // A swipe or regenerate replaces the last assistant response. Discard its
    // recorded association, rather than learning from a replaced outcome.
    if (type==='swipe'||type==='regenerate') {
        let lastAssistant=-1;
        for(let i=0;i<chat.length;i++) if(sceFeedbackMessageEligible(chat[i]))lastAssistant=i;
        if(lastAssistant>=0) state.outcomes=state.outcomes.filter(x=>x.index!==lastAssistant);
    }
    state.outcomes=state.outcomes.filter(x=>{
        const m=chat[x.index];
        return sceFeedbackMessageEligible(m) && sceFeedbackHash(m.mes)===x.signature;
    });
    return state;
}
function sceFeedbackPending(context, familyId, type='normal') {
    if(type!=='normal' || !familyId) return;
    const chat=Array.isArray(context?.chat)?context.chat:[];
    const state=sceFeedbackState(context);
    state.pending={family:familyId,startIndex:chat.length};
}
function sceFeedbackFactors(context, report) {
    const settings=sceSettings(context);
    const factors=new Map();
    const diagnostics={ready:false,dominant:[],matched:0,factors};
    if (!sceOn(settings, 'feedbackObserverEnabled') || !sceOn(settings, 'feedbackBalancerEnabled') ||
        settings.feedbackStrength<=0 || !report || report.available<4 ||
        report.dominant.length===0) return diagnostics;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const outcomes = sceFeedbackState(context).outcomes.filter(item => {
        // Live sessions always record an index and content signature.
        // Check them again for read-only reports, without mutating state.
        if (Number.isInteger(item.index) && typeof item.signature === 'string') {
            const message = chat[item.index];
            return sceFeedbackMessageEligible(message) &&
                sceFeedbackHash(message.mes) === item.signature;
        }
        return !Number.isInteger(item.index) && item.signature == null;
    });
    diagnostics.dominant=report.dominant;
    for (const id of Object.keys(SCE_STRUCTURE_FAMILIES)) {
        const matches=outcomes.filter(x=>x.family===id);
        if (matches.length<2) continue;
        let meanAgreement=0;
        for (const dominant of report.dominant) {
            const p=matches.filter(x=>x.fingerprint[dominant.key]===dominant.value).length /
                matches.length;
            meanAgreement+=(1-2*p)/report.dominant.length;
        }
        // Scale symmetrically around 1.0. 1 = no change.
        // Two observations imply only a small confidence adjustment.
        const confidence=Math.min(1,(matches.length-1)/4);
        const factor=Math.max(.6,Math.min(1.4,
            1+(settings.feedbackStrength/100)*.4*meanAgreement*confidence));
        factors.set(id,{factor,samples:matches.length});
        diagnostics.matched+=matches.length;
    }
    diagnostics.ready=factors.size>0;
    return diagnostics;
}
function sceFeedbackReportText(context, type='normal') {
    const report=sceFeedbackObserve(context,type);
    const factors=sceFeedbackFactors(context,report);
    const values=obj=>Object.entries(obj).sort((a,b)=>b[1]-a[1])
        .map(([key,n])=>key+': '+n).join(' · ') || 'None';
    const lines=[
        'STRUCTURAL OBSERVER | measurable text patterns only',
        'Model replies analyzed: '+report.available+' / '+report.window,
        'Median words: '+report.medianWords,
        'Median paragraphs: '+report.medianParagraphs,
        'Mean matched quotation coverage: '+report.meanQuotationPercent+'%',
        'Quotation coverage bands: '+values(report.quotationBands),
        'Paragraph-length arrangements: '+values(report.paragraphShapes),
        'Terminal punctuation: '+values(report.endings),
        'Replies sharing an exact 4-token opening: '+report.repeatedOpeningReplies,
        'Replies sharing an exact 4-token closing: '+report.repeatedClosingReplies,
        'Distinct 4-token sequences present in at least 2 replies: '+report.sharedFourTokenSequences,
        'Repeated measured traits (>=67% of observed replies): '+
            (report.dominant.length ? report.dominant.map(x=>
                x.label+' = '+x.value+' ('+x.count+'/'+x.total+')').join(' · ') : 'None / insufficient evidence'),
        '',
        'BALANCER (independent from measurements)',
        'Observer enabled: '+(sceOn(sceSettings(context), 'feedbackObserverEnabled')?'yes':'no'),
        'Balancer enabled: '+(sceOn(sceSettings(context), 'feedbackBalancerEnabled')?'yes':'no'),
        'Evidence-based family adjustments: '+(factors.ready?'available':'not enough matched evidence'),
    ];
    const endingConfig = sceSettings(context);
    const endingWatch = sceOn(endingConfig, 'endingWatchEnabled') ? sceEndingWatch(context, type) : null;
    lines.push('', 'CLOSING-BEAT WATCH (lexical action and phrase recurrence)',
        'Enabled: ' + (sceOn(endingConfig, 'endingWatchEnabled') ? 'yes' : 'no'),
        'Recent repeated ending: ' + (endingWatch ?
            endingWatch.label+' ('+endingWatch.count+'/'+endingWatch.total+')' :
            'none over threshold / feature disabled'));

    if (factors.ready) for (const [id,x] of factors.factors) {
        lines.push('  '+SCE_STRUCTURE_FAMILIES[id].title+': x'+x.factor.toFixed(3)+
            ' ('+x.samples+' matched output(s))');
    }
    lines.push('The Observer does not measure quality, appropriateness, character intent, or plot semantics.',
        'Quotation spans are not a reliable semantic measure of dialogue.',
        'A family/outcome association is observational, not evidence of causation.',
        'No ideal dialogue ratio, ending type, paragraph shape or moral tone is assumed.');
    return lines.join('\n');
}


/* Repeated closing-beat watch.
 * Objective scope: recognizable activity terms or repeated closing
 * word sequences, in completed assistant replies. Every activity family
 * is measured with the SAME rule. This is NOT semantic plot analysis.
 */
const SCE_ENDING_WATCH_DEFAULTS = Object.freeze({
    endingWatchEnabled: false,
    endingWatchStrength: 85,
    endingWatchWindow: 8,
    endingWatchMinimum: 3,
});
const SCE_ENDING_NAMES_IGNORE = new Set(('The A An And But Then She He Her His They Them Their I We ' +
    'You It This That Those These Here There What Who When Why How Where After Before At In On ' +
    'As From To With By For While Meanwhile Suddenly Later Finally Eventually').toLocaleLowerCase().split(' '));
const SCE_ENDING_STOP = new Set(('a an the another and or but so then after before to of in on at for with ' +
    'from by into out up down over under as is are was were be been being its it her his their ' +
    'she he they them we i me my you your us our this that these those one someone something ' +
    'again very just still finally eventually later already while meanwhile suddenly').split(' '));
const SCE_ENDING_ACTIONS = [
    {id:'messaging',label:'text or message activity',
        patterns:[
            /\b(?:texted|texting|texts|messaged|messaging|dmed|dming)\b/giu,
            /\b(?:send|sends|sent|sending|wrote|write|writes|writing|type|types|typed|typing|draft|drafted|forwarded)\b.{0,85}\b(?:text|message|dm|sms)\b/giu
        ]},
    {id:'calling',label:'calls or dialing',
        patterns:[/\b(?:call(?:s|ed|ing)?|dial(?:s|ed|ing)?|voicemail)\b/giu]},
    {id:'embracing',label:'hugging or embracing',
        patterns:[/\b(?:hug(?:s|ged|ging)?|embrac(?:e|es|ed|ing)|cuddl(?:e|es|ed|ing))\b/giu]},
    {id:'kissing',label:'kissing',patterns:[/\b(?:kiss(?:es|ed|ing)?|smooch(?:es|ed|ing)?)\b/giu]},
    {id:'laughing',label:'laughing',patterns:[/\b(?:laugh(?:s|ed|ing)?|giggl(?:e|es|ed|ing)|chuckl(?:e|es|ed|ing))\b/giu]},
    {id:'sighing',label:'sighing',patterns:[/\b(?:sigh(?:s|ed|ing)?|exhal(?:e|es|ed|ing))\b/giu]},
    {id:'walking',label:'walking or leaving',patterns:[/\b(?:walk(?:s|ed|ing)?|leav(?:e|es|ing)|left|depart(?:s|ed|ing)?|exit(?:s|ed|ing)?)\b/giu]},
    {id:'looking',label:'looking or glancing',patterns:[/\b(?:look(?:s|ed|ing)?|glanc(?:e|es|ed|ing)|star(?:e|es|ed|ing))\b/giu]},
    {id:'asking',label:'asking questions',patterns:[/\b(?:ask(?:s|ed|ing)?|question(?:s|ed|ing)?|inquir(?:e|es|ed|ing))\b/giu]},
    {id:'crying',label:'crying',patterns:[/\b(?:cry|cries|cried|crying|sob(?:s|bed|bing)?|weep(?:s|ing)?)\b/giu]},
    {id:'drinking',label:'drinking',patterns:[/\b(?:drink(?:s|ing)?|drank|drunk|sip(?:s|ped|ping)?)\b/giu]},
    {id:'eating',label:'eating',patterns:[/\b(?:eat(?:s|ing)?|ate|chew(?:s|ed|ing)?|munch(?:es|ed|ing)?)\b/giu]},
    {id:'touching',label:'touching or grasping',patterns:[/\b(?:touch(?:es|ed|ing)?|grab(?:s|bed|bing)?|grasp(?:s|ed|ing)?)\b/giu]},
    {id:'sleeping',label:'sleeping',patterns:[/\b(?:sleep(?:s|ing)?|slept|doz(?:e|es|ed|ing))\b/giu]},
    {id:'smiling',label:'smiling or grinning',patterns:[/\b(?:smil(?:e|es|ed|ing)|grin(?:s|ned|ning)?)\b/giu]},
    {id:'writing',label:'writing',patterns:[/\b(?:writ(?:e|es|ing)|wrote|scribbl(?:e|es|ed|ing)|jott?(?:ed|ing))\b/giu]},
    {id:'waiting',label:'waiting',patterns:[/\b(?:wait(?:s|ed|ing)?|linger(?:s|ed|ing)?)\b/giu]},
];
function sceEndingTail(text) {
    const plain=sceStoryText(text).trim();
    const paragraphs=plain.split(/\n\s*\n+/u).filter(Boolean);
    return paragraphs.slice(-2).join(' ').slice(-720);
}
function sceEndingNamedActor(tail,at) {
    const preceding=tail.slice(Math.max(0,at-160),at);
    const clause=preceding.split(/[.!?;\n]/u).pop() || '';
    const names=part=>[...part.matchAll(/(?:^|[^\p{L}])(\p{Lu}\p{L}{1,}(?:['’-]\p{L}+)?)/gu)]
        .map(match=>match[1].replace(/['’]s$/u,''))
        .filter(name=>!SCE_ENDING_NAMES_IGNORE.has(name.toLocaleLowerCase()));
    let candidates=names(clause);
    // Resolve simple pronouns only when one uniquely named actor is nearby.
    if(!candidates.length && /\b(?:she|he|they)\b/iu.test(clause))
        candidates=names(preceding);
    const unique=[...new Set(candidates.map(x=>x.toLocaleLowerCase()))];
    return unique.length===1 ? candidates.find(x=>x.toLocaleLowerCase()===unique[0]) : null;
}

function sceEndingNormalizedToken(token) {
    const t=String(token).toLocaleLowerCase();
    if (/^(?:texts?|texted|texting|messages?|messaged|messaging|dms?|dming|dmed)$/u.test(t)) return 'message';
    if (/^(?:sends?|sent|sending)$/u.test(t)) return 'send';
    if (/^(?:writes?|wrote|writing|written)$/u.test(t)) return 'write';
    if (/^(?:types?|typed|typing)$/u.test(t)) return 'type';
    if (/^(?:looks?|looked|looking)$/u.test(t)) return 'look';
    if (/^(?:laughs?|laughed|laughing)$/u.test(t)) return 'laugh';
    if (/^(?:walks?|walked|walking)$/u.test(t)) return 'walk';
    if (SCE_ENDING_STOP.has(t)) return t;
    return t.replace(/(?:ing|ed|s)$/u, '') || t;
}
function sceEndingMotifs(text) {
    const tail=sceEndingTail(text);
    if(!tail) return [];
    const motifs = new Map();
    for(const action of SCE_ENDING_ACTIONS) {
        let latest = null;
        for(const re of action.patterns) {
            for(const match of tail.matchAll(re)) {
                if (latest == null || match.index > latest.index) latest = match;
            }
        }
        if (!latest || latest.index < tail.length - 350) continue;
        // Independently count activity recurrence with and without a named actor.
        motifs.set('act:'+action.id,{key:'act:'+action.id,
            label:action.label, specific:false, kind:'activity', group:action.id});
        const actor=sceEndingNamedActor(tail,latest.index);
        if(actor) {
            const key='actor:'+actor.toLocaleLowerCase()+':'+action.id;
            motifs.set(key,{key,label:actor+' + '+action.label,
                specific:true,kind:'activity',group:action.id});
        }
    }
    // Generic fallback: repeated exact 3-word sequences after simple, symmetric
    // normalization. It can match actions outside our finite activity lexicon.
    const normalized=sceFeedbackTextTokens(tail)
        .filter(t=>!SCE_ENDING_STOP.has(t))
        .map(sceEndingNormalizedToken).filter(t=>t.length>2 && !SCE_ENDING_STOP.has(t));
    const ending=normalized.slice(-30);
    for(let i=0;i+2<ending.length;i++) {
        const phrase=ending.slice(i,i+3).join(' ');
        const key='phrase:'+phrase;
        motifs.set(key,{key,label:'repeated closing phrase ('+phrase+')',
            specific:false,kind:'phrase',group:null});
    }
    return [...motifs.values()];
}
function sceEndingWatch(context,type='normal') {
    const options=sceSettings(context);
    if (!sceOn(options, 'endingWatchEnabled') || options.endingWatchStrength<=0) return null;
    const samples=sceFeedbackReplyEntries(context,options.endingWatchWindow,type);
    if(samples.length<4) return null;
    const detected=new Map();
    const recent = samples.slice(-3);
    for(const sample of samples) {
        const motifs=sceEndingMotifs(sample.message.mes);
        const unique=new Set();
        for(const motif of motifs) {
            if(unique.has(motif.key))continue;
            unique.add(motif.key);
            const item=detected.get(motif.key)||{...motif,count:0,recent:0};
            item.count++;
            if(recent.some(x=>x.index===sample.index))item.recent++;
            detected.set(motif.key,item);
        }
    }
    // Identical threshold for every actor, activity and generic phrase.
    const eligible=[...detected.values()].filter(x=>
        x.count>=options.endingWatchMinimum && x.recent>=2);
    if(!eligible.length)return null;
    // Avoid suppressing the immediate activity explicitly requested by the
    // most recent user turn; user authorship outweighs the repetition nudge.
    const chat=Array.isArray(context?.chat)?context.chat:[];
    const lastUser=[...chat].reverse().find(x=>x?.is_user===true && typeof x.mes==='string');
    // Negated instructions such as "don't text" must not cancel the nudge.
    const userText=sceStoryText(lastUser?.mes ?? '');
    const negated=/\b(?:don't|do not|never|stop|avoid|not to)\b.{0,80}\b(?:text|message|call|hug|kiss|leave|laugh)\b/iu.test(userText);
    const requested=lastUser&&!negated ?
        new Set(sceEndingMotifs(lastUser.mes).map(x=>x.key)) : new Set();
    const available=eligible.filter(x=>!requested.has(x.key) &&
        !(x.kind==='activity' && requested.has('act:'+x.group)));
    if(!available.length)return null;
    // More frequent, more recent, actor-specific evidence outranks incidental
    // common-token overlaps; no action family has an intrinsic preference.
    available.sort((a,b)=>(b.count-a.count)||(b.recent-a.recent)||
        (Number(b.specific)-Number(a.specific))||
        ((a.kind==='phrase'?1:0)-(b.kind==='phrase'?1:0)));
    const result=available[0];
    return {...result,total:samples.length,strength:options.endingWatchStrength};
}
function sceFormatEndingWatch(watch) {
    if(!watch)return '';
    const strength=watch.strength>=75?'clear':'gentle';
    return [
        '[ENDING-PATTERN WATCH: MEASURED REPETITION, NOT A STORY DIRECTIVE]',
        'Observed pattern in recent closing passages: '+watch.label+
            ' ('+watch.count+' of '+watch.total+' completed assistant replies).',
        strength==='clear'
            ? 'For the next response, do not default to this same closing behavior. Let existing motives and circumstances decide what actually happens and how it ends.'
            : 'For the next response, consider an ending that does not repeat this activity by habit, if the established scene allows it.',
        'Do not merely relocate the same repeated action to a different character or an earlier paragraph, and do not force a dramatic opposite.',
        'If a separate structural ending suggestion conflicts with this measured repetition, prioritize avoiding the habitual repeat unless the story requires it.',
        'If the user explicitly requests or established continuity requires it, let the action occur normally.',
        'This is a lexical recurrence estimate, not a judgment of meaning, quality, morality, or character behavior.',
        'Do not mention the analysis in the fiction.',
        '[/ENDING-PATTERN WATCH]',
    ].join('\n');
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


function sceFeedbackUI(panel, config) {
    if (typeof document === 'undefined') return;
    const root = panel.querySelector('details > div');
    if (!root) return;
    const section = document.createElement('section');
    section.className = 'sce_feedback_section';
    section.innerHTML = [
        '<details class="sce_group sce_feedback_group">',
        '<summary>📊 Structural Feedback <small>neutral observer + optional balancer</small></summary>',
        '<label class="sce_line" for="sce_feedback_observer"><span>Enable the Observer</span>',
        '<input type="checkbox" id="sce_feedback_observer"></label>',
        '<small>Read previous model responses and measure mechanical patterns only. No quality scores, moral classifications, or inferred plot semantics.</small>',
        '<label class="sce_line" for="sce_feedback_balancer"><span>Enable adaptive Balancer</span>',
        '<input type="checkbox" id="sce_feedback_balancer"></label>',
        '<small>The Balancer needs Observer enabled, Structural Entropy enabled, at least 4 earlier responses, and enough matched structure/outcome evidence. Otherwise probabilities are unchanged.</small>',
        '<div class="sce_line"><label for="sce_feedback_strength">Balancing strength</label>',
        '<output id="sce_feedback_strength_out"></output></div>',
        '<input type="range" id="sce_feedback_strength" min="0" max="100" step="1">',
        '<label for="sce_feedback_window">Previous assistant replies to measure</label>',
        '<select class="text_pole" id="sce_feedback_window">',
        '<option value="4">Last 4 responses</option>',
        '<option value="8">Last 8 responses</option>',
        '<option value="16">Last 16 responses</option>',
        '</select>',
        '<details class="sce_group sce_ending_group">',
        '<summary>🔁 Closing-Beat Watch <small>repeated actions and phrases</small></summary>',
        '<label class="sce_line" for="sce_ending_enable"><span>Watch recurring closing actions</span>',
        '<input type="checkbox" id="sce_ending_enable"></label>',
        '<small>When repeated closing behavior is measured, add a short, action-neutral avoidance hint to the next normal prompt. No additional model calls.</small>',
        '<div class="sce_line"><label for="sce_ending_strength">Ending-repeat avoidance strength</label>',
        '<output id="sce_ending_strength_out"></output></div>',
        '<input type="range" min="0" max="100" step="1" id="sce_ending_strength">',
        '<label for="sce_ending_window">Previous assistant replies to check</label>',
        '<select class="text_pole" id="sce_ending_window">',
        '<option value="4">Last 4 responses</option>',
        '<option value="8">Last 8 responses</option>',
        '<option value="16">Last 16 responses</option>',
        '</select>',
        '<label for="sce_ending_minimum">Minimum repeated endings</label>',
        '<select class="text_pole" id="sce_ending_minimum">',
        '<option value="3">3 matching replies</option>',
        '<option value="4">4 matching replies</option>',
        '<option value="5">5 matching replies</option>',
        '</select>',
        '<small>Requires two matches among the most recent three replies. Recognizes only known action terms and literal recurring phrases. It cannot reliably understand equivalent plot beats.</small>',
        '</details>',
        '<div class="sce_actions">',
        '<button class="menu_button" type="button" id="sce_feedback_analyze">📊 Analyze current replies</button>',
        '<button class="menu_button" type="button" id="sce_feedback_reset">Reset learned associations</button>',
        '</div>',
        '<pre class="sce_preview" id="sce_feedback_report" hidden></pre>',
        '<small>All measurements run locally. Analysis never calls an LLM or edits the chat. A reset clears only session-local family/outcome associations, not the chat history.</small>',
        '</details>',
    ].join('');
    root.appendChild(section);
    const el = id => section.querySelector('#sce_' + id);
    const save = (key,value) => {
        sceSettings()[key] = value;
        globalThis.SillyTavern?.getContext?.()?.saveSettingsDebounced?.();
    };
    el('feedback_observer').checked = !!config.feedbackObserverEnabled;
    el('feedback_observer').addEventListener('change', e =>
        save('feedbackObserverEnabled', e.target.checked));
    el('feedback_balancer').checked = !!config.feedbackBalancerEnabled;
    el('feedback_balancer').addEventListener('change', e =>
        save('feedbackBalancerEnabled', e.target.checked));
    const strength = el('feedback_strength'), strengthOut = el('feedback_strength_out');
    strength.value = config.feedbackStrength;
    strengthOut.textContent = strength.value + '%';
    strength.addEventListener('input', e => {
        strengthOut.textContent = e.target.value + '%';
        save('feedbackStrength', Number(e.target.value));
    });
    el('feedback_window').value = String(config.feedbackWindow);
    el('feedback_window').addEventListener('change', e =>
        save('feedbackWindow', Number(e.target.value)));
    el('ending_enable').checked = !!config.endingWatchEnabled;
    el('ending_enable').addEventListener('change', e =>
        save('endingWatchEnabled', e.target.checked));
    const endStrength = el('ending_strength'), endStrengthOut = el('ending_strength_out');
    endStrength.value = config.endingWatchStrength;
    endStrengthOut.textContent = endStrength.value + '%';
    endStrength.addEventListener('input', e => {
        endStrengthOut.textContent = e.target.value + '%';
        save('endingWatchStrength', Number(e.target.value));
    });
    el('ending_window').value = String(config.endingWatchWindow);
    el('ending_window').addEventListener('change', e =>
        save('endingWatchWindow', Number(e.target.value)));
    el('ending_minimum').value = String(config.endingWatchMinimum);
    el('ending_minimum').addEventListener('change', e =>
        save('endingWatchMinimum', Number(e.target.value)));
    el('feedback_analyze').addEventListener('click', () => {
        const report = el('feedback_report');
        report.textContent = sceFeedbackReportText(globalThis.SillyTavern?.getContext?.());
        report.hidden = false;
    });
    el('feedback_reset').addEventListener('click', () => {
        const context = globalThis.SillyTavern?.getContext?.();
        if (context) SCE_FEEDBACK_STATES.delete(getChatKey());
        const report = el('feedback_report');
        report.textContent = 'Session-local structural family/outcome associations were reset.\n' +
            'Saved chat messages and measurement history were not changed.';
        report.hidden = false;
    });
}

function sceAdvancedUI(panel, config) {
    const root = panel.querySelector('details > div');
    if (!root) return;
    const block = document.createElement('details');
    block.className = 'sce_advanced sce_advanced_group';
    block.innerHTML = [
        '<summary>⚙️ Advanced controls <small>optional fine tuning</small></summary>',
        '<label for="sce_mode">Operating mode</label>',
        '<select id="sce_mode" class="text_pole">',
        '<option value="automatic">Automatic prompt injection</option>',
        '<option value="tool">Legacy function calling</option>',
        '<option value="off">Off</option></select>',
        '<label for="sce_role">Injection role</label>',
        '<select id="sce_role" class="text_pole">',
        '<option value="user">User (Gemini proxy friendly)</option>',
        '<option value="system">System</option></select>',
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
    el('antirepeat').checked = config.antiRepeat;
    el('antirepeat').addEventListener('change', e => store('antiRepeat', e.target.checked));
    el('preview').addEventListener('click', () => {
        const output = el('preview_text');
        const current = globalThis.SillyTavern?.getContext?.();
        output.textContent = sceFormatCombined(
            sceLayeredRoll(current, true),
            sceOn(sceSettings(current),'structureEnabled') ? sceStructuralRoll(current, true) : null
        );
        output.hidden = false;
    });
}

let sceUiInitObserver = null;
function sceWaitForSettingsPanel() {
    if (sceUiInitObserver || typeof globalThis.MutationObserver !== 'function' ||
        typeof document==='undefined' || !document.body) return;
    sceUiInitObserver=new globalThis.MutationObserver(()=>{
        if (!document.getElementById('extensions_settings')) return;
        const observer=sceUiInitObserver;
        sceUiInitObserver=null;
        observer?.disconnect();
        sceInit();
    });
    sceUiInitObserver.observe(document.body,{childList:true,subtree:true});
}
function sceInit() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) return;
    sceSubscribeEvents(context);
    const settings = sceSettings(context);
    sceSyncTool(context);
    const root = typeof document !== 'undefined' && document.getElementById('extensions_settings');
    if (!root) { sceWaitForSettingsPanel(); return; }
    if (document.getElementById('sce_settings')) return;
    const panel = document.createElement('div');
    panel.id = 'sce_settings';
    panel.innerHTML = [
        '<details class="sce_main_group" open>',
        '<summary>🎲 Story Chaos Engine · v1.7.0</summary>',
        '<div class="sce_main_body">',
        '<label class="sce_line" for="sce_autopilot"><span><strong>Autopilot</strong> · automatic variation and repetition correction</span>',
        '<input type="checkbox" id="sce_autopilot"></label>',
        '<small>Enable once, then keep writing. Your existing custom weights are preserved.</small>',
        '<label for="sce_preset">Creative behavior</label>',
        '<select id="sce_preset" class="text_pole">',
        '<option value="subtle">Subtle</option>',
        '<option value="balanced">Balanced</option>',
        '<option value="wild">Wild</option></select>',
        '<label for="sce_keywords">Your optional keywords</label>',
        '<textarea id="sce_keywords" class="text_pole" rows="3" maxlength="2400" placeholder="coffee, velvet, awkward pause"></textarea>',
        '<div class="sce_line"><label for="sce_keywordboost">Keyword influence</label>',
        '<output id="sce_keywordboost_out"></output></div>',
        '<input type="range" id="sce_keywordboost" min="0" max="100" step="1">',
        '<label class="sce_line" for="sce_notify"><span>Brief completion notifications</span>',
        '<input type="checkbox" id="sce_notify"></label>',
        '<small>After a reply finishes, confirm the guidance was delivered. This does not claim the model obeyed it.</small>',
        '<div class="sce_run_receipt" id="sce_run_receipt" role="status" aria-live="polite">No generated reply checked this session.</div>',
        '<small id="sce_last_roll">No rolls this session.</small>',
        '</div></details>',
    ].join('');
    root.appendChild(panel);
    // Advanced controls must exist before querying the mode and role fields.
    sceAdvancedUI(panel, settings);
    const modeSelect = panel.querySelector('#sce_mode');
    const roleSelect = panel.querySelector('#sce_role');
    modeSelect.value = settings.mode;
    roleSelect.value = settings.role;
    const autopilot=panel.querySelector('#sce_autopilot');
    const preset=panel.querySelector('#sce_preset');
    const keywords=panel.querySelector('#sce_keywords');
    const keywordBoost=panel.querySelector('#sce_keywordboost');
    const keywordOut=panel.querySelector('#sce_keywordboost_out');
    const notify=panel.querySelector('#sce_notify');
    autopilot.checked=settings.autopilotEnabled;
    autopilot.addEventListener('change',e=>{
        settings.autopilotEnabled=e.target.checked;
        if (e.target.checked && settings.mode!=='automatic') {
            settings.mode='automatic';
            modeSelect.value=settings.mode;
            sceSyncTool(context);
            sceClearPrompt(context);
        }
        context.saveSettingsDebounced?.();
    });
    preset.value=settings.autopilotPreset;
    preset.addEventListener('change',e=>{
        settings.autopilotPreset=e.target.value;
        const values={
            subtle:{intensity:35,maxLayers:2,structureInfluence:55,beatDensity:40,contextGravity:80},
            balanced:{intensity:65,maxLayers:3,structureInfluence:82,beatDensity:60,contextGravity:75},
            wild:{intensity:90,maxLayers:4,structureInfluence:95,beatDensity:80,contextGravity:50},
        }[e.target.value];
        if (!values) return;
        Object.assign(settings,values);
        for(const [id,key] of [
            ['intensity','intensity'],['layers','maxLayers'],['gravity','contextGravity'],
            ['structure_influence','structureInfluence'],['structure_density','beatDensity'],
        ]) {
            const el=panel.querySelector('#sce_'+id);
            if(el) el.value=String(settings[key]);
            const out=panel.querySelector('#sce_'+id+'_out');
            if(out) out.textContent=String(settings[key])+(id==='layers'?'':'%');
        }
        context.saveSettingsDebounced?.();
    });
    keywords.value=settings.customKeywords;
    keywords.addEventListener('input',e=>{
        settings.customKeywords=e.target.value.slice(0,2400);
        context.saveSettingsDebounced?.();
    });
    keywordBoost.value=settings.keywordBoost;
    keywordOut.textContent=settings.keywordBoost+'%';
    keywordBoost.addEventListener('input',e=>{
        settings.keywordBoost=Number(e.target.value);
        keywordOut.textContent=e.target.value+'%';
        context.saveSettingsDebounced?.();
    });
    notify.checked=settings.notifyAfterReply;
    notify.addEventListener('change',e=>{
        settings.notifyAfterReply=e.target.checked;
        context.saveSettingsDebounced?.();
    });
    modeSelect.addEventListener('change', () => {
        settings.mode = modeSelect.value;
        if (settings.mode!=='automatic') {
            settings.autopilotEnabled=false;
            autopilot.checked=false;
        }
        sceClearPrompt(context);
        sceSyncTool(context);
        context.saveSettingsDebounced?.();
    });
    roleSelect.addEventListener('change', () => {
        settings.role = roleSelect.value;
        context.saveSettingsDebounced?.();
    });
    sceStructureUI(panel, settings);
    sceFeedbackUI(panel, settings);
    sceRenderReceipt(context);
    console.info('[Story Chaos Engine] v1.7.0 initialized:', settings.mode);
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

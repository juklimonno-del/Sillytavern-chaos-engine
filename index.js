// Story Chaos Engine v1.3.0: prompt injection by default, legacy function calling optional.
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
        action: async () => JSON.stringify(sceLayeredRoll(context)),
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
    // Depth 0 in a USER role keeps Gemini proxies from ending the prompt on
    // a model turn. Users can switch to a system-role injection if preferred.
    const role = options.role === 'system' ? 0 : 1;
    context.setExtensionPrompt(SCE_PROMPT_ID, sceFormatPrompt(result), 1, 0, false, role);
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
        output.textContent = sceFormatPrompt(sceLayeredRoll(globalThis.SillyTavern?.getContext?.(), true));
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
        '<summary style="cursor:pointer;font-weight:bold">🎲 Story Chaos Engine · v1.3.0</summary>',
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
    console.info('[Story Chaos Engine] v1.3.0 initialized:', settings.mode);
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

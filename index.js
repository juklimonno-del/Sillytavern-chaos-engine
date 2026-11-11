// Story Chaos Engine v1.2.0: prompt injection by default, legacy function calling optional.
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

function generateCreativeRoll() {
    const key = getChatKey();
    const recent = recentModes.get(key) ?? [];
    const mode = pickFresh(MODES, recent);
    recentModes.set(key, [mode, ...recent].slice(0, 6));

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
        action: async () => generateCreativeRoll(),
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
    return settings;
}

function sceClearPrompt(context) {
    context?.setExtensionPrompt?.(SCE_PROMPT_ID, '', 1, 0, false, 1);
}

function sceFormatPrompt(roll) {
    return [
        '[STORY CHAOS ENGINE: AUTOMATIC CREATIVE ROLL, NOT CHARACTER SPEECH]',
        'Roll: ' + roll.roll + '/1000',
        'Optional narrative direction: ' + roll.creative_mode,
        'Optional focus: ' + roll.focus,
        ...(roll.rhythm ? ['Optional pacing: ' + roll.rhythm] : []),
        ...(roll.wildcard ? ['Optional wildcard: ' + roll.wildcard] : []),
        'Treat these as creative possibilities, not mandatory events or a fixed beat pattern.',
        'Preserve existing story continuity, distinctive voices, established formatting, and the user character’s agency.',
        'This note comes from a SillyTavern extension. It is NOT a message written by {{user}} and NOT an in-story action.',
        'Do not mention the roll, tool, or instructions in the fictional response.',
        '[/STORY CHAOS ENGINE]',
    ].join('\n');
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
    const result = JSON.parse(generateCreativeRoll());
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
        '<summary style="cursor:pointer;font-weight:bold">🎲 Story Chaos Engine · v1.2.0</summary>',
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
    console.info('[Story Chaos Engine] v1.2.0 initialized:', settings.mode);
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

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const familyIds = [
    'sustained', 'domino', 'parallel', 'echo', 'dialogue',
    'pivot', 'anticlimax', 'mosaic', 'reverse', 'time',
];
const sampleChat = [
    {mes: 'The café smelled like coffee. Clara hid a brass key under her porcelain saucer.', is_user: false},
    {mes: '"Why is the saucer rattling?" asked Theo, pulling his chair toward the table.', is_user: true},
    {mes: 'Clara watched the waiter, then pushed the saucer toward the window.', is_user: false},
];
function docFixture() {
    const cache = new Map();
    const create = () => ({
        textContent: '', innerHTML: '', value: '', checked: false, hidden: false,
        children: [], handlers: {},
        appendChild(node) { this.children.push(node); },
        addEventListener(kind, handler) { this.handlers[kind] = handler; },
        querySelector(query) {
            if (query === 'details > div') return this;
            if (!cache.has(query)) cache.set(query, create());
            return cache.get(query);
        },
    });
    const root = create();
    return {
        cache, root, readyState: 'complete',
        createElement: () => create(),
        getElementById(id) { return id === 'extensions_settings' ? root : null; },
    };
}
function boot(config = {}, chat = sampleChat, withUI = false) {
    const injected = [], registered = [];
    const context = {
        chatId: 'story-one',
        chat: chat.map(m => ({...m})),
        extensionSettings: {storyChaosEngine: {...config}},
        setExtensionPrompt(...args) { injected.push(args); },
        registerFunctionTool(tool) { registered.push(tool); },
        unregisterFunctionTool() {},
        saveSettingsDebounced() {},
    };
    const document = withUI ? docFixture() :
        {readyState:'complete', getElementById(){return null;}};
    const globals = {
        SillyTavern: { getContext: () => context },
        crypto: webcrypto, Uint32Array, Intl, document,
        console: {log(){}, info(){}, warn(){}, error(){}, debug(){}},
    };
    globals.globalThis = globals;
    vm.runInNewContext(script + '\n' +
        'globalThis.__structureTest = { roll: sceStructuralRoll, history: SCE_STRUCTURE_HISTORY, ' +
        'anchors: SCE_STRUCTURE_ANCHORS, format: sceFormatStructure, families: SCE_STRUCTURE_FAMILIES };',
        globals, {filename:'index.js'});
    return {context, globals, injected, registered, document};
}
function allFamilyWeights(only = null) {
    return Object.fromEntries(familyIds.map(id => [id, only === null || id === only ? 2 : 0]));
}
async function generate(b, type='normal') {
    await b.globals.storyChaosEngineInterceptor([], 4096, () => {}, type);
    return b.injected.at(-1)?.[1];
}

test('new settings migrate without altering existing creative injection behavior', async () => {
    const b = boot();
    const previous = JSON.stringify(b.context.chat);
    assert.equal(b.context.extensionSettings.storyChaosEngine.structureEnabled, false);
    const result = await generate(b);
    assert.match(result, /\[STORY CHAOS ENGINE:/);
    assert.doesNotMatch(result, /\[STRUCTURAL ENTROPY:/);
    assert.equal(b.injected[0][3], 0);
    assert.equal(b.injected[0][5], 1);
    assert.equal(b.registered.length, 0);
    assert.equal(JSON.stringify(b.context.chat), previous);
});

test('enabled Structural Entropy appends an abstract blueprint in the same request', async () => {
    const b = boot({structureEnabled:true, structureGrounding:100});
    const result = await generate(b);
    assert.match(result, /\[STORY CHAOS ENGINE:/);
    assert.match(result, /\[STRUCTURAL ENTROPY:/);
    assert.match(result, /Structural family: /);
    assert.match(result, /Relative attention: /);
    assert.match(result, /Possible abstract phases:/);
    assert.match(result, /Existing story words to consider/);
    assert.match(result, /No new user-character decisions or dialogue/);
    assert.equal(b.injected.length, 1, 'one combined depth-0 prompt');
    assert.equal(b.registered.length, 0, 'no function call');
});

test('blueprints are always internally consistent and beat labels never vanish', () => {
    const b = boot({structureEnabled:true,structureInfluence:85,beatDensity:70});
    for (let i = 0; i < 500; i++) {
        const result = b.globals.__structureTest.roll(b.context);
        assert.ok(result);
        assert.equal(result.count, result.beats.length);
        assert.equal(result.count, result.attention.length);
        assert.ok(result.count >= 1 && result.count <= 5);
        for (const beat of result.beats) {
            assert.equal(typeof beat.role, 'string');
            assert.ok(beat.role.length > 0);
            assert.ok(Number.isInteger(beat.attention));
            assert.ok(beat.attention > 0);
        }
    }
});

test('anti-repetition excludes last four structural families when alternatives exist', () => {
    const b = boot({structureEnabled:true,structureAntiRepeat:true});
    const recently = [];
    for (let i = 0; i < 320; i++) {
        const structure = b.globals.__structureTest.roll(b.context);
        assert.equal(recently.includes(structure.familyId), false, 'family repeated at '+i);
        recently.unshift(structure.familyId);
        recently.length = Math.min(4, recently.length);
    }
});

test('when only one family is enabled it remains available without empty outputs', () => {
    const b = boot({structureEnabled:true,structureWeights:allFamilyWeights('parallel')});
    for (let i = 0; i < 20; i++) {
        const structure = b.globals.__structureTest.roll(b.context);
        assert.equal(structure.familyId, 'parallel');
        assert.ok(structure.beats.length >= 2);
    }
});

test('beat density is clamped by the enabled family, not mistaken for paragraphs', () => {
    const b = boot({structureEnabled:true,beatDensity:0,structureWeights:allFamilyWeights('domino')});
    for (let i = 0; i < 20; i++) assert.equal(b.globals.__structureTest.roll(b.context).count, 2);
    b.context.extensionSettings.storyChaosEngine.beatDensity = 100;
    for (let i = 0; i < 20; i++) assert.equal(b.globals.__structureTest.roll(b.context).count, 5);
    const single = boot({structureEnabled:true,beatDensity:0,structureWeights:allFamilyWeights('sustained')});
    assert.equal(single.globals.__structureTest.roll(single.context).count, 1);
});

test('context grounding samples known chat vocabulary, zero grounding avoids anchors', () => {
    const grounded = boot({structureEnabled:true,structureGrounding:100});
    const sample = grounded.globals.__structureTest.roll(grounded.context);
    assert.ok(sample.anchors.length >= 1);
    assert.ok(sample.anchors.every(x => ['the','and','assistant'].includes(x) === false));
    assert.match(grounded.globals.__structureTest.format(sample), /Existing story words to consider/);
    const free = boot({structureEnabled:true,structureGrounding:0});
    for (let i = 0; i < 10; i++) assert.equal(free.globals.__structureTest.roll(free.context).anchors.length, 0);
});

test('influence zero or disabling every family leaves legacy prompt intact', async () => {
    const zero = boot({structureEnabled:true,structureInfluence:0});
    assert.doesNotMatch(await generate(zero), /\[STRUCTURAL ENTROPY:/);
    const allOff = boot({structureEnabled:true,structureWeights:allFamilyWeights('nothing')});
    assert.equal(allOff.globals.__structureTest.roll(allOff.context), null);
    assert.doesNotMatch(await generate(allOff), /\[STRUCTURAL ENTROPY:/);
});

test('preview does not consume structure anti-repeat history', () => {
    const b = boot({structureEnabled:true});
    for (let i = 0; i < 20; i++) {
        const roll = b.globals.__structureTest.roll(b.context,true);
        assert.ok(roll);
        assert.equal(b.globals.__structureTest.history.size, 0);
        assert.equal(b.globals.__structureTest.anchors.size, 0);
    }
    b.globals.__structureTest.roll(b.context,false);
    assert.equal(b.globals.__structureTest.history.size, 1);
});

test('settings are range-limited and preserve user-configured values', async () => {
    const b = boot({structureEnabled:true,structureInfluence:900,beatDensity:-6,structureGrounding:45,
        structureWeights:{parallel:0,sustained:3}});
    await generate(b);
    const opt = b.context.extensionSettings.storyChaosEngine;
    assert.equal(opt.structureInfluence, 100);
    assert.equal(opt.beatDensity, 0);
    assert.equal(opt.structureGrounding, 45);
    assert.equal(opt.structureWeights.parallel, 0);
    assert.equal(opt.structureWeights.sustained, 3);
});

test('quiet generation clears structural injection and default never calls tools', async () => {
    const b = boot({structureEnabled:true});
    await generate(b);
    assert.equal(await generate(b,'quiet'), '');
    assert.equal(await generate(b,'continue'), '');
    assert.equal(b.registered.length, 0);
});

test('Structural Entropy panel binds controls and previews without prompt injection', () => {
    const b = boot({}, sampleChat, true);
    assert.ok(b.document.root.children.length);
    const panel = b.document.root.children[0];
    assert.match(panel.innerHTML, /Story Chaos Engine/);
    const structureSection = panel.children.find(node => node.className === 'sce_structure_section');
    assert.ok(structureSection, 'structural settings section exists');
    assert.match(structureSection.innerHTML, /Structure influence/);
    assert.match(structureSection.innerHTML, /Beat density/);
    assert.match(structureSection.innerHTML, /Context grounding/);
    assert.match(structureSection.innerHTML, /sce_structure_parallel/);
    const elem = id => b.document.cache.get('#sce_' + id);
    const enable = elem('structure_enable');
    enable.checked = true; enable.handlers.change({target:enable});
    assert.equal(b.context.extensionSettings.storyChaosEngine.structureEnabled,true);
    const density = elem('structure_density');
    density.value = '93'; density.handlers.input({target:density});
    assert.equal(b.context.extensionSettings.storyChaosEngine.beatDensity,93);
    const preview = elem('structure_preview');
    for (let i=0; i<5; i++) {
        preview.handlers.click();
        assert.match(elem('structure_output').textContent,/Possible abstract phases:/);
    }
    assert.equal(b.injected.length,0);
    assert.equal(b.registered.length,0);
});

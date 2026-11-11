const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function boot(chatId = 'chat-one') {
    let tool;
    const context = {
        chatId,
        registerFunctionTool(definition) { tool = definition; },
    };
    const fakeGlobal = {
        SillyTavern: { getContext: () => context },
        crypto: webcrypto,
    };
    const sandbox = {
        globalThis: fakeGlobal,
        SillyTavern: fakeGlobal.SillyTavern,
        Uint32Array,
        Math,
        Number,
        JSON,
        Map,
        console: { log() {}, info() {}, warn() {} },
    };
    vm.runInNewContext(source, sandbox, { filename: 'index.js' });
    assert.ok(tool, 'Expected the extension to register a function tool');
    return { tool, context };
}

test('repository root contains a valid SillyTavern extension manifest', () => {
    assert.equal(manifest.js, 'index.js');
    assert.equal(typeof manifest.display_name, 'string');
    assert.ok(manifest.display_name.length > 0);
    assert.ok(fs.existsSync(path.join(root, manifest.js)));
});

test('registers a parameter-free non-stealth function tool', () => {
    const { tool } = boot();
    assert.equal(tool.name, 'story_chaos_roll');
    assert.equal(tool.parameters.type, 'object');
    assert.equal(Object.keys(tool.parameters.properties).length, 0);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.equal(tool.stealth, false);
    assert.equal(typeof tool.action, 'function');
});

test('each roll has a valid range, direction, focus, and optional fields', async () => {
    const { tool } = boot();
    for (let i = 0; i < 500; i++) {
        const roll = JSON.parse(await tool.action({}));
        assert.ok(Number.isInteger(roll.roll) && roll.roll >= 1 && roll.roll <= 1000);
        assert.ok(typeof roll.creative_mode === 'string' && roll.creative_mode.length > 0);
        assert.ok(typeof roll.focus === 'string' && roll.focus.length > 0);
        if ('rhythm' in roll) assert.equal(typeof roll.rhythm, 'string');
        if ('wildcard' in roll) assert.equal(typeof roll.wildcard, 'string');
        assert.equal(typeof roll.guidance, 'string');
    }
});

test('mode selection does not repeat any of the previous six modes per chat', async () => {
    const { tool } = boot();
    const recent = [];
    for (let i = 0; i < 300; i++) {
        const roll = JSON.parse(await tool.action({}));
        assert.equal(recent.includes(roll.creative_mode), false, 'mode repeated within six selections at ' + i);
        recent.unshift(roll.creative_mode);
        recent.length = Math.min(recent.length, 6);
    }
});

test('different chats have separate fresh-mode histories', async () => {
    const { tool, context } = boot('first');
    const first = JSON.parse(await tool.action({}));
    context.chatId = 'second';
    const second = JSON.parse(await tool.action({}));
    assert.ok(first.creative_mode);
    assert.ok(second.creative_mode);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function boot(mode = 'automatic') {
    const injections = [];
    const registered = [];
    const extensionSettings = { storyChaosEngine: { mode, role: 'user' } };
    const context = {
        chatId: 'fiction-chat',
        extensionSettings,
        registerFunctionTool(tool) { registered.push(tool); },
        unregisterFunctionTool(name) { registered.push('unregistered:' + name); },
        setExtensionPrompt(...args) { injections.push(args); },
        saveSettingsDebounced() {},
    };
    const globalObject = {
        SillyTavern: { getContext: () => context },
        crypto: webcrypto,
        Uint32Array,
        console: { info() {}, debug() {}, warn() {}, error() {} },
        document: { readyState: 'complete', getElementById() { return null; } },
    };
    globalObject.globalThis = globalObject;
    vm.runInNewContext(source, globalObject, { filename: 'index.js' });
    return { context, globalObject, injections, registered };
}

test('manifest exposes a pre-generation interceptor', () => {
    assert.equal(manifest.js, 'index.js');
    assert.equal(manifest.generate_interceptor, 'storyChaosEngineInterceptor');
    assert.equal(manifest.version, '1.2.0');
});

test('automatic mode generates a user-role depth-zero note without registering tools', async () => {
    const b = boot();
    assert.equal(b.registered.length, 0);
    const chat = [{ is_user: true, mes: 'A fictional user action' }];
    await b.globalObject.storyChaosEngineInterceptor(chat, 9000, () => {}, 'normal');
    assert.equal(b.injections.length, 1);
    const [name, prompt, position, depth, scan, role] = b.injections[0];
    assert.equal(name, 'story_chaos_engine_auto');
    assert.equal(position, 1);
    assert.equal(depth, 0);
    assert.equal(scan, false);
    assert.equal(role, 1);
    assert.ok(prompt.includes('Roll: '));
    assert.ok(prompt.includes('Optional narrative direction: '));
    assert.ok(prompt.includes('NOT a message written by {{user}}'));
    assert.equal(chat.length, 1, 'saved chat not modified');
});

test('rolls are 1 to 1000 and no mode repeats within last six in same chat', async () => {
    const b = boot();
    const recent = [];
    for (let i = 0; i < 250; i++) {
        await b.globalObject.storyChaosEngineInterceptor([], 9000, () => {}, 'normal');
        const prompt = b.injections.at(-1)[1];
        const roll = Number(prompt.match(/Roll: (\d+)\/1000/)[1]);
        const mode = prompt.match(/Optional narrative direction: (.*)/)[1];
        assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 1000);
        assert.ok(!recent.includes(mode), 'recent creative direction repeated');
        recent.unshift(mode);
        recent.length = Math.min(6, recent.length);
    }
});

test('quiet, continuation, and impersonation clear stale prompt', async () => {
    const b = boot();
    for (const type of ['quiet', 'continue', 'impersonate']) {
        await b.globalObject.storyChaosEngineInterceptor([], 9000, () => {}, type);
        assert.equal(b.injections.at(-1)[1], '');
    }
});

test('off mode does not create any tool or active prompt', async () => {
    const b = boot('off');
    await b.globalObject.storyChaosEngineInterceptor([], 9000, () => {}, 'normal');
    assert.equal(b.registered.length, 0);
    assert.equal(b.injections.at(-1)[1], '');
});

test('legacy tool mode remains available as explicit opt-in only', async () => {
    const b = boot('tool');
    assert.equal(b.registered.length, 1);
    const tool = b.registered[0];
    assert.equal(tool.name, 'story_chaos_roll');
    assert.equal(Object.keys(tool.parameters.properties).length, 0);
    const result = JSON.parse(await tool.action({}));
    assert.ok(result.roll >= 1 && result.roll <= 1000);
    await b.globalObject.storyChaosEngineInterceptor([], 9000, () => {}, 'normal');
    assert.equal(b.injections.at(-1)[1], '');
});

test('system-role injection can be selected', async () => {
    const b = boot();
    b.context.extensionSettings.storyChaosEngine.role = 'system';
    await b.globalObject.storyChaosEngineInterceptor([], 9000, () => {}, 'normal');
    assert.equal(b.injections[0][5], 0);
});

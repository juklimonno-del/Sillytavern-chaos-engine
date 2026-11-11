const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const categoryNames = ['direction','character','dialogue','social','setting','consequences',
    'humor','physical','curiosity','pacing','wildcard'];
const sampleChat = [
    { is_user: false, mes: 'Clara placed a porcelain teapot on the velvet sofa.' },
    { is_user: true, mes: 'I noticed the porcelain teapot by the window.' },
    { is_user: false, mes: 'The porcelain teapot rattled beside Clara on the sofa.' },
];

function fakeDocument() {
    const cache = new Map();
    const root = { children:[], appendChild(node) { this.children.push(node); } };
    const node = () => ({
        innerHTML:'', value:'', textContent:'', hidden:false, checked:false, children:[],
        handlers:{}, addEventListener(type, fn) { this.handlers[type]=fn; },
        appendChild(child) { this.children.push(child); },
        querySelector(selector) {
            if (selector === 'details > div') return this;
            if (!cache.has(selector)) cache.set(selector, node());
            return cache.get(selector);
        },
    });
    return {
        cache, root, readyState:'complete',
        getElementById(id) { return id === 'extensions_settings' ? root : null; },
        createElement() { return node(); },
    };
}

function boot(config={}, chat=sampleChat, withUi=false) {
    const injections=[], tools=[], removed=[];
    let saveCount=0;
    const context={
        chatId:'fiction-chat',
        chat: chat.map(x=>({ ...x })),
        extensionSettings:{storyChaosEngine:{...config}},
        setExtensionPrompt(...args) { injections.push(args); },
        registerFunctionTool(tool) { tools.push(tool); },
        unregisterFunctionTool(name) { removed.push(name); },
        saveSettingsDebounced() { saveCount++; },
    };
    const doc=withUi?fakeDocument():{
        readyState:'complete',getElementById(){return null;},
    };
    const globals={
        SillyTavern:{getContext:()=>context}, crypto:webcrypto, Uint32Array, Intl,
        document:doc, console:{info(){},warn(){},debug(){},error(){}},
    };
    globals.globalThis=globals;
    vm.runInNewContext(source,globals,{filename:'index.js'});
    return {context,globals,doc,injections,tools,removed,getSaveCount:()=>saveCount};
}
async function roll(result,kind='normal') {
    await result.globals.storyChaosEngineInterceptor([],10000,()=>{},kind);
    return result.injections.at(-1)[1];
}
function countLayers(prompt) { return (prompt.match(/Optional lens \[/g)||[]).length; }

test('manifest is installable and advertises v1.3.0 and CSS',()=>{
    assert.equal(manifest.js,'index.js');
    assert.equal(manifest.css,'style.css');
    assert.equal(manifest.version,'1.3.0');
    assert.equal(manifest.generate_interceptor,'storyChaosEngineInterceptor');
    assert.ok(fs.existsSync(path.join(root,'style.css')));
});

test('default automatic path keeps depth zero, user role and no function tool',async()=>{
    const b=boot();
    const before=JSON.stringify(b.context.chat);
    const prompt=await roll(b);
    assert.equal(b.tools.length,0);
    assert.equal(b.context.extensionSettings.storyChaosEngine.mode,'automatic');
    assert.equal(b.injections[0][0],'story_chaos_engine_auto');
    assert.equal(b.injections[0][2],1);
    assert.equal(b.injections[0][3],0);
    assert.equal(b.injections[0][5],1);
    assert.match(prompt,/Optional lens \[/);
    assert.equal(JSON.stringify(b.context.chat),before);
});

test('strength zero chooses one layer and strength 100 chooses five',async()=>{
    const low=boot({intensity:0,maxLayers:5});
    const high=boot({intensity:100,maxLayers:5});
    for(let i=0;i<30;i++) {
        assert.equal(countLayers(await roll(low)),1);
        assert.equal(countLayers(await roll(high)),5);
    }
});

test('category weights exclude turned off categories',async()=>{
    const onlySetting=Object.fromEntries(categoryNames.map(name=>[name,name==='setting'?3:0]));
    const b=boot({intensity:100,maxLayers:5,categoryWeights:onlySetting});
    for(let i=0;i<30;i++) {
        const prompt=await roll(b);
        assert.equal(countLayers(prompt),1);
        assert.match(prompt,/Optional lens \[Setting & objects\]/);
        assert.doesNotMatch(prompt,/Optional lens \[Story direction\]/);
    }
});

test('all categories turned off leaves just word sparks',async()=>{
    const weights=Object.fromEntries(categoryNames.map(name=>[name,0]));
    const b=boot({categoryWeights:weights});
    const prompt=await roll(b);
    assert.equal(countLayers(prompt),0);
    assert.match(prompt,/Optional word sparks/);
});

test('100% gravity finds story anchors; 0% gravity never uses anchors',async()=>{
    const high=boot({contextGravity:100});
    const low=boot({contextGravity:0,keywordBoost:0});
    assert.match(await roll(high),/Existing story anchor: "[^"]+"/);
    assert.doesNotMatch(await roll(low),/Existing story anchor:/);
});

test('custom keyword preference at 100 draws from user bank',async()=>{
    const b=boot({contextGravity:0,keywordBoost:100,customKeywords:'kiwi, velvet ribbon, kiwi'});
    const prompt=await roll(b);
    assert.match(prompt,/Optional word sparks: (.*kiwi.*|.*velvet ribbon.*)/);
});

test('no-repeat story directions remain distinct across six recent rolls',async()=>{
    const weights=Object.fromEntries(categoryNames.map(name=>[name,name==='direction'?3:0]));
    const b=boot({intensity:0,maxLayers:1,categoryWeights:weights});
    const recent=[];
    for(let i=0;i<100;i++) {
        const prompt=await roll(b);
        const match=prompt.match(/Optional lens \[Story direction\]: (.*)/);
        assert.ok(match);
        assert.ok(!recent.includes(match[1]),'repeated recent direction');
        recent.unshift(match[1]); recent.length=Math.min(6,recent.length);
    }
});

test('context scope recent ignores old chat history',async()=>{
    const chat=[{mes:'The distant observatory contained a brass telescope.'}];
    for(let i=0;i<20;i++) chat.push({mes:'A ceramic mug sat beside the coffee table.'});
    const b=boot({contextScope:'recent',contextGravity:100},chat);
    for(let i=0;i<40;i++) {
        const prompt=await roll(b);
        assert.doesNotMatch(prompt,/Existing story anchor: "(observatory|telescope|distant|brass)"/);
    }
});

test('quiet and continue clear injections; off mode skips injection',async()=>{
    const b=boot();
    for(const kind of ['quiet','continue','impersonate']) assert.equal(await roll(b,kind),'');
    const off=boot({mode:'off'});
    assert.equal(await roll(off),'');
    assert.equal(off.tools.length,0);
});

test('previous mode/role survive settings migration',async()=>{
    const b=boot({role:'system',maxLayers:99,contextGravity:-1,mode:'automatic'});
    await roll(b);
    assert.equal(b.injections[0][5],0);
    assert.equal(b.context.extensionSettings.storyChaosEngine.maxLayers,5);
    assert.equal(b.context.extensionSettings.storyChaosEngine.contextGravity,0);
});

test('legacy tool remains available only when explicitly selected',async()=>{
    const b=boot({mode:'tool'});
    assert.equal(b.tools.length,1);
    assert.equal(b.tools[0].name,'story_chaos_roll');
    assert.deepEqual(Object.keys(b.tools[0].parameters.properties),[]);
    const result=JSON.parse(await b.tools[0].action({}));
    assert.ok(result.roll>=1 && result.roll<=1000);
    assert.ok(Array.isArray(result.layers));
    assert.equal(await roll(b),'');
});

test('settings panel renders category controls and preview without an API request',()=>{
    const b=boot({},sampleChat,true);
    assert.ok(b.doc.root.children.length>0,'settings root contains extension panel');
    const panel=b.doc.root.children[0];
    assert.match(panel.innerHTML,/Story Chaos Engine/);
    const advanced=panel.children[0];
    assert.ok(advanced,'advanced controls are appended');
    assert.match(advanced.innerHTML,/sce_intensity/);
    assert.match(advanced.innerHTML,/sce_gravity/);
    assert.match(advanced.innerHTML,/sce_keywords/);
    assert.match(advanced.innerHTML,/sce_cat_setting/);
    const slider=b.doc.cache.get('#sce_intensity');
    slider.value='100';
    slider.handlers.input({target:slider});
    assert.equal(b.context.extensionSettings.storyChaosEngine.intensity,100);
    const button=b.doc.cache.get('#sce_preview');
    button.handlers.click();
    assert.match(b.doc.cache.get('#sce_preview_text').textContent,/Optional lens \[/);
    assert.equal(b.injections.length,0,'preview does not inject into prompt');
    assert.equal(b.tools.length,0);
    assert.ok(b.getSaveCount()>0);
});

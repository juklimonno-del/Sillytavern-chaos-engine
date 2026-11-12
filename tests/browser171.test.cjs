const {test}=require('node:test');const assert=require('node:assert/strict');const {browserTest}=require('../scripts/browser-test.cjs');
test('real Chromium DOM, ESM entry, settings, lifecycle and receipt smoke scenarios',{timeout:40000},async()=>{const result=await browserTest();assert.equal(result.failed,0);assert.equal(result.tests,20);});

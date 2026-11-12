'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const runner=path.join(__dirname,'..','scripts','browser-test.cjs');
for(const scenario of [
    {name:'an early clean exit',body:'exit 0',diagnostic:/code 0, signal none/},
    {name:'termination by a signal',body:'kill -TERM "$$"',diagnostic:/code null, signal SIGTERM/},
]){
    test('browser runner reports '+scenario.name+' as a failure before readiness',{timeout:10000},()=>{
        const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sce-browser-exit-test-'));
        try{
            // Exercise the real runner's child-process lifecycle without launching
            // Chromium. The separate real-DOM suite still requires a real browser.
            const executable=path.join(directory,'browser-stub');
            fs.writeFileSync(executable,'#!/bin/sh\nprintf "stub exited before DevTools readiness\\n" >&2\n'+scenario.body+'\n',{mode:0o700});
            const result=spawnSync(process.execPath,[runner],{
                env:{...process.env,CHROME_BIN:executable},encoding:'utf8',timeout:5000,
            });
            assert.ifError(result.error);
            assert.equal(result.status,1,'A browser that never becomes ready must not succeed or hang');
            assert.match(result.stderr,/Browser exited before DevTools readiness/);
            assert.match(result.stderr,scenario.diagnostic);
            assert.match(result.stderr,/stub exited before DevTools readiness/);
            assert.equal(result.stdout,'','A launch failure must not emit a browser-test success result');
        }finally{
            fs.rmSync(directory,{recursive:true,force:true});
        }
    });
}

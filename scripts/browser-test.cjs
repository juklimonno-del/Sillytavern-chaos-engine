'use strict';
// Real browser tests using Node 22's built-in WebSocket and the Chrome DevTools protocol.
// No browser automation package or runtime dependency is installed by the extension.
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
function browserPath(){for(const candidate of [process.env.CHROME_BIN,process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/opt/google/chrome/chrome'])if(candidate&&fs.existsSync(candidate))return candidate;throw new Error('Chromium/Chrome is required for the real-DOM suite. Set CHROME_BIN to its executable.');}
function connect(url){return new Promise((resolve,reject)=>{const socket=new WebSocket(url);let id=0;const pending=new Map();socket.addEventListener('error',reject,{once:true});socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const p=pending.get(value.id);pending.delete(value.id);value.error?p.reject(new Error(JSON.stringify(value.error))):p.resolve(value.result);}});socket.addEventListener('open',()=>resolve({close:()=>socket.close(),send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));})}),{once:true});});}
async function browserTest(){
 const data=(mime,text)=>'data:'+mime+';base64,'+Buffer.from(text).toString('base64');
 const source=data('text/javascript',fs.readFileSync(path.join(root,'index.js'),'utf8'));
 const entry=data('text/javascript',fs.readFileSync(path.join(root,'entry.js'),'utf8').replace("'./index.js'",JSON.stringify(source)));
 const css=data('text/css',fs.readFileSync(path.join(root,'style.css'),'utf8'));
 const html=fs.readFileSync(path.join(root,'tests/browser-fixture.html'),'utf8').replace("'/entry.js'",JSON.stringify(entry)).replace('href="/style.css"','href="'+css+'"');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sce-browser-'));let proc,cdp;
 try{
 const endpoint=await new Promise((resolve,reject)=>{let stderr='';proc=spawn(browserPath(),['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});const timer=setTimeout(()=>reject(new Error('Browser launch exceeded 15s\n'+stderr.slice(-1500))),15000);proc.stderr.on('data',d=>{stderr+=d;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(new URL(match[1]));}});proc.on('error',e=>{clearTimeout(timer);reject(e);});proc.on('exit',(code,signal)=>{clearTimeout(timer);reject(new Error('Browser exited before DevTools readiness (code '+code+', signal '+(signal||'none')+')\n'+stderr.slice(-1500)));});});
 const response=await fetch(`http://${endpoint.host}/json/new?about:blank`,{method:'PUT'});if(!response.ok)throw new Error('Cannot create browser tab');const tab=await response.json();cdp=await connect(tab.webSocketDebuggerUrl);
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');
 // The complete fixture is offline. Only the relative import URL is mapped to
 // the byte-identical index.js data module; no browser network access is needed.
 await cdp.send('Runtime.evaluate',{expression:'document.open();document.write('+JSON.stringify(html)+');document.close();'});
 const until=Date.now()+15000;let result;
 while(Date.now()<until){const evaluated=await cdp.send('Runtime.evaluate',{expression:'document.documentElement.dataset.testStatus ? document.getElementById("test-result").textContent : null',returnByValue:true});if(evaluated.result?.value){result=JSON.parse(evaluated.result.value);break;}await new Promise(r=>setTimeout(r,50));}
 if(!result){const body=await cdp.send('Runtime.evaluate',{expression:'document.body?.innerText',returnByValue:true});throw new Error('Browser fixture did not complete: '+String(body.result?.value).slice(-2000));}
 if(result.failed)throw new Error(JSON.stringify(result,null,2));return result;
 }finally{cdp?.close();if(proc){const exited=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,1500))]);if(proc.exitCode==null)proc.kill('SIGKILL');}fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
module.exports={browserTest};
if(require.main===module)browserTest().then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.stack||e);process.exitCode=1;});

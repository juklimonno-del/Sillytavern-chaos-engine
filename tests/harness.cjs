const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','index.js'),'utf8');
const assistant=mes=>({is_user:false,mes,name:'Bonnie'});
const user=mes=>({is_user:true,mes,name:'User'});
const texted=()=>['Bonnie texted her friend.','Bonnie sent a message.','Bonnie typed a text.','Bonnie messaged her friend.'].map(assistant);
function boot(options={},chat=[],seed=12345){
    let current,random=seed>>>0;
    const handlers=new Map(),injections=[],tools=[],notices=[],cleared=[];
    const types={};
    for(const key of ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED',
      'CHAT_CHANGED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED',
      'CHATCOMPLETION_MODEL_CHANGED','CHATCOMPLETION_SOURCE_CHANGED','MAIN_API_CHANGED','CONNECTION_PROFILE_LOADED',
      'CHAT_COMPLETION_PROMPT_READY','GENERATE_AFTER_DATA','CHAT_COMPLETION_SETTINGS_READY','TEXT_COMPLETION_SETTINGS_READY','APP_READY','EXTENSION_SETTINGS_LOADED'])types[key]=key;
    const events={on(key,fn){if(!handlers.has(key))handlers.set(key,new Set());handlers.get(key).add(fn);},
      removeListener(key,fn){handlers.get(key)?.delete(fn);},emit(key,...args){for(const fn of [...(handlers.get(key)||[])])fn(...args);}};
    const context={chatId:'test-chat',characterId:0,name1:'User',name2:'Bonnie',characters:[{name:'Bonnie',avatar:'bonnie.png'}],
      mainApi:'openai',onlineStatus:'ready',model:'test-model',chat:chat.map(x=>({...x})),chatMetadata:{},
      extensionSettings:{storyChaosEngine:{...options}},extensionPrompts:{},eventSource:events,eventTypes:types,
      setExtensionPrompt(...args){injections.push(args);this.extensionPrompts[args[0]]={value:args[1]};},
      registerFunctionTool(tool){tools.push(tool);},unregisterFunctionTool(){},saveSettingsDebounced(){},saveMetadataDebounced(){}};
    current=context;
    const scope={SillyTavern:{getContext:()=>current},console:{info(){},debug(){},warn(){},error(){}},
      Uint32Array,Intl,Date,setTimeout,clearTimeout,AbortController,structuredClone,
      crypto:{getRandomValues(a){for(let i=0;i<a.length;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;a[i]=random;}return a;}},
      toastr:{info(...args){const toast={args};notices.push(toast);return toast;},clear(toast){cleared.push(toast);}}};
    scope.globalThis=scope;
    vm.runInNewContext(source+`\n;globalThis.__test={settings:sceSettings,on:sceOn,effective:sceEffective,preset:scePresetMatch,applyPreset:sceApplyPreset,
        clean:sceStoryText,record:sceRecord,index:sceWordIndex,hash:sceFeedbackHash,fp:sceFeedbackFingerprint,
        eligible:sceFeedbackMessageEligible,entries:sceFeedbackReplyEntries,snapshot:sceSnapshot,actors:sceKnownActors,
        motifs:sceEndingMotifs,watch:sceEndingWatch,endingObserve:sceEndingObserve,requested:sceRequestedActivities,
        creative:sceLayeredRoll,structural:sceStructuralRoll,families:SCE_STRUCTURE_FAMILIES,categories:SCE_CATEGORIES,
        packet:sceBuildPacket,format:sceFormatCombined,observe:sceFeedbackObserve,factors:sceFeedbackFactors,state:sceFeedbackState,
        reconcile:sceFeedbackReconcile,pending:sceFeedbackPending,identity:sceFeedbackIdentity,
        receipt:sceRunReceipt,receiptText:sceReceiptText,finish:sceFinalizeRun,run:()=>sceActiveRun,
        init:sceInit,dispose:sceDispose,random:randomInt,words:scePersonalWords,
        counters:SCE_ANALYSIS_COUNTERS,caches:[SCE_RECORD_CACHE,sceWordIndexCache,SCE_FEEDBACK_STATES,SCE_RUN_RECEIPTS,
          recentModes,sceRecentCueHistory,sceRecentAnchorHistory,SCE_STRUCTURE_HISTORY,SCE_STRUCTURE_ANCHORS],
        structureHistory:SCE_STRUCTURE_HISTORY,cueHistory:sceRecentCueHistory,key:getChatKey};`,scope,{filename:'index.js'});
    const api=scope.__test;api.init();
    return {context,scope,api,events,handlers,injections,tools,notices,cleared,setContext(c){current=c;}};
}
async function prepare(b,type='normal',start=true){
    if(start)b.events.emit('GENERATION_STARTED',type,{},false);
    await b.scope.storyChaosEngineInterceptor([],8192,()=>{},type);
    return b.api.run();
}
function attachReply(b,run,text='Bonnie moved the teapot to the window.',stream=true){
    const message={...assistant(text),gen_started:new Date(run.started+1),gen_finished:new Date(run.started+2)};
    if(run.type==='swipe')message.swipe_id=(b.context.chat[run.targetIndex]?.swipe_id||0)+1;
    b.context.chat[run.targetIndex]=message;
    if(stream)b.context.streamingProcessor={messageId:run.targetIndex,timeStarted:message.gen_started,isFinished:true,isStopped:false,abortController:{signal:{aborted:false}}};
    else b.context.streamingProcessor=null;
    b.events.emit('CHAT_COMPLETION_SETTINGS_READY',{stream,messages:[{role:'user',content:run.prompt}]});
    return message;
}
function finish(b,run,order=['MESSAGE_RECEIVED','CHARACTER_MESSAGE_RENDERED','GENERATION_ENDED']){
    for(const event of order)b.events.emit(event,run.targetIndex,run.type);b.api.finish(run);return b.api.receipt(b.context);
}
async function complete(b,text,stream=true,type='normal'){
    const run=await prepare(b,type);attachReply(b,run,text,stream);finish(b,run);return run;
}
module.exports={boot,prepare,attachReply,finish,complete,assistant,user,texted,source};

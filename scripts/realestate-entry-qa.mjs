// Destructive only to the isolated QA browser's local demo storage.
// Start Chrome with a disposable --user-data-dir and remote debugging on 127.0.0.1:9228.
import {writeFile} from 'node:fs/promises';
const target=(await(await fetch('http://127.0.0.1:9228/json')).json()).find(p=>p.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[],network=[],results=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.loadingFailed')network.push(m.params)};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value};
const check=(name,value)=>{if(!value)throw Error('FAILED '+name);results.push({name,passed:true});console.log('PASS',name)};
const text=()=>ev('document.body.innerText');
const click=async(name,scope='document')=>{await ev(`(()=>{const b=[...${scope}.querySelectorAll('button,a,[role=option]')].filter(e=>!e.closest('[aria-hidden="true"]')&&!e.closest('[data-state="closed"][role="dialog"]')).find(e=>e.innerText.trim()===${JSON.stringify(name)}||e.getAttribute('aria-label')===${JSON.stringify(name)});if(!b||b.disabled)throw Error('Missing button '+${JSON.stringify(name)});b.focus();b.click()})()`);await wait(260)};
const field=async(name,value)=>{await ev(`(()=>{const root=[...document.querySelectorAll('[role=dialog]')].filter(e=>!e.closest('[aria-hidden="true"]')&&e.getAttribute('data-state')!=='closed').at(-1)||document;const l=[...root.querySelectorAll('label')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(name)}));const x=l?.querySelector('input,select,textarea');if(!x)throw Error('Missing field '+${JSON.stringify(name)});Object.getOwnPropertyDescriptor(x.tagName==='SELECT'?HTMLSelectElement.prototype:x.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(x,${JSON.stringify(value)});x.dispatchEvent(new Event(x.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`);await wait(120)};
const fill=async(selector,value)=>{await ev(`(()=>{const x=document.querySelector(${JSON.stringify(selector)});if(!x)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(x.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(x,${JSON.stringify(value)});x.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(120)};
const nav=async(name)=>{await ev(`(()=>{const b=[...document.querySelectorAll('aside button')].find(e=>e.innerText.startsWith(${JSON.stringify(name)}));if(!b)throw Error('Missing nav');b.click()})()`);await wait(180)};
const choose=async(label,value)=>{const point=await ev(`(()=>{const b=document.querySelector('button[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!b)throw Error('Missing select');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point});await wait(130);await click(value);};
const key=async(key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='Escape'?27:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});await wait(250)};
const state=()=>ev('JSON.parse(localStorage.getItem("ai-business-os-workspace"))');
const reload=async()=>{await send('Page.reload',{ignoreCache:true});await wait(700)};
await send('Runtime.enable');await send('Network.enable');await send('Page.enable');

try {
check('isolated localhost QA profile',/^http:\/\/127\.0\.0\.1:5177/.test(await ev('location.href')));
const w=await ev(`(async()=>{const a=await import('/src/services/aiEngine.ts'),c=await import('/src/services/companies.ts');const x=a.analyzeBusiness('real estate agency');return c.upgradeCompanies(a.generateWorkspace(x,a.generateArchitectureOptions(x)[2]))})()`);
w.id='synthetic-realestate-browser-fix';w.companyName='QA Real Estate';
const request='aggiungi una nuova proprietà da 450 mila euro';
if(process.argv[2]==='production'){await send('Page.navigate',{url:'https://nodus-erp.netlify.app/'});await wait(1500)}
const wrong={id:'wrong-old-draft',request,baseRevision:w.revision||0,operations:[{entityId:'companies',kind:'create',record:{id:'wrong-company',name:'nuova proprietà da 450 mila euro',partyRole:'Cliente'}}],questions:[],builder:false};
await ev(`localStorage.setItem('ai-business-os-workspace',${JSON.stringify(JSON.stringify(w))});localStorage.setItem(${JSON.stringify('nodus-ai-'+w.id)},${JSON.stringify(JSON.stringify({input:'',messages:[{q:request,a:'Vecchia proposta non salvata'}],entry:wrong}))});location.hash='workspace/dashboard'`);
await reload();await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await click('NODUS AI');
check('wrong cached company proposal is not restored',await ev('!document.querySelector(".ai-entry-preview")'));
check('original request recovered as editable text',(await ev('document.querySelector(".assistant-input textarea").value'))===request);
const before=await state(),propertiesBefore=before.entities.find(e=>e.id==='properties').records.length,companiesBefore=before.entities.find(e=>e.id==='companies').records.length;
const ask=async value=>{await fill('.assistant-input textarea',value);await click('Invia messaggio');for(let i=0;i<40;i++){if(await ev('!document.querySelector(".assistant-content").getAttribute("aria-busy")||document.querySelector(".assistant-content").getAttribute("aria-busy")==="false"'))break;await wait(700)}};
await ask(request);
const preview=await ev('!!document.querySelector(".ai-entry-preview")');
check('property draft or property clarification, never company draft',preview?await ev('[...document.querySelectorAll(".ai-entry-preview legend")].some(x=>x.innerText.includes("Properties"))&&![...document.querySelectorAll(".ai-entry-preview legend")].some(x=>x.innerText.includes("Aziende"))'):/indirizzo|riferimento|immobile|proprietà/i.test(await text()));
if(preview)check('price extracted as 450000',await ev('[...document.querySelectorAll(".ai-entry-preview input")].some(x=>x.value==="450000")'));
check('company-specific selector hidden',!(await text()).includes('Azienda di riferimento (per omonimie)'));
check('missing identifier blocks confirmation',await ev('![...document.querySelectorAll(".ai-entry-preview button")].find(x=>x.innerText==="Conferma")||[...document.querySelectorAll(".ai-entry-preview button")].find(x=>x.innerText==="Conferma").disabled'));
check('no records saved before confirmation',JSON.stringify(await state())===JSON.stringify(before));
check('chat accepts missing details',await ev('!document.querySelector(".assistant-input textarea").disabled'));
await ask('Riferimento: QA-MOD450; Indirizzo: Via Roma 12, Modena');
check('completed property preview ready',await ev('![...document.querySelectorAll(".ai-entry-preview button")].find(x=>x.innerText==="Conferma").disabled'));
check('completed price is 450000',await ev('[...document.querySelectorAll(".ai-entry-preview input")].some(x=>x.value==="450000")'));
await click('Conferma');await wait(200);
const saved=await state();
check('property saved only after confirmation',saved.entities.find(e=>e.id==='properties').records.length===propertiesBefore+1&&saved.entities.find(e=>e.id==='properties').records.some(r=>r.reference==='QA-MOD450'&&r.askingPrice===450000));
check('companies unchanged',saved.entities.find(e=>e.id==='companies').records.length===companiesBefore);
await click('Chiudi NODUS AI');await nav('Aziende');await click('NODUS AI','document.querySelector(".entity-page")');await ask(request);
check('explicit property intent overrides Companies page',await ev('![...document.querySelectorAll(".ai-entry-preview legend")].some(x=>x.innerText.includes("Aziende"))'));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(150);
check('property conversation fits mobile',await ev('(!document.querySelector(".ai-entry-preview")||document.querySelector(".ai-entry-preview").scrollWidth<=document.querySelector(".ai-entry-preview").clientWidth)&&document.documentElement.scrollWidth<=innerWidth'));
check('no runtime errors',errors.length===0);
console.log(JSON.stringify({mode:process.argv[2]||'local',results,errors},null,2));
}finally{ws.close()}

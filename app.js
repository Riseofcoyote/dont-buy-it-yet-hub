const STAGES = [
  'Idea','Research','Script','Voice','B-roll','Edit','Ready to Post','Published'
];
const STORAGE_KEY = 'dbiy-production-hub-v1';
let projects = loadProjects();
let activeProjectId = null;
let selectedFinalVideo = null;
let selectedProvider = 'chatgpt';
let selectedProjectProvider = 'chatgpt';
const PROVIDER_URLS = {chatgpt:'https://chatgpt.com/',claude:'https://claude.ai/new',gemini:'https://gemini.google.com/app'};
const ASSET_DB_NAME = 'dbiy-assets-v1';
const ASSET_STORE = 'assets';

const board = document.getElementById('board');
const dialog = document.getElementById('projectDialog');
const form = document.getElementById('projectForm');
const stageSelect = document.getElementById('stageSelect');

stageSelect.innerHTML = STAGES.map(s=>`<option>${s}</option>`).join('');

document.querySelectorAll('.command-preset').forEach(btn=>btn.addEventListener('click',()=>{
  document.getElementById('globalCommand').value=btn.dataset.command||'';
}));
document.querySelectorAll('.provider-btn').forEach(btn=>btn.addEventListener('click',()=>{
  selectedProvider=btn.dataset.provider||'chatgpt';
  document.querySelectorAll('.provider-btn').forEach(b=>b.classList.toggle('active',b===btn));
}));
document.querySelectorAll('.project-provider-btn').forEach(btn=>btn.addEventListener('click',()=>{
  selectedProjectProvider=btn.dataset.provider||'chatgpt';
  document.querySelectorAll('.project-provider-btn').forEach(b=>b.classList.toggle('active',b===btn));
}));
document.getElementById('openProviderBtn').addEventListener('click',()=>{
  window.open(PROVIDER_URLS[selectedProvider]||PROVIDER_URLS.chatgpt,'_blank','noopener');
});
document.querySelectorAll('.project-command-preset').forEach(btn=>btn.addEventListener('click',()=>{
  document.getElementById('projectCommand').value=btn.dataset.command||'';
}));
document.getElementById('shareTaskBtn').addEventListener('click',async()=>{
  const p=getNextProject();
  const command=document.getElementById('globalCommand').value.trim();
  if(!p){alert('Add a review first.');return;}
  if(!command){alert('Enter a production command first.');return;}
  await queueAndShareCommand(p.id,command,selectedProvider);
});
document.getElementById('syncChatGPTBtn').addEventListener('click',syncFromGitHub);
document.getElementById('sendProjectCommandBtn').addEventListener('click',async()=>{
  if(!activeProjectId){alert('Save this review first, then send the command.');return;}
  const command=document.getElementById('projectCommand').value.trim();
  if(!command){alert('Enter a project command first.');return;}
  await queueAndShareCommand(activeProjectId,command,selectedProjectProvider);
});
document.getElementById('assetInput').addEventListener('change',async e=>{
  if(!activeProjectId){alert('Save this review first, then add assets.'); e.target.value=''; return;}
  const files=[...(e.target.files||[])];
  for(const file of files) await saveLocalAsset(activeProjectId,file);
  e.target.value='';
  await renderAssetGrid(activeProjectId);
});

document.getElementById('addProjectBtn').addEventListener('click',()=>openProject());
document.getElementById('nextTaskBtn').addEventListener('click',()=>{
  const p = getNextProject();
  if(p) openProject(p.id); else openProject();
});
document.getElementById('deleteBtn').addEventListener('click',()=>{
  if(!activeProjectId) return;
  if(confirm('Delete this review?')){
    projects = projects.filter(p=>p.id!==activeProjectId);
    saveProjects(); dialog.close(); render();
  }
});

document.getElementById('exportBtn').addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify({version:1,projects},null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='dont-buy-it-yet-backup.json'; a.click(); URL.revokeObjectURL(a.href);
});

const finalVideoInput = document.getElementById('finalVideoInput');
finalVideoInput.addEventListener('change', e=>{
  selectedFinalVideo=e.target.files?.[0] || null;
  document.getElementById('selectedVideoName').textContent=selectedFinalVideo ? `${selectedFinalVideo.name} • ${formatBytes(selectedFinalVideo.size)}` : 'No video selected.';
});

document.getElementById('copyAffiliateBtn').addEventListener('click',()=>copyField('affiliateUrl','Impact link'));
document.getElementById('copyTitleBtn').addEventListener('click',()=>copyField('youtubeTitle','YouTube title'));
document.getElementById('copyDescriptionBtn').addEventListener('click',()=>copyField('youtubeDescription','YouTube description'));
document.getElementById('addImpactBtn').addEventListener('click',()=>{
  const url=document.getElementById('affiliateUrl').value.trim();
  if(!url){alert('Add the Impact affiliate link first.');return;}
  const box=document.getElementById('youtubeDescription');
  const disclosure='Disclosure: I may earn a commission if you purchase through this link, at no extra cost to you.';
  const block=`\n\nCheck current price / offer: ${url}\n${disclosure}`;
  if(!box.value.includes(url)) box.value=box.value.trimEnd()+block;
});

document.getElementById('shareVideoBtn').addEventListener('click', async ()=>{
  if(!selectedFinalVideo){alert('Choose the finished video file first.');return;}
  const title=document.getElementById('youtubeTitle').value.trim();
  const text=document.getElementById('youtubeDescription').value.trim();
  try{
    if(navigator.canShare && navigator.canShare({files:[selectedFinalVideo]})){
      await navigator.share({files:[selectedFinalVideo],title:title||'DON’T BUY IT YET',text});
    }else{
      window.open('https://studio.youtube.com','_blank','noopener');
      alert('Your browser cannot share video files directly. YouTube Studio has been opened instead.');
    }
  }catch(err){
    if(err?.name!=='AbortError') alert('Could not open the share sheet. Try YouTube Studio instead.');
  }
});

async function copyField(id,label){
  const value=document.getElementById(id).value.trim();
  if(!value){alert(`${label} is empty.`);return;}
  try{await navigator.clipboard.writeText(value); alert(`${label} copied.`);}catch{alert('Copy was blocked by the browser. Press and hold the field to copy it.');}
}
function formatBytes(n){
  if(!Number.isFinite(n)) return '';
  const units=['B','KB','MB','GB']; let i=0,v=n;
  while(v>=1024&&i<units.length-1){v/=1024;i++;}
  return `${v.toFixed(i?1:0)} ${units[i]}`;
}

document.getElementById('importInput').addEventListener('change', async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.projects)) throw new Error();
    projects=data.projects; saveProjects(); render();
    alert('Backup imported.');
  }catch{alert('That backup file could not be read.');}
  e.target.value='';
});

form.addEventListener('submit',e=>{
  e.preventDefault();
  const now=new Date().toISOString();
  const data={
    id:activeProjectId || crypto.randomUUID(),
    name:document.getElementById('productName').value.trim(),
    productUrl:document.getElementById('productUrl').value.trim(),
    affiliateUrl:document.getElementById('affiliateUrl').value.trim(),
    stage:document.getElementById('stageSelect').value,
    notes:document.getElementById('notes').value,
    voiceChunks:document.getElementById('voiceChunks').value,
    broll:document.getElementById('broll').value,
    youtubeTitle:document.getElementById('youtubeTitle').value,
    youtubeDescription:document.getElementById('youtubeDescription').value,
    youtubeTags:document.getElementById('youtubeTags').value,
    dropboxFolder:document.getElementById('dropboxFolder').value.trim(),
    cloudAssets:document.getElementById('cloudAssets').value.split('\n').map(x=>x.trim()).filter(Boolean),
    aiJobs:(projects.find(p=>p.id===(activeProjectId||''))?.aiJobs)||[],
    assistantOutput:(projects.find(p=>p.id===(activeProjectId||''))?.assistantOutput)||'',
    createdAt: now,
    updatedAt: now
  };
  const idx=projects.findIndex(p=>p.id===data.id);
  if(idx>=0){data.createdAt=projects[idx].createdAt; projects[idx]=data;} else projects.unshift(data);
  saveProjects(); dialog.close(); render();
});

function loadProjects(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(Array.isArray(saved) && saved.length) return saved;
  }catch{}
  return [{
    id:'roborock-qrevo-2-pro-first-review',
    name:'Roborock Qrevo 2 Pro',
    productUrl:'https://us.roborock.com/products/roborock-qrevo-2-pro',
    affiliateUrl:'',
    stage:'Script',
    notes:`FIRST DON’T BUY IT YET REVIEW

Working angle: “Roborock Qrevo 2 Pro: DON’T BUY IT Until You Know These 7 Things”

Research check — Oct. 2, 2026:
• Official U.S. listing: 20,000 Pa HyperForce suction.
• Official U.S. price observed: $549.99 vs $799.99 list price.
• Official features: dual anti-tangle system, auto mop detachment for carpets, reversible side brush/corner coverage, multifunction dock, app control.
• Roborock Fall Prime Day page lists $484.99 for the Oct. 6–11 main-event window. Recheck price immediately before publishing.
• Recent WIRED hands-on review praised vacuuming/mopping and corner cleaning, but reported trouble detecting cords, cat toys and other small objects; spill cleanup was a weaker area.
• Recent TechRadar testing found excellent mopping and good vacuuming, but noted the tall LiDAR limits low-furniture clearance, the dock needs floor space, disposable dust bags add running cost, and a charging cable caused trouble.

VOICE LANGUAGE RULE:
Say “I researched…”, “Roborock says…”, “WIRED found…”, “TechRadar found…”, or “reviewers reported…”. Do NOT say “I tested” because we do not own/test this unit.

Production target:
0:00–0:20 hook
0:20–1:00 price / what it is
1:00–2:00 core features
2:00–3:30 strengths
3:30–5:00 problems / complaints
5:00–6:30 alternatives / value
6:30–7:30 who should buy
7:30–8:30 who should skip
8:30–9:00 conclusion / CTA`,
    voiceChunks:`Before you spend your money, let’s find out if this product is actually worth it. I’m Rock, and this is Don’t Buy It Yet. We’ll look at what it does well, where it falls short, and whether it deserves your money.`,
    broll:`Hook: black Qrevo 2 Pro + dock hero shot
Official 20,000 Pa suction graphic
Current official price / MSRP screen
Auto mop removal demonstration or official graphic
Dual anti-tangle brush close-up
Reversible side brush / corner-cleaning shot
Multifunction dock shot
App / mapping screen
Cable and small-toy obstacle warning graphic
Low-furniture clearance illustration
Disposable dust-bag / running-cost visual
Mixed hard-floor + carpet lifestyle B-roll
Closing product hero shot + DON’T BUY IT YET branding`,
    youtubeTitle:'Roborock Qrevo 2 Pro: DON’T BUY IT Until You Know These 7 Things',
    youtubeDescription:`Roborock’s Qrevo 2 Pro packs 20,000 Pa suction, automatic mop removal, anti-tangle cleaning and a multifunction dock — but there are a few things worth knowing before you buy.

In this research-based review, we break down the features, recent independent testing, drawbacks and who this robot vacuum is actually best for.

Check the current price using the affiliate link added below before publishing.`,
    youtubeTags:'Roborock Qrevo 2 Pro, robot vacuum review, Roborock review, robot vacuum and mop, don’t buy it yet, smart home',
    dropboxFolder:"/DON'T BUY IT YET/Roborock Qrevo 2 Pro",
    cloudAssets:[],
    aiJobs:[],
    assistantOutput:'',
    createdAt:'2026-10-02T20:55:00-04:00',
    updatedAt:'2026-10-02T20:55:00-04:00'
  }];
}
function saveProjects(){localStorage.setItem(STORAGE_KEY,JSON.stringify(projects));}
function stageIndex(stage){return Math.max(0,STAGES.indexOf(stage));}
function getNextProject(){return [...projects].filter(p=>p.stage!=='Published').sort((a,b)=>stageIndex(b.stage)-stageIndex(a.stage)||new Date(a.updatedAt)-new Date(b.updatedAt))[0];}
function nextTaskFor(p){
  if(!p) return 'Add your first product review.';
  const i=stageIndex(p.stage);
  const tasks={
    'Idea':'Research the product and competition.',
    'Research':'Finish the review script.',
    'Script':'Generate the voice-over chunks in Chatterbox.',
    'Voice':'Collect the required product footage and B-roll.',
    'B-roll':'Assemble the review in CapCut.',
    'Edit':'Finish title, thumbnail, description and affiliate disclosure.',
    'Ready to Post':'Publish the video.',
    'Published':'Review performance and choose the next product.'
  };
  return `${p.name}: ${tasks[p.stage] || STAGES[Math.min(i+1,STAGES.length-1)]}`;
}
function openProject(id=null){
  activeProjectId=id;
  const p=projects.find(x=>x.id===id);
  document.getElementById('dialogTitle').textContent=p?'Review Workspace':'New Review';
  document.getElementById('projectId').value=p?.id||'';
  document.getElementById('productName').value=p?.name||'';
  document.getElementById('productUrl').value=p?.productUrl||'';
  document.getElementById('affiliateUrl').value=p?.affiliateUrl||'';
  document.getElementById('stageSelect').value=p?.stage||'Idea';
  document.getElementById('notes').value=p?.notes||'';
  document.getElementById('voiceChunks').value=p?.voiceChunks||'';
  document.getElementById('broll').value=p?.broll||'';
  document.getElementById('youtubeTitle').value=p?.youtubeTitle||'';
  document.getElementById('youtubeDescription').value=p?.youtubeDescription||'';
  document.getElementById('youtubeTags').value=p?.youtubeTags||'';
  document.getElementById('dropboxFolder').value=p?.dropboxFolder||`/DON'T BUY IT YET/${p?.name||'New Review'}`;
  document.getElementById('cloudAssets').value=Array.isArray(p?.cloudAssets)?p.cloudAssets.join('\n'):(p?.cloudAssets||'');
  document.getElementById('projectCommand').value='';
  renderJobQueue(p);
  document.getElementById('assistantOutput').textContent=p?.assistantOutput||'No synced output yet.';
  if(p) renderAssetGrid(p.id); else document.getElementById('assetGrid').innerHTML='<div class="empty">Save the review before adding local assets.</div>';
  selectedFinalVideo=null; finalVideoInput.value='';
  document.getElementById('selectedVideoName').textContent='No video selected.';
  document.getElementById('deleteBtn').style.visibility=p?'visible':'hidden';
  dialog.showModal();
}
function advanceProject(id){
  const p=projects.find(x=>x.id===id); if(!p) return;
  const i=stageIndex(p.stage); if(i<STAGES.length-1) p.stage=STAGES[i+1];
  p.updatedAt=new Date().toISOString(); saveProjects(); render();
}
function render(){
  const active=projects.filter(p=>!['Ready to Post','Published'].includes(p.stage)).length;
  document.getElementById('activeCount').textContent=active;
  document.getElementById('readyCount').textContent=projects.filter(p=>p.stage==='Ready to Post').length;
  document.getElementById('publishedCount').textContent=projects.filter(p=>p.stage==='Published').length;
  const next=getNextProject(); document.getElementById('nextTaskText').textContent=nextTaskFor(next);

  board.innerHTML='';
  STAGES.forEach(stage=>{
    const col=document.createElement('section'); col.className='column';
    const list=projects.filter(p=>p.stage===stage);
    col.innerHTML=`<div class="column-head"><span>${stage}</span><span class="column-count">${list.length}</span></div><div class="column-cards"></div>`;
    const wrap=col.querySelector('.column-cards');
    if(!list.length) wrap.innerHTML='<div class="empty">No reviews</div>';
    list.forEach(p=>wrap.appendChild(makeCard(p)));
    board.appendChild(col);
  });
}
function makeCard(p){
  const node=document.getElementById('cardTemplate').content.cloneNode(true);
  const card=node.querySelector('.card');
  node.querySelector('.stage-pill').textContent=p.stage;
  node.querySelector('.card-title').textContent=p.name;
  node.querySelector('.progress').style.width=`${(stageIndex(p.stage)/(STAGES.length-1))*100}%`;
  const voiceCount=p.voiceChunks? p.voiceChunks.split('\n').filter(Boolean).length:0;
  const brollCount=p.broll? p.broll.split('\n').filter(Boolean).length:0;
  const publishReady=[p.youtubeTitle,p.youtubeDescription,p.affiliateUrl].filter(Boolean).length;
  node.querySelector('.card-meta').textContent=`${voiceCount} voice chunks • ${brollCount} B-roll shots • ${publishReady}/3 publish fields`;
  node.querySelector('.edit-btn').onclick=()=>openProject(p.id);
  node.querySelector('.workspace-btn').onclick=()=>openProject(p.id);
  const adv=node.querySelector('.advance-btn');
  adv.textContent=p.stage==='Published'?'Published ✓':'Next Stage';
  adv.disabled=p.stage==='Published'; adv.onclick=()=>advanceProject(p.id);
  card.addEventListener('dblclick',()=>openProject(p.id));
  return node;
}


function openAssetDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(ASSET_DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ASSET_STORE)){const s=db.createObjectStore(ASSET_STORE,{keyPath:'id'});s.createIndex('projectId','projectId');}};
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function saveLocalAsset(projectId,file){
  const db=await openAssetDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ASSET_STORE,'readwrite');
    tx.objectStore(ASSET_STORE).put({id:crypto.randomUUID(),projectId,name:file.name,type:file.type,size:file.size,blob:file,createdAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}
async function getLocalAssets(projectId){
  const db=await openAssetDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ASSET_STORE,'readonly');
    const req=tx.objectStore(ASSET_STORE).index('projectId').getAll(projectId);
    req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error);
  });
}
async function removeLocalAsset(id){
  const db=await openAssetDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ASSET_STORE,'readwrite');
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
}
async function renderAssetGrid(projectId){
  const grid=document.getElementById('assetGrid'); if(!grid) return;
  let assets=[]; try{assets=await getLocalAssets(projectId);}catch{}
  grid.innerHTML='';
  if(!assets.length){grid.innerHTML='<div class="empty">No local assets yet.</div>';return;}
  assets.forEach(a=>{
    const card=document.createElement('div'); card.className='asset-card';
    const url=URL.createObjectURL(a.blob);
    let media='';
    if(a.type.startsWith('video/')) media=`<video src="${url}" controls playsinline preload="metadata"></video>`;
    else if(a.type.startsWith('image/')) media=`<img src="${url}" alt="">`;
    else if(a.type.startsWith('audio/')) media=`<audio src="${url}" controls></audio>`;
    else media='<div class="empty">FILE</div>';
    card.innerHTML=`${media}<button class="asset-remove" aria-label="Remove">×</button><div class="asset-info">${escapeHtml(a.name)} • ${formatBytes(a.size)}</div>`;
    card.querySelector('.asset-remove').onclick=async()=>{await removeLocalAsset(a.id);URL.revokeObjectURL(url);renderAssetGrid(projectId);};
    grid.appendChild(card);
  });
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function renderJobQueue(p){
  const el=document.getElementById('jobQueue'); if(!el) return;
  const jobs=p?.aiJobs||[]; el.innerHTML='';
  if(!jobs.length){el.innerHTML='<div class="empty">No AI jobs queued.</div>';return;}
  [...jobs].reverse().forEach(j=>{
    const row=document.createElement('div');row.className='job-card';
    row.innerHTML=`<div><strong>${escapeHtml(j.command||'Production task')}</strong><small>${new Date(j.createdAt||Date.now()).toLocaleString()}</small></div><span class="job-status">${escapeHtml(j.status||'Queued')}</span>`;
    el.appendChild(row);
  });
}
async function queueAndShareCommand(projectId,command,provider='chatgpt'){
  const p=projects.find(x=>x.id===projectId); if(!p) return;
  const job={id:crypto.randomUUID(),command,provider,status:'Queued',createdAt:new Date().toISOString()};
  p.aiJobs=[...(p.aiJobs||[]),job]; p.updatedAt=new Date().toISOString(); saveProjects(); render(); if(activeProjectId===p.id) renderJobQueue(p);
  const localAssets=await getLocalAssets(projectId).catch(()=>[]);
  const cloud=(p.cloudAssets||[]);
  const prompt=`DON'T BUY IT YET Production Hub command.

Project: ${p.name}
Project ID: ${p.id}
Current stage: ${p.stage}
Command: ${command}

Dropbox project vault:
${p.dropboxFolder||'Not set.'}

Cloud assets you can access:
${cloud.length?cloud.join('\n'):'None added yet.'}

Local-only asset names (these stay on my phone unless I upload/share them):
${localAssets.length?localAssets.map(a=>'- '+a.name).join('\n'):'None.'}

Use all tools available to you to execute the command. You have permission to update my connected GitHub repo Riseofcoyote/dont-buy-it-yet-hub for this production project. When finished, update projects.json for ONLY project ID "${p.id}". Put a concise result/status in assistantOutput, update relevant project fields, set this job ID "${job.id}" to Completed (or Blocked with the reason), and update updatedAt. Do not overwrite unrelated projects. If a finished downloadable artifact is created, include its accessible link/location in assistantOutput or cloudAssets.`;
  try{
    await navigator.clipboard.writeText(prompt);
    window.open(PROVIDER_URLS[provider]||PROVIDER_URLS.chatgpt,'_blank','noopener');
    alert(`Command copied. Paste it into ${provider==='chatgpt'?'ChatGPT':provider==='claude'?'Claude':'Gemini'}.`);
  }catch(err){
    try{
      if(navigator.share) await navigator.share({title:`Production command — ${p.name}`,text:prompt});
      else throw err;
    }catch{}
  }
}
async function syncFromGitHub(){
  const status=document.getElementById('aiSyncStatus'); status.textContent='Syncing finished work…';
  try{
    const res=await fetch('./projects.json?ts='+Date.now(),{cache:'no-store'}); if(!res.ok) throw new Error();
    const data=await res.json(); if(!Array.isArray(data.projects)) throw new Error();
    const byId=new Map(projects.map(p=>[p.id,p]));
    data.projects.forEach(remote=>{const local=byId.get(remote.id);byId.set(remote.id,{...(local||{}),...remote});});
    projects=[...byId.values()]; saveProjects(); render();
    if(activeProjectId){const p=projects.find(x=>x.id===activeProjectId); if(p){document.getElementById('assistantOutput').textContent=p.assistantOutput||'No synced output yet.';renderJobQueue(p);}}
    status.textContent='Synced from ChatGPT/GitHub at '+new Date().toLocaleTimeString();
  }catch{status.textContent='Sync failed. The GitHub Pages build may still be updating.';}
}

render();
syncFromGitHub();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}

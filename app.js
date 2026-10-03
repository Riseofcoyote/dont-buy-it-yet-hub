const STAGES = [
  'Idea','Research','Script','Voice','B-roll','Edit','Ready to Post','Published'
];
const STORAGE_KEY = 'dbiy-production-hub-v1';
let projects = loadProjects();
let activeProjectId = null;
let selectedFinalVideo = null;

const board = document.getElementById('board');
const dialog = document.getElementById('projectDialog');
const form = document.getElementById('projectForm');
const stageSelect = document.getElementById('stageSelect');

stageSelect.innerHTML = STAGES.map(s=>`<option>${s}</option>`).join('');

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

render();
if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}

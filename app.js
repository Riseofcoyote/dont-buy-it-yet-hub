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
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];}catch{return []}
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

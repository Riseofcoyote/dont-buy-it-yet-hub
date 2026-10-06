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
document.getElementById('reloadCurrentCutBtn').addEventListener('click',()=>renderCurrentCut(projects.find(x=>x.id===activeProjectId)));
const HUB_BUILD='hub-build-12 android-zip';
// True on phones/tablets — including Android Chrome in "Desktop site" mode, which removes
// the word "Android" from the user agent but is still a touch-only screen.
function isMobileDevice(){
  const ua=navigator.userAgent||'';
  if(/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|SamsungBrowser/i.test(ua)) return true;
  const uad=navigator.userAgentData;
  if(uad && (uad.mobile || /Android/i.test(uad.platform||''))) return true;
  const mq=q=>!!(window.matchMedia && window.matchMedia(q).matches);
  if((navigator.maxTouchPoints||0)>0 && mq('(pointer: coarse)') && !mq('(any-pointer: fine)')) return true;
  return false;
}
// The ONLY place the Hub may open a system folder picker. Hard-blocked on mobile.
async function pickProjectFolder(){
  if(isMobileDevice()) throw new Error('Folder picker is disabled on mobile. The Hub uses the ZIP download instead.');
  return window.showDirectoryPicker({mode:'readwrite'});
}
document.getElementById('exportFrontstageJobBtn').addEventListener('click',async()=>{
  const p=projects.find(x=>x.id===activeProjectId);
  if(!p){alert('Open a saved review first.');return;}
  let localAssets=await getLocalAssets(p.id).catch(()=>[]);
  const master=localAssets.find(a=>a.role==='narration-master');
  // Never reopen the Android file picker here. Narration is selected only with ROCK VO — MASTER.
  if(!master){alert('ROCK VO — MASTER is not loaded yet. Use the ROCK VO — MASTER picker above, then tap Build Frontstage Project again.');return;}

  const queueJob={id:crypto.randomUUID(),command:'Build Frontstage Project — ROCK VO — MASTER',provider:'frontstage',status:'Building',createdAt:new Date().toISOString()};
  p.aiJobs=[...(p.aiJobs||[]),queueJob]; p.updatedAt=new Date().toISOString(); saveProjects(); renderJobQueue(p);
  const job=makeFrontstageJob(p,localAssets);
  try{
    // One decision, made before anything can open a folder picker. Phones/tablets always get the ZIP.
    const useZip=isMobileDevice() || !('showDirectoryPicker' in window);
    console.info('[DBIY] Build Frontstage Project', HUB_BUILD, useZip?'ZIP path':'folder path', navigator.userAgent);
    if(!useZip){
      const dir=await pickProjectFolder();
      await writeFrontstageProject(dir,p,localAssets,job);
      queueJob.status='Completed';
      p.assistantOutput='Frontstage project built successfully with ROCK VO — MASTER as the narration timeline. Open the selected folder in Frontstage.';
      alert('Frontstage project built with ROCK VO — MASTER. Open this folder in Frontstage.');
    }else{
      // Android/Chrome has no folder picker. Build the exact same Frontstage project folder
      // in memory (original narration MP4/AAC included, untouched) and download it as one .zip.
      const folder=String(p.name||'review').replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')+'-Frontstage';
      const zdir=zipDirectory(folder+'/');
      await writeFrontstageProject(zdir,p,localAssets,job);
      queueJob.status='Packaging'; renderJobQueue(p);
      const zip=await buildZip(zdir.files);
      downloadBlob(folder+'.zip',zip);
      queueJob.status='Ready for Frontstage'; queueJob.path='zip';
      p.assistantOutput='Frontstage project packaged as '+folder+'.zip ('+(zip.size/1048576).toFixed(1)+' MB) with the original ROCK VO — MASTER recording inside. Extract the zip, then open the extracted '+folder+' folder in Frontstage. ['+HUB_BUILD+']';
      alert('Frontstage project downloaded as '+folder+'.zip ('+(zip.size/1048576).toFixed(1)+' MB) with ROCK VO — MASTER inside. Extract it, then open the folder in Frontstage.\n\n['+HUB_BUILD+']');
    }
    p.updatedAt=new Date().toISOString(); saveProjects(); renderJobQueue(p);
    document.getElementById('assistantOutput').textContent=p.assistantOutput;
    if(!useZip) window.open('https://frontstage.studio/','_blank','noopener');
  }catch(err){
    if(err?.name==='AbortError'){queueJob.status='Cancelled';}
    else {console.error(err);queueJob.status='Blocked';p.assistantOutput='Frontstage project creation was blocked: '+(err?.message||'unknown browser error');alert('Frontstage project creation was blocked. Your narration remains saved in the Hub; no project data was deleted.');}
    p.updatedAt=new Date().toISOString();saveProjects();renderJobQueue(p);document.getElementById('assistantOutput').textContent=p.assistantOutput||'';
  }
});

function chooseNarrationMaster(){
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file'; input.accept='audio/*,video/*'; input.style.display='none';
    document.body.appendChild(input);
    let settled=false;
    const finish=file=>{if(settled)return;settled=true;input.remove();resolve(file||null);};
    input.addEventListener('change',()=>finish(input.files?.[0]||null),{once:true});
    window.addEventListener('focus',()=>setTimeout(()=>{if(!settled&&!input.files?.length)finish(null);},800),{once:true});
    input.click();
  });
}

function makeFrontstageJob(p,localAssets){
  return {
    format:'dbiy-frontstage-job',version:2,createdAt:new Date().toISOString(),
    project:{id:p.id,name:p.name,stage:p.stage},
    edit:{voiceoverIsMaster:true,keepSourceAudio:false,target:'1080p MP4',captions:true,
      directions:'Use Rock narration as the master timeline. Tighten mistakes/dead air without flattening comedic pauses. Re-time B-roll to narration. Infomercial/on-camera Rock footage is visual-only unless explicitly approved. Preserve evidence cards and the research-based-review disclaimer.'},
    script:p.voiceChunks||'',brollPlan:p.broll||'',notes:p.notes||'',
    localAssets:localAssets.map(a=>({name:a.name,type:a.type,size:a.size,role:a.role||'asset'})),
    cloudAssets:p.cloudAssets||[]
  };
}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
async function blobCrc32(blob){
  let crc=0xFFFFFFFF; const reader=blob.stream().getReader();
  for(;;){const {done,value}=await reader.read(); if(done) break; for(let i=0;i<value.length;i++) crc=CRC_TABLE[(crc^value[i])&0xFF]^(crc>>>8);}
  return (crc^0xFFFFFFFF)>>>0;
}
function dosDateTime(d){return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}
// Uncompressed (store) ZIP built from Blob parts, so a large narration MP4 is never copied in memory.
async function buildZip(files){
  const enc=new TextEncoder(), parts=[], central=[], {time,date}=dosDateTime(new Date()); let offset=0;
  for(const f of files){
    const name=enc.encode(f.path), size=f.blob.size, crc=await blobCrc32(f.blob);
    if(size>=0xFFFFFFFF||offset+30+name.length+size>=0xFFFFFFFF) throw new Error('Project is too large to package as a zip (4 GB limit).');
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,time,true);lh.setUint16(12,date,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,size,true);lh.setUint32(22,size,true);lh.setUint16(26,name.length,true);lh.setUint16(28,0,true);
    parts.push(lh.buffer,name,f.blob);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,size,true);ch.setUint32(24,size,true);ch.setUint16(28,name.length,true);ch.setUint16(30,0,true);ch.setUint16(32,0,true);
    ch.setUint16(34,0,true);ch.setUint16(36,0,true);ch.setUint32(38,0,true);ch.setUint32(42,offset,true);
    central.push(ch.buffer,name);
    offset+=30+name.length+size;
  }
  const cdSize=central.reduce((n,x)=>n+x.byteLength,0), end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.buffer],{type:'application/zip'});
}
// Stand-in for a folder handle: writeFrontstageProject writes into it exactly as it would a real folder.
function zipDirectory(prefix='',files=[]){
  return {files,
    async getDirectoryHandle(name){return zipDirectory(prefix+name+'/',files);},
    async getFileHandle(name){const path=prefix+name;return {async createWritable(){const chunks=[];return {
      async write(d){chunks.push(d);},
      async close(){const blob=new Blob(chunks),i=files.findIndex(f=>f.path===path);if(i>=0)files[i]={path,blob};else files.push({path,blob});}};}};}
  };
}
function downloadBlob(name,blob){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),120000); // large files need time to save on Android
}
function assetMime(a){
  if(a?.type) return a.type;
  const ext=String(a?.name||'').toLowerCase().split('.').pop();
  return {mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',m4a:'audio/mp4',aac:'audio/aac',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}[ext]||'';
}
function downloadJson(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
async function writeTextFile(dir,name,text){
  const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(text); await w.close();
}
async function writeBlobFile(dir,name,blob){
  const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(blob); await w.close();
}
function safeMediaName(name,i){
  const clean=String(name||('asset-'+i)).replace(/[\\/:*?"<>|]/g,'-').replace(/^\.+/,'').slice(0,120);
  return (String(i+1).padStart(2,'0')+'-'+clean)||('asset-'+i);
}
async function mediaDuration(asset,required=false){
  if(!asset?.blob || !(asset.type||'').match(/^(audio|video)\//)) return 5;
  const v=await new Promise(resolve=>{
    const el=document.createElement((asset.type||'').startsWith('audio/')?'audio':'video');
    const u=URL.createObjectURL(asset.blob); let settled=false;
    const done=x=>{if(settled)return;settled=true;clearTimeout(timer);URL.revokeObjectURL(u);resolve(x);};
    const timer=setTimeout(()=>done(NaN),20000);
    el.preload='metadata'; el.muted=true;
    el.onloadedmetadata=()=>{
      if(Number.isFinite(el.duration)&&el.duration>0) return done(el.duration);
      // Some Android recordings report Infinity until the end of the file is probed.
      el.ondurationchange=()=>{if(Number.isFinite(el.duration)&&el.duration>0) done(el.duration);};
      try{el.currentTime=1e9;}catch{done(NaN);}
    };
    el.onerror=()=>done(NaN);
    el.src=u;
  });
  if(Number.isFinite(v)&&v>0) return v;
  if(required) throw new Error('Could not read the length of '+(asset.name||'the narration file')+'. No project was built. Re-select ROCK VO — MASTER and try again.');
  return 5;
}
function timeToSeconds(s){
  const p=String(s).trim().split(':').map(Number); if(p.some(Number.isNaN)) return 0;
  return p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:p[0];
}
function brollMarkers(plan,fps){
  const out=[]; const re=/(\d{1,2}:\d{2}(?::\d{2})?)\s*[–-]\s*(\d{1,2}:\d{2}(?::\d{2})?|END)\s+([^\n]+)/gi;
  let m; while((m=re.exec(plan||''))){
    const start=Math.round(timeToSeconds(m[1])*fps);
    const end=m[2].toUpperCase()==='END'?start:Math.round(timeToSeconds(m[2])*fps);
    out.push({id:crypto.randomUUID(),name:m[3].split('—')[0].trim().slice(0,60)||'B-roll',startFrame:start,durationFrames:Math.max(0,end-start),comment:m[3].trim(),status:'open'});
  } return out;
}
async function narrationToWav(asset){
  if(!asset?.blob) throw new Error('Narration file is missing.');
  if((asset.type||'').startsWith('audio/wav')) return {blob:asset.blob,name:'ROCK-VO-MASTER.wav',type:'audio/wav'};
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) throw new Error('This browser cannot convert narration audio.');
  const ctx=new AC();
  try{
    const buf=await ctx.decodeAudioData(await asset.blob.arrayBuffer());
    const rate=buf.sampleRate, frames=buf.length, channels=1;
    const out=new ArrayBuffer(44+frames*2), v=new DataView(out);
    const s=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));};
    s(0,'RIFF');v.setUint32(4,36+frames*2,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,frames*2,true);
    const n=buf.numberOfChannels, src=[];for(let ch=0;ch<n;ch++)src.push(buf.getChannelData(ch));
    let o=44;for(let i=0;i<frames;i++){let x=0;for(let ch=0;ch<n;ch++)x+=src[ch][i];x=Math.max(-1,Math.min(1,x/n));v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}
    return {blob:new Blob([out],{type:'audio/wav'}),name:'ROCK-VO-MASTER.wav',type:'audio/wav'};
  } finally {try{await ctx.close();}catch{}}
}

async function writeFrontstageProject(dir,p,assets,job){
  const fps=30, timelineId=crypto.randomUUID(), mediaDir=await dir.getDirectoryHandle('media',{create:true});
  const entries=[], audioClips=[], videoClips=[]; let audioAt=0, visualAt=0;
  for(let i=0;i<assets.length;i++){
    const a={...assets[i],type:assetMime(assets[i])}, sourceType=(a.type||'').startsWith('audio/')?'audio':(a.type||'').startsWith('image/')?'image':(a.type||'').startsWith('video/')?'video':null;
    if(!sourceType) continue;
    const isNarration=a.role==='narration-master';
    let exportAsset=a, exportType=sourceType;
    if(isNarration && sourceType==='video'){
      // Keep the original MP4 intact. Android screen recordings can contain AAC audio
      // that WebAudio decodes incorrectly/silently even though native playback is fine.
      // Mark it as video in media.json; the timeline still uses an audio clip so
      // Frontstage extracts/decodes the embedded AAC itself.
      exportAsset=a; exportType='video';
    }
    const name=safeMediaName(exportAsset.name,i), duration=await mediaDuration(exportAsset,isNarration), id=crypto.randomUUID();
    await writeBlobFile(mediaDir,name,exportAsset.blob);
    entries.push({id,name:isNarration?'ROCK VO — MASTER':(exportAsset.name||name),type:exportType,source:{kind:'project',relativePath:'media/'+name},duration,hasAudio:exportType==='audio'||exportType==='video'});
    const frames=Math.max(1,Math.round(duration*fps));
    const clipType=isNarration?'audio':exportType;
    const clip={id:crypto.randomUUID(),mediaRef:id,mediaType:clipType,sourceClipType:exportType,startFrame:0,durationFrames:frames,trimStartFrame:0,trimEndFrame:0,speed:1,volume:(isNarration||sourceType==='audio')?1:0,fadeInFrames:0,fadeOutFrames:0,fadeInInterpolation:'linear',fadeOutInterpolation:'linear',opacity:1,transform:{centerX:.5,centerY:.5,width:1,height:1,rotation:0,flipHorizontal:false,flipVertical:false},crop:{left:0,top:0,right:0,bottom:0}};
    if(isNarration||sourceType==='audio'){clip.startFrame=audioAt;audioAt+=frames;audioClips.push(clip);}
    else {clip.startFrame=visualAt;visualAt+=frames;videoClips.push(clip);}
  }
  const tracks=[];
  if(videoClips.length) tracks.push({id:crypto.randomUUID(),type:'video',name:'B-roll / visuals',muted:false,hidden:false,syncLocked:true,clips:videoClips});
  if(audioClips.length) tracks.push({id:crypto.randomUUID(),type:'audio',name:'ROCK VO — MASTER',muted:false,hidden:false,syncLocked:true,clips:audioClips});
  const timeline={id:timelineId,name:p.name+' — DBIY Edit',fps,width:1920,height:1080,settingsConfigured:true,tracks,markers:brollMarkers(p.broll,fps)};
  const projectFile={schemaVersion:3,timelines:[timeline],activeTimelineId:timelineId,openTimelineIds:[timelineId],viewStates:{[timelineId]:{playheadFrame:0,zoomScale:1,scrollOffsetX:0}}};
  await writeTextFile(dir,'project.json',JSON.stringify(projectFile,null,2));
  await writeTextFile(dir,'media.json',JSON.stringify({version:2,entries,folders:[]},null,2));
  await writeTextFile(dir,'generation-log.json',JSON.stringify({version:1,entries:[]},null,2));
  await writeTextFile(dir,'DBIY-production-job.json',JSON.stringify(job,null,2));
  await writeTextFile(dir,'README-DBIY.txt','Built by DON’T BUY IT YET Production Hub. Open this folder in Frontstage. ROCK VO — MASTER is the narration timeline. Timeline markers contain the B-roll/edit plan. Source-video audio is muted by default.');
}

document.getElementById('sendProjectCommandBtn').addEventListener('click',async()=>{
  if(!activeProjectId){alert('Save this review first, then send the command.');return;}
  const command=document.getElementById('projectCommand').value.trim();
  if(!command){alert('Enter a project command first.');return;}
  await queueAndShareCommand(activeProjectId,command,selectedProjectProvider);
});
const narrationMasterInput=document.getElementById('narrationMasterInput');
if(narrationMasterInput){
  narrationMasterInput.addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file) return;
    if(!activeProjectId){alert('Open the Roborock review first, then add the narration.');e.target.value='';return;}
    try{
      const existing=await getLocalAssets(activeProjectId).catch(()=>[]);
      for(const a of existing.filter(a=>a.role==='narration-master')) await removeLocalAsset(a.id);
      await saveLocalAsset(activeProjectId,file,'narration-master');
      await renderAssetGrid(activeProjectId);
      alert('ROCK VO — MASTER saved. Now tap Build Frontstage Project.');
    }catch(err){
      console.error(err);
      alert('The narration could not be saved. No project data was changed.');
    }
  });
}

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
  renderCurrentCut(p);
  if(p) renderAssetGrid(p.id); else document.getElementById('assetGrid').innerHTML='<div class="empty">Save the review before adding local assets.</div>';
  selectedFinalVideo=null; finalVideoInput.value='';
  document.getElementById('selectedVideoName').textContent='No video selected.';
  document.getElementById('deleteBtn').style.visibility=p?'visible':'hidden';
  dialog.showModal();
}
function getReviewUrl(p){
  if(!p) return '';
  if(p.reviewUrl) return p.reviewUrl;
  const assets=Array.isArray(p.cloudAssets)?p.cloudAssets:[];
  return assets.find(u=>/share\.descript\.com\/view\//i.test(u)) || '';
}
function renderCurrentCut(p){
  const host=document.getElementById('currentCutPlayer');
  const status=document.getElementById('currentCutStatus');
  const open=document.getElementById('openCurrentCutBtn');
  if(!host||!status||!open) return;
  const url=getReviewUrl(p);
  if(!url){
    status.textContent='NO VIDEO';
    host.innerHTML='<div class="empty">No review video linked yet.</div>';
    open.href='#'; open.style.pointerEvents='none'; open.style.opacity='.5';
    return;
  }
  status.textContent='READY TO WATCH';
  open.href=url; open.style.pointerEvents=''; open.style.opacity='';
  host.innerHTML='';
  const frame=document.createElement('iframe');
  frame.src=url.replace(/share\.descript\.com\/view\//i,'share.descript.com/embed/');
  frame.title=(p?.name||'Current review')+' current cut';
  frame.allow='autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen=true;
  frame.loading='eager';
  host.appendChild(frame);
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
async function saveLocalAsset(projectId,file,role='asset'){
  const db=await openAssetDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ASSET_STORE,'readwrite');
    tx.objectStore(ASSET_STORE).put({id:crypto.randomUUID(),projectId,name:file.name,type:file.type,size:file.size,blob:file,role,createdAt:new Date().toISOString()});
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
    card.innerHTML=`${media}<button class="asset-remove" aria-label="Remove">×</button><div class="asset-info">${a.role==='narration-master'?'🎙️ ROCK VO — MASTER • ':''}${escapeHtml(a.name)} • ${formatBytes(a.size)}</div>`;
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

// --- Simple i18n dictionary ---
const STR = {
  en: { appName:'HazardWatch', language:'Language', reportHazard:'Report Hazard',
        mapView:'Map View (nearby hazards)', useMyLocation:'Use My Location',
        lowRisk:'Low Risk', lowRiskDesc:'Informational updates',
        mediumRisk:'Medium Risk', mediumRiskDesc:'Be cautious',
        highRisk:'High Risk', highRiskDesc:'Avoid the area',
        feed:'Community Feed', refresh:'Refresh',
        home:'Home', map:'Map', feedTab:'Feed', profile:'Profile',
        reportTitle:'Report Hazard', labelTitle:'Title', labelType:'Type', labelDesc:'Description',
        useMapCenter:'Use map center', cancel:'Cancel', submit:'Submit',
        profileTitle:'Profile', username:'Username', close:'Close'
  },
  hi: { appName:'HazardWatch', language:'भाषा', reportHazard:'खतरा रिपोर्ट करें',
        mapView:'मानचित्र दृश्य (नज़दीकी खतरें)', useMyLocation:'मेरी लोकेशन',
        lowRisk:'कम जोखिम', lowRiskDesc:'सूचनात्मक अपडेट',
        mediumRisk:'मध्यम जोखिम', mediumRiskDesc:'सावधानी रखें',
        highRisk:'उच्च जोखिम', highRiskDesc:'क्षेत्र से बचें',
        feed:'कम्युनिटी फ़ीड', refresh:'रीफ़्रेश',
        home:'होम', map:'मैप', feedTab:'फ़ीड', profile:'प्रोफ़ाइल',
        reportTitle:'खतरा रिपोर्ट करें', labelTitle:'शीर्षक', labelType:'प्रकार', labelDesc:'विवरण',
        useMapCenter:'मैप केंद्र उपयोग करें', cancel:'रद्द', submit:'सबमिट',
        profileTitle:'प्रोफ़ाइल', username:'उपयोगकर्ता नाम', close:'बंद करें'
  }
};

// Apply translations
function applyStrings(lang){
  const s = STR[lang]||STR.en;
  const m = new Map([
    ['t_appName', s.appName], ['t_language', s.language], ['t_reportHazard', s.reportHazard],
    ['t_mapView', s.mapView], ['t_useMyLocation', s.useMyLocation],
    ['t_lowRisk', s.lowRisk], ['t_lowRiskDesc', s.lowRiskDesc],
    ['t_mediumRisk', s.mediumRisk], ['t_mediumRiskDesc', s.mediumRiskDesc],
    ['t_highRisk', s.highRisk], ['t_highRiskDesc', s.highRiskDesc],
    ['t_feed', s.feed], ['t_refresh', s.refresh],
    ['t_home', s.home], ['t_map', s.map], ['t_feedTab', s.feedTab], ['t_profile', s.profile],
    ['t_reportTitle', s.reportTitle], ['t_labelTitle', s.labelTitle], ['t_labelType', s.labelType], ['t_labelDesc', s.labelDesc],
    ['t_useMapCenter', s.useMapCenter], ['t_cancel', s.cancel], ['t_submit', s.submit],
    ['t_profileTitle', s.profileTitle], ['t_username', s.username], ['t_close', s.close]
  ]);
  for(const [id,val] of m){ const el=document.getElementById(id); if(el) el.textContent=val; }
}

// --- Global state ---
let hazards = [];      // All hazards: backend + local reports
const markers = [];     // Map markers

// --- Leaflet Map ---
const map = L.map('map').setView([20.5937, 78.9629], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);

const icons = {
  low: L.divIcon({ html:'🟢', className:'text-2xl', iconSize:[24,24] }),
  medium: L.divIcon({ html:'🟠', className:'text-2xl', iconSize:[24,24] }),
  high: L.divIcon({ html:'🔴', className:'text-2xl', iconSize:[24,24] }),
};

// --- Map marker helpers ---
function clearMarkers(){ markers.forEach(m=>map.removeLayer(m)); markers.length=0; }

function updateMarkers(){
  clearMarkers();
  hazards.forEach(h=>{
    const marker = L.marker([h.lat,h.lng],{icon:icons[h.type||h.severity]||icons.low}).addTo(map);
    const popupText = h.title ? `<strong>${h.title}</strong><br/>${h.desc||''}` :
                      `<strong>Severity: ${h.severity?.toUpperCase()}</strong><br/>Reports: ${h.count||1}`;
    marker.bindPopup(popupText);
    markers.push(marker);
  });
}

// --- Render community feed ---
function renderFeed(){
  const feedEl = document.getElementById('feedList');
  feedEl.innerHTML = '';
  hazards.slice(0,30).forEach(h=>{
    const li=document.createElement('li');
    li.className='p-3 hover:bg-slate-50 flex gap-3';
    li.innerHTML=`
      <div class="text-xl">${h.type==='high'||h.severity==='high'?'🔴':h.type==='medium'||h.severity==='medium'?'🟠':'🟢'}</div>
      <div class="flex-1">
        <div class="text-sm font-semibold">${h.title||'Hazard Report'}</div>
        <div class="text-xs text-slate-500">Reports: ${h.count||1}</div>
      </div>
      <div class="text-xs text-slate-400 min-w-[40px] text-right">${h.time||'Now'}</div>
    `;
    feedEl.appendChild(li);
  });
}

// --- Add a new hazard (local report) ---
function addHazard(h){
  hazards.unshift({...h, time:'Now'});
  updateMarkers();
  renderFeed();
}

// --- Fetch backend hotspots ---
async function fetchHotspots(query="flood"){
  try{
    const res=await fetch(`http://127.0.0.1:5000/get-hotspots?q=${query}`);
    if(!res.ok) throw new Error('Failed to fetch hotspots');
    const data=await res.json();
    // Merge backend hazards into global hazards (avoid duplicates)
    data.forEach(h=>{
      hazards.push({...h, time:'Now'});
    });
    updateMarkers();
    renderFeed();
  }catch(err){ console.error(err); alert('Error fetching hotspots'); }
}

// --- Initial load ---
fetchHotspots();
document.getElementById('refreshFeed').addEventListener('click',()=>fetchHotspots());

// --- Geolocation ---
document.getElementById('locateBtn').addEventListener('click',()=>{
  if(!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    map.setView([latitude,longitude],13);
    L.circle([latitude,longitude],{radius:150,color:'#2563eb'}).addTo(map);
  }, err=>alert(err.message));
});

// --- Report modal ---
const reportModal = document.getElementById('reportModal');
document.getElementById('reportBtn').addEventListener('click',()=>reportModal.showModal());
document.getElementById('useHere').addEventListener('click',()=>{
  const c = map.getCenter();
  document.getElementById('rLat').value=c.lat.toFixed(5);
  document.getElementById('rLng').value=c.lng.toFixed(5);
});
reportModal.addEventListener('close',()=>{
  if(reportModal.returnValue!=='cancel'){
    const title=document.getElementById('rTitle').value.trim();
    const type=document.getElementById('rType').value;
    const desc=document.getElementById('rDesc').value.trim()||'—';
    const lat=parseFloat(document.getElementById('rLat').value);
    const lng=parseFloat(document.getElementById('rLng').value);
    const photoInput=document.getElementById('rPhoto');
    const capturedPhoto=document.getElementById('capturedPhoto')?.value||'';
    let photoURL='';
    if(capturedPhoto) photoURL=capturedPhoto;
    else if(photoInput && photoInput.files.length>0) photoURL=URL.createObjectURL(photoInput.files[0]);

    if(!title||Number.isNaN(lat)||Number.isNaN(lng)) return;
    addHazard({title,type,desc,lat,lng,photo:photoURL});

    // Reset form
    document.getElementById('rTitle').value='';
    document.getElementById('rDesc').value='';
    document.getElementById('rLat').value='';
    document.getElementById('rLng').value='';
    document.getElementById('rType').value='low';
    if(photoInput) photoInput.value='';
    if(document.getElementById('capturedPhoto')) document.getElementById('capturedPhoto').value='';
    map.setView([lat,lng],14);
  }
});

// --- Camera & photo ---
const cameraBtn=document.getElementById('openCamera');
const cameraModal=document.getElementById('cameraModal');
const videoEl=document.getElementById('cameraStream');
const captureBtn=document.getElementById('capturePhoto');
const capturedPhotoInput=document.getElementById('capturedPhoto');
let mediaStream;
cameraBtn.addEventListener('click',async()=>{
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({video:true});
    videoEl.srcObject=mediaStream;
    cameraModal.showModal();
    autoFillLocation();
  }catch(err){ alert("Camera not accessible: "+err.message); }
});
captureBtn.addEventListener('click',()=>{
  const canvas=document.createElement('canvas');
  canvas.width=videoEl.videoWidth;
  canvas.height=videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl,0,0);
  capturedPhotoInput.value=canvas.toDataURL('image/png');
  cameraModal.close();
  mediaStream?.getTracks().forEach(t=>t.stop());
});
document.getElementById('rPhoto').addEventListener('change',autoFillLocation);
function autoFillLocation(){
  if(navigator.geolocation) navigator.geolocation.getCurrentPosition(pos=>{
    document.getElementById('rLat').value=pos.coords.latitude.toFixed(5);
    document.getElementById('rLng').value=pos.coords.longitude.toFixed(5);
  });
}

// --- Language switch ---
const langSel=document.getElementById('lang');
langSel.addEventListener('change',()=>applyStrings(langSel.value));
applyStrings(langSel.value);

// --- Profile modal ---
document.getElementById('openProfile').addEventListener('click',()=>document.getElementById('profileModal').showModal());
window.addEventListener("DOMContentLoaded",()=>{
  const data=localStorage.getItem("userProfile");
  const container=document.getElementById("profileInfo");
  if(data && container){
    const user=JSON.parse(data);
    container.innerHTML=`
      <p><strong>Name:</strong> ${user.name}</p>
      <p><strong>Aadhar:</strong> ${user.aadhar}</p>
      <p><strong>District:</strong> ${user.district}</p>
      <p><strong>State:</strong> ${user.state}</p>
      <p><strong>Union Territory:</strong> ${user.ut}</p>
      <p><strong>Coastal Area:</strong> ${user.coastal}</p>
    `;
  } else if(container) container.innerHTML="<p>No profile found. Please login again.</p>";
});

// --- Sentiment modal ---
function openSentimentModal(){const m=document.getElementById('sentimentModal');m.style.display='flex';m.setAttribute('aria-hidden','false');}
function closeSentimentModal(){const m=document.getElementById('sentimentModal');m.style.display='none';m.setAttribute('aria-hidden','true');document.getElementById('sentimentInput').value='';document.getElementById('sentimentResult').innerText='';}
async function analyzeTextSentiment(){
  const text=document.getElementById('sentimentInput').value.trim();
  if(!text){alert('Please enter text'); return;}
  const resultDiv=document.getElementById('sentimentResult');
  resultDiv.innerText='Analyzing...';
  try{
    const response=await fetch('/analyze-sentiment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    if(!response.ok) throw new Error('Server error');
    const data=await response.json();
    resultDiv.innerHTML=`Sentiment: <b>${data.label}</b><br>Confidence: <b>${(data.score*100).toFixed(2)}%</b>`;
  }catch(err){console.error(err); resultDiv.innerText='Error analyzing sentiment';}
}

// --- Bottom nav scroll ---
document.querySelectorAll('nav [data-goto]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const target=document.querySelector(btn.getAttribute('data-goto'));
    if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
  });
});

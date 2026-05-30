/* ============================================================
   NEON SYNTH MODULE — Visuels & interaction
   Étoiles 3D lentes en fond, formes géométriques filaires
   flottantes. Tap = active/coupe une boucle (voir audio.js).
   Chaque émission propage des ondes colorées + pixels.
   ============================================================ */
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W=0,H=0,CX=0,CY=0,DPR=1,FOCAL=0;
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H/2; FOCAL=Math.min(W,H);
  layout();
}
addEventListener('resize', resize);

// ============================================================
//  MODÈLES FILAIRES (sommets + arêtes)
// ============================================================
const M = (verts,edges)=>({verts,edges});
const CUBE=M([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]);
const OCTA=M([[0,1.3,0],[0,-1.3,0],[1.3,0,0],[-1.3,0,0],[0,0,1.3],[0,0,-1.3]],
  [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]]);
const TETRA=M([[0,1.2,0],[-1,-0.8,1],[1,-0.8,1],[0,-0.8,-1.2]],
  [[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]]);
const DIAMOND=M([[0,1.5,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,-1.5,0]],
  [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1],[5,1],[5,2],[5,3],[5,4]]);
const PYRA=M([[-1,-0.7,-1],[1,-0.7,-1],[1,-0.7,1],[-1,-0.7,1],[0,1.2,0]],
  [[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]]);
const PRISM=M([[-1,-1,1],[1,-1,1],[0,1,1],[-1,-1,-1],[1,-1,-1],[0,1,-1]],
  [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]);
// hexagone filaire + rayons
const hx=[]; for(let i=0;i<6;i++){const a=i/6*Math.PI*2; hx.push([Math.cos(a)*1.3,Math.sin(a)*1.3,0]);} hx.push([0,0,0]);
const HEX=M(hx,[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[6,0],[6,2],[6,4]]);
// hexagramme (deux triangles)
const STAR=M([[0,1.4,0],[1.2,-0.7,0],[-1.2,-0.7,0],[0,-1.4,0],[1.2,0.7,0],[-1.2,0.7,0]],
  [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3]]);

// rotations 3D
const rX=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];};
const rY=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];};
const rZ=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];};

// dessine un modèle filaire à (cx,cy) écran, taille en px, rotation [x,y,z]
function drawShape(m, cx, cy, size, rot, color, glow){
  const F=4;
  if (glow){ ctx.shadowColor=color; ctx.shadowBlur=glow; }
  ctx.strokeStyle=color; ctx.lineWidth=glow?2.6:1.8;
  ctx.beginPath();
  const pts=m.verts.map(v=>{
    let p=rX(v,rot[0]); p=rY(p,rot[1]); p=rZ(p,rot[2]);
    const k=F/(F-p[2]*0.6);
    return [cx+p[0]*size*k, cy-p[1]*size*k];
  });
  for(const e of m.edges){ const a=pts[e[0]],b=pts[e[1]]; ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); }
  ctx.stroke();
  ctx.shadowBlur=0;
}

// ============================================================
//  ÉTOILES 3D (fond) — petits pixels avançant lentement
// ============================================================
const MODELS=[CUBE,OCTA,TETRA,DIAMOND,PYRA,PRISM,HEX,STAR];
let stars=[];
function initStars(){
  stars=[];
  const n = Math.min(160, Math.floor(W*H/7000));
  for(let i=0;i<n;i++) stars.push({x:(Math.random()*2-1)*16,y:(Math.random()*2-1)*16,z:Math.random()*40+1});
}

// ============================================================
//  FORMES (instruments) sur plan fixe
// ============================================================
let shapes=[];
function layout(){
  const n = Synth.count();
  const portrait = H>=W;
  const cols = portrait?2:4;
  const rows = Math.ceil(n/cols);
  const padX = W*0.14, padY = H*0.20;
  const cw=(W-padX*2)/cols, ch=(H-padY*2)/rows;
  const size = Math.min(cw,ch)*0.30;
  const instr = Synth.instruments();
  shapes = [];
  for(let i=0;i<n;i++){
    const r=Math.floor(i/cols), c=i%cols;
    const bx = padX + cw*(c+0.5);
    const by = padY + ch*(r+0.5);
    shapes.push({
      idx:i, model:MODELS[i%MODELS.length],
      color:instr[i].color, name:instr[i].name,
      bx, by, cx:bx, cy:by, size,
      hitR:Math.max(size*1.7, 34),
      rot:[Math.random()*6,Math.random()*6,Math.random()*6],
      rv:[(Math.random()-.5)*0.4,0.3+Math.random()*0.4,(Math.random()-.5)*0.3],
      phase:Math.random()*Math.PI*2, fspd:0.5+Math.random()*0.5,
      pulse:0,
    });
  }
}

// ============================================================
//  ONDES + PARTICULES
// ============================================================
let waves=[], parts=[];
function spawnWave(x,y,color,power){
  waves.push({x,y,r:8,maxR:60+power*70,life:1,max:0.7+power*0.2,color,w:2+power*1.5});
  const n=Math.floor(6+power*10);
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=40+Math.random()*120*power;
    parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.4,max:0.9,color,s:1.5+Math.random()*1.5});
  }
}

// ============================================================
//  INTERACTION
// ============================================================
const hint=document.getElementById('hint');
let hintGone=false;
function tap(px,py){
  if(!hintGone){ hintGone=true; if(hint) hint.classList.add('gone'); }
  // forme la plus proche sous le doigt
  let best=null, bd=1e9;
  for(const s of shapes){
    const d=Math.hypot(px-s.cx, py-s.cy);
    if(d<s.hitR && d<bd){ bd=d; best=s; }
  }
  if(best){
    Synth.toggle(best.idx);
    best.pulse=1.2;
    spawnWave(best.cx,best.cy,best.color,1);
  }
}
canvas.addEventListener('pointerdown', e=>{
  const r=canvas.getBoundingClientRect();
  tap(e.clientX-r.left, e.clientY-r.top);
});

// bouton son
const muteBtn=document.getElementById('mute');
muteBtn.addEventListener('click', e=>{
  e.stopPropagation();
  Synth.init();
  const m=Synth.toggleMute();
  muteBtn.textContent=m?'✕':'♪';
  muteBtn.classList.toggle('off',m);
});

// ============================================================
//  BOUCLE
// ============================================================
let last=performance.now();
function frame(now){
  let dt=(now-last)/1000; last=now; if(dt>0.05)dt=0.05;
  const t=now*0.001;

  // --- update ---
  for(const st of stars){
    st.z-=dt*3.2;                       // avancée lente face écran
    if(st.z<0.6){ st.z=40; st.x=(Math.random()*2-1)*16; st.y=(Math.random()*2-1)*16; }
  }
  for(const s of shapes){
    s.rot[0]+=s.rv[0]*dt; s.rot[1]+=s.rv[1]*dt; s.rot[2]+=s.rv[2]*dt;
    s.cx=s.bx+Math.sin(t*s.fspd+s.phase)*6;
    s.cy=s.by+Math.cos(t*s.fspd*0.8+s.phase)*7;
    if(s.pulse>0) s.pulse-=dt*2.2;
  }
  // événements audio -> ondes
  for(const ev of Synth.dueVisuals()){
    const s=shapes[ev.idx]; if(!s) continue;
    s.pulse=Math.max(s.pulse, 0.6+ev.power*0.4);
    spawnWave(s.cx,s.cy,s.color,ev.power);
  }
  for(let i=waves.length-1;i>=0;i--){const w=waves[i]; w.r+=(w.maxR-w.r)*dt*5; w.life-=dt/w.max; if(w.life<=0)waves.splice(i,1);}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life-=dt/p.max; if(p.life<=0)parts.splice(i,1);}

  // --- render ---
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);

  // étoiles
  for(const st of stars){
    const k=FOCAL/st.z;
    const x=CX+st.x*k, y=CY+st.y*k;
    if(x<0||x>W||y<0||y>H) continue;
    const a=Math.min(1, (40-st.z)/40);
    const sz=Math.max(1, k*0.012);
    ctx.fillStyle=`rgba(150,255,210,${0.15+a*0.6})`;
    ctx.fillRect(x,y,sz,sz);
  }

  // ondes (derrière les formes)
  for(const w of waves){
    ctx.globalAlpha=Math.max(0,w.life)*0.7;
    ctx.strokeStyle=w.color; ctx.lineWidth=w.w;
    ctx.shadowColor=w.color; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(w.x,w.y,w.r,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w.x,w.y,w.r*0.6,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
  }
  ctx.globalAlpha=1;

  // formes
  for(const s of shapes){
    const on=Synth.isActive(s.idx);
    const sc=s.size*(1+s.pulse*0.18);
    const col = on ? s.color : dim(s.color, 0.5);
    drawShape(s.model, s.cx, s.cy, sc, s.rot, col, on?(14+s.pulse*16):0);
    // anneau de sélection si actif
    if(on){
      ctx.globalAlpha=0.5+s.pulse*0.4;
      ctx.strokeStyle=s.color; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(s.cx,s.cy,s.size*2.0,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1;
    }
  }

  // particules (pixels fins) au-dessus
  for(const p of parts){
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.color;
    ctx.fillRect(p.x,p.y,p.s,p.s);
  }
  ctx.globalAlpha=1;

  requestAnimationFrame(frame);
}

// éclaircit/assombrit une couleur hex
function dim(hex, f){
  const n=parseInt(hex.slice(1),16);
  const r=Math.round(((n>>16)&255)*f), g=Math.round(((n>>8)&255)*f), b=Math.round((n&255)*f);
  return `rgb(${r},${g},${b})`;
}

resize();
initStars();
requestAnimationFrame(frame);

})();

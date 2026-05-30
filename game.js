/* ============================================================
   NEON SYNTH MODULE — Visuels & interaction
   Carrousel de 5 planches × 8 formes (40 instruments).
   Tap = active/coupe une boucle. Glisse = change de planche.
   Les boucles actives continuent même sur les autres planches.
   ============================================================ */
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W=0,H=0,CX=0,CY=0,DPR=1,FOCAL=0;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*DPR); canvas.height=Math.floor(H*DPR);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  CX=W/2; CY=H/2; FOCAL=Math.min(W,H);
  layout();
}
addEventListener('resize', resize);

// ============================================================
//  MODÈLES FILAIRES (pool varié)
// ============================================================
const M=(verts,edges)=>({verts,edges});
const ngon=(n,r,z)=>{const a=[];for(let i=0;i<n;i++){const t=i/n*Math.PI*2;a.push([Math.cos(t)*r,Math.sin(t)*r,z]);}return a;};
function ringModel(n){const v=ngon(n,1.3,0);v.push([0,0,0]);const e=[];for(let i=0;i<n;i++){e.push([i,(i+1)%n]);e.push([n,i]);}return M(v,e);}
function bipyr(n){const v=ngon(n,1.15,0);const top=n,bot=n+1;v.push([0,1.5,0]);v.push([0,-1.5,0]);const e=[];for(let i=0;i<n;i++){e.push([i,(i+1)%n]);e.push([top,i]);e.push([bot,i]);}return M(v,e);}
function prismN(n){const top=ngon(n,1.05,1),bo=ngon(n,1.05,-1);const v=top.concat(bo);const e=[];for(let i=0;i<n;i++){e.push([i,(i+1)%n]);e.push([n+i,n+(i+1)%n]);e.push([i,n+i]);}return M(v,e);}
function antiprism(n){const top=ngon(n,1.05,1);const bo=[];for(let i=0;i<n;i++){const t=(i+0.5)/n*Math.PI*2;bo.push([Math.cos(t)*1.05,Math.sin(t)*1.05,-1]);}const v=top.concat(bo);const e=[];for(let i=0;i<n;i++){e.push([i,(i+1)%n]);e.push([n+i,n+(i+1)%n]);e.push([i,n+i]);e.push([i,n+((i-1+n)%n)]);}return M(v,e);}
function jack(){return M([[1.4,0,0],[-1.4,0,0],[0,1.4,0],[0,-1.4,0],[0,0,1.4],[0,0,-1.4],[0,0,0]],[[6,0],[6,1],[6,2],[6,3],[6,4],[6,5]]);}

const CUBE=M([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]);
const OCTA=bipyr(4);
const TETRA=M([[0,1.2,0],[-1,-0.8,1],[1,-0.8,1],[0,-0.8,-1.2]],[[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]]);
const DIAMOND=bipyr(6);
const PYRA=M([[-1,-0.7,-1],[1,-0.7,-1],[1,-0.7,1],[-1,-0.7,1],[0,1.2,0]],[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]]);
const PRISM=prismN(3);
const HEX=ringModel(6);
const STAR=M([[0,1.4,0],[1.2,-0.7,0],[-1.2,-0.7,0],[0,-1.4,0],[1.2,0.7,0],[-1.2,0.7,0]],[[0,1],[1,2],[2,0],[3,4],[4,5],[5,3]]);

const POOL=[CUBE,OCTA,TETRA,DIAMOND,PYRA,PRISM,HEX,STAR,
            bipyr(5),prismN(6),prismN(5),antiprism(4),antiprism(3),ringModel(8),jack(),bipyr(3)];

// rotations 3D
const rX=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0],p[1]*c-p[2]*s,p[1]*s+p[2]*c];};
const rY=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];};
const rZ=(p,a)=>{const c=Math.cos(a),s=Math.sin(a);return[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];};

function drawShape(m,cx,cy,size,rot,color,glow){
  const F=4;
  if(glow){ctx.shadowColor=color;ctx.shadowBlur=glow;}
  ctx.strokeStyle=color; ctx.lineWidth=glow?2.6:1.8;
  ctx.beginPath();
  const pts=m.verts.map(v=>{let p=rX(v,rot[0]);p=rY(p,rot[1]);p=rZ(p,rot[2]);const k=F/(F-p[2]*0.6);return[cx+p[0]*size*k,cy-p[1]*size*k];});
  for(const e of m.edges){const a=pts[e[0]],b=pts[e[1]];ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
  ctx.stroke(); ctx.shadowBlur=0;
}

// ============================================================
//  ÉTOILES 3D
// ============================================================
let stars=[];
function initStars(){
  stars=[];
  const n=Math.min(160,Math.floor(W*H/7000));
  for(let i=0;i<n;i++) stars.push({x:(Math.random()*2-1)*16,y:(Math.random()*2-1)*16,z:Math.random()*40+1});
}

// ============================================================
//  FORMES (40, réparties en planches)
// ============================================================
const NS=Synth.slideCount(), PS=Synth.perSlide();
let shapes=[];
function layout(){
  const portrait=H>=W;
  const cols=portrait?2:4, rows=Math.ceil(PS/cols);
  const padX=W*0.16, padY=H*0.20;
  const cw=(W-padX*2)/cols, ch=(H-padY*2)/rows;
  const size=Math.min(cw,ch)*0.30;
  const instr=Synth.instruments();
  shapes=[];
  for(let s=0;s<NS;s++){
    for(let i=0;i<PS;i++){
      const g=s*PS+i, r=Math.floor(i/cols), c=i%cols;
      shapes.push({
        idx:g, slide:s,
        model:POOL[(i + s*3) % POOL.length],
        color:instr[g].color, role:instr[g].role,
        gx:padX+cw*(c+0.5), gy:padY+ch*(r+0.5),
        cx:0, cy:0, size, hitR:Math.max(size*1.7,34),
        rot:[Math.random()*6,Math.random()*6,Math.random()*6],
        rv:[(Math.random()-.5)*0.4,0.3+Math.random()*0.4,(Math.random()-.5)*0.3],
        phase:Math.random()*Math.PI*2, fspd:0.5+Math.random()*0.5, pulse:0,
      });
    }
  }
}

// ============================================================
//  CARROUSEL
// ============================================================
let curSlide=0, animPos=0, dragging=false, dragStart=0;
let downX=0, downY=0, pId=null, moved=false;

// ============================================================
//  ONDES + PARTICULES
// ============================================================
let waves=[], parts=[];
function spawnWave(x,y,color,power){
  waves.push({x,y,r:8,maxR:60+power*70,life:1,max:0.7+power*0.2,color,w:2+power*1.5});
  const n=Math.floor(6+power*10);
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=40+Math.random()*120*power;
    parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.4,max:0.9,color,s:1.5+Math.random()*1.5});}
}

// ============================================================
//  INTERACTION (tap vs glisse)
// ============================================================
const hint=document.getElementById('hint');
let hintGone=false;
function killHint(){ if(!hintGone){hintGone=true; if(hint) hint.classList.add('gone');} }

function tapAt(px,py){
  killHint();
  let best=null,bd=1e9;
  for(const s of shapes){
    if(s.slide!==curSlide) continue;
    const d=Math.hypot(px-s.cx,py-s.cy);
    if(d<s.hitR && d<bd){bd=d;best=s;}
  }
  if(best){ Synth.toggle(best.idx); best.pulse=1.2; spawnWave(best.cx,best.cy,best.color,1); }
}

canvas.addEventListener('pointerdown',e=>{
  const r=canvas.getBoundingClientRect();
  downX=e.clientX-r.left; downY=e.clientY-r.top;
  pId=e.pointerId; moved=false; dragging=false; dragStart=curSlide;
  try{canvas.setPointerCapture(pId);}catch(_){}
});
canvas.addEventListener('pointermove',e=>{
  if(pId===null||e.pointerId!==pId) return;
  const r=canvas.getBoundingClientRect();
  const x=e.clientX-r.left, y=e.clientY-r.top;
  const dx=x-downX, dy=y-downY;
  if(!dragging && Math.abs(dx)>12 && Math.abs(dx)>Math.abs(dy)){ dragging=true; killHint(); }
  if(dragging){
    e.preventDefault();
    animPos=Math.max(-0.18,Math.min(NS-1+0.18, dragStart - dx/W));
    moved=true;
  } else if(Math.abs(dx)>14||Math.abs(dy)>14){ moved=true; }
});
function endPointer(e){
  if(pId===null) return;
  const r=canvas.getBoundingClientRect();
  const x=(e.clientX||0)-r.left;
  const dx=x-downX;
  if(dragging){
    if(dx<-W*0.16) curSlide=Math.min(NS-1,curSlide+1);
    else if(dx>W*0.16) curSlide=Math.max(0,curSlide-1);
  } else if(!moved){
    tapAt(downX,downY);
  }
  dragging=false; pId=null;
}
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',()=>{dragging=false;pId=null;});

// flèches clavier (desktop)
addEventListener('keydown',e=>{
  if(e.key==='ArrowRight') curSlide=Math.min(NS-1,curSlide+1);
  if(e.key==='ArrowLeft')  curSlide=Math.max(0,curSlide-1);
});

// bouton son
const muteBtn=document.getElementById('mute');
muteBtn.addEventListener('click',e=>{
  e.stopPropagation(); Synth.init();
  const m=Synth.toggleMute(); muteBtn.textContent=m?'✕':'♪'; muteBtn.classList.toggle('off',m);
});

// ============================================================
//  BOUCLE
// ============================================================
let last=performance.now();
function frame(now){
  let dt=(now-last)/1000; last=now; if(dt>0.05)dt=0.05;
  const t=now*0.001;

  if(!dragging) animPos += (curSlide-animPos)*Math.min(1,dt*9);

  // update
  for(const st of stars){ st.z-=dt*3.2; if(st.z<0.6){st.z=40;st.x=(Math.random()*2-1)*16;st.y=(Math.random()*2-1)*16;} }
  for(const s of shapes){
    s.rot[0]+=s.rv[0]*dt; s.rot[1]+=s.rv[1]*dt; s.rot[2]+=s.rv[2]*dt;
    s.cx=s.gx+(s.slide-animPos)*W+Math.sin(t*s.fspd+s.phase)*6;
    s.cy=s.gy+Math.cos(t*s.fspd*0.8+s.phase)*7;
    if(s.pulse>0) s.pulse-=dt*2.2;
  }
  for(const ev of Synth.dueVisuals()){
    const s=shapes[ev.idx]; if(!s) continue;
    s.pulse=Math.max(s.pulse,0.6+ev.power*0.4);
    if(Math.abs(s.slide-animPos)<1.1) spawnWave(s.cx,s.cy,s.color,ev.power);
  }
  for(let i=waves.length-1;i>=0;i--){const w=waves[i];w.r+=(w.maxR-w.r)*dt*5;w.life-=dt/w.max;if(w.life<=0)waves.splice(i,1);}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=0.92;p.vy*=0.92;p.life-=dt/p.max;if(p.life<=0)parts.splice(i,1);}

  // render
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);

  for(const st of stars){
    const k=FOCAL/st.z, x=CX+st.x*k, y=CY+st.y*k;
    if(x<0||x>W||y<0||y>H) continue;
    const a=Math.min(1,(40-st.z)/40), sz=Math.max(1,k*0.012);
    ctx.fillStyle=`rgba(150,255,210,${0.15+a*0.6})`; ctx.fillRect(x,y,sz,sz);
  }

  for(const w of waves){
    ctx.globalAlpha=Math.max(0,w.life)*0.7; ctx.strokeStyle=w.color; ctx.lineWidth=w.w;
    ctx.shadowColor=w.color; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(w.x,w.y,w.r,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w.x,w.y,w.r*0.6,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
  }
  ctx.globalAlpha=1;

  for(const s of shapes){
    if(s.cx<-s.size*4||s.cx>W+s.size*4) continue;   // cull hors écran
    const on=Synth.isActive(s.idx), sc=s.size*(1+s.pulse*0.18);
    const col=on?s.color:dim(s.color,0.5);
    drawShape(s.model,s.cx,s.cy,sc,s.rot,col,on?(14+s.pulse*16):0);
    if(on){
      ctx.globalAlpha=0.5+s.pulse*0.4; ctx.strokeStyle=s.color; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(s.cx,s.cy,s.size*2.0,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
    }
  }

  for(const p of parts){ ctx.globalAlpha=Math.max(0,p.life); ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.s,p.s); }
  ctx.globalAlpha=1;

  drawHUD();
  requestAnimationFrame(frame);
}

// nom de planche + points de navigation + compteur
function drawHUD(){
  const si=Math.round(Math.min(NS-1,Math.max(0,animPos)));
  // nom de planche (haut centre)
  ctx.textAlign='center';
  ctx.fillStyle=Synth.slideAccent(si);
  ctx.shadowColor=Synth.slideAccent(si); ctx.shadowBlur=10;
  ctx.font=`bold ${Math.min(W*0.05,22)}px "Courier New",monospace`;
  ctx.fillText(`${si+1}/${NS}  ${Synth.slideName(si)}`, CX, Math.max(56, H*0.085));
  ctx.shadowBlur=0;

  // points de navigation (bas)
  const n=NS, gap=22, y=H-44-cssSafeBottom();
  const x0=CX-(n-1)*gap/2;
  for(let i=0;i<n;i++){
    const onv=(i===si);
    ctx.beginPath(); ctx.arc(x0+i*gap,y,onv?5:3,0,Math.PI*2);
    ctx.fillStyle=onv?Synth.slideAccent(i):'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  // compteur de boucles actives
  const ac=Synth.activeCount();
  if(ac>0){
    ctx.textAlign='left'; ctx.font=`12px "Courier New",monospace`;
    ctx.fillStyle='rgba(0,255,102,0.7)';
    ctx.fillText(`▶ ${ac} LOOP${ac>1?'S':''}`, 16, H-16-cssSafeBottom());
  }
}
function cssSafeBottom(){ return 8; }

function dim(hex,f){
  const n=parseInt(hex.slice(1),16);
  const r=Math.round(((n>>16)&255)*f),g=Math.round(((n>>8)&255)*f),b=Math.round((n&255)*f);
  return `rgb(${r},${g},${b})`;
}

resize();
initStars();
requestAnimationFrame(frame);

})();

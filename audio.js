/* ============================================================
   NEON SYNTH MODULE — Moteur audio (Web Audio API)
   Carrousel de 5 planches × 8 formes = 40 instruments,
   chacun indépendant mais calé sur une horloge commune.
   5 "kits" sonores distincts (timbres / octaves / patterns).
   Aucun fichier audio : tout est synthétisé en temps réel.
   ============================================================ */
const Synth = (() => {
'use strict';

let ctx=null, master=null, leadBus=null, delay=null, delayWet=null;
let muted=false, running=false, schedTimer=null;

// --- transport ---
const BPM = 104;
const STEPS = 16;                 // 16 doubles-croches = 8 temps
const STEP_DUR = 60 / BPM / 2;
const LOOKAHEAD = 0.12;
let globalStep = 0, nextTime = 0;
const visualQ = [];

const f = n => 440 * Math.pow(2, n/12);

// progression d'accords commune (Am - F - C - G)
const CH = [
  { tones:[0,3,7],   bass:-24 },
  { tones:[-4,0,3],  bass:-28 },
  { tones:[3,7,10],  bass:-21 },
  { tones:[-2,2,5],  bass:-26 },
];
const seg = s => CH[Math.floor(s/4) % 4];

function init(){
  if (ctx){ if (ctx.state==='suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
  master.connect(ctx.destination);

  delay = ctx.createDelay(1.0);
  delay.delayTime.value = STEP_DUR * 1.5;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  delayWet = ctx.createGain(); delayWet.gain.value = 0.28;
  delay.connect(fb); fb.connect(delay);
  delay.connect(delayWet); delayWet.connect(master);

  leadBus = ctx.createGain(); leadBus.gain.value = 1;
  leadBus.connect(master);
  leadBus.connect(delay);

  unlock();
}
function unlock(){
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  try { const b=ctx.createBuffer(1,1,ctx.sampleRate); const s=ctx.createBufferSource();
        s.buffer=b; s.connect(ctx.destination); s.start(0); } catch(e){}
}

// ---- briques de synthèse ----
function pluck(freq,t,dur,type,peak,dest,glide){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide,t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(dest||master);
  o.start(t); o.stop(t+dur+0.02);
}
function pad(freqs,t,dur,peak,dest,wave){
  freqs.forEach((fr,i)=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=wave||'sawtooth'; o.frequency.value=fr*(i===0?1:1.005);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1400;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(peak,t+dur*0.4);
    g.gain.linearRampToValueAtTime(0.0001,t+dur);
    o.connect(lp); lp.connect(g); g.connect(dest||master);
    o.start(t); o.stop(t+dur+0.05);
  });
}
function noise(t,dur,hp,peak,dest){
  const n=ctx.createBufferSource();
  const buf=ctx.createBuffer(1,Math.max(1,ctx.sampleRate*dur),ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let k=0;k<d.length;k++) d[k]=(Math.random()*2-1)*(1-k/d.length);
  n.buffer=buf;
  const flt=ctx.createBiquadFilter(); flt.type='highpass'; flt.frequency.value=hp;
  const g=ctx.createGain(); g.gain.setValueAtTime(peak,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  n.connect(flt); flt.connect(g); g.connect(dest||master);
  n.start(t); n.stop(t+dur);
}
function kick(t,pitch){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(pitch,t);
  o.frequency.exponentialRampToValueAtTime(pitch*0.32,t+0.14);
  g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.24);
}

// ============================================================
//  KITS — 5 planches sonores
// ============================================================
const ODD=[1,3,5,7,9,11,13,15], ALL=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      EVEN=[0,2,4,6,8,10,12,14], SPARSE=[2,6,10,14];

const SLIDES = [
  // 0 — ORIGIN (vert)
  { name:'ORIGIN', accent:'#00ff66',
    colors:['#00ff66','#7cff00','#00ffaa','#39ff14','#aaff00','#00e676','#5cff9d','#b6ff00'],
    oct:0, kickPitch:150, snHp:1400, hatHp:8000,
    bassWave:'square', arpWave:'square', leadWave:'triangle', padWave:'sawtooth', stabWave:'square', bassGlide:false,
    kickS:[0,4,8,12], snareS:[2,6,10,14], hatS:ODD, arpS:ALL, leadS:[0,3,6,8,11,14], stabS:[3,7,11,15] },

  // 1 — ICE (cyan, aigu, cristallin)
  { name:'ICE', accent:'#36e0ff',
    colors:['#36e0ff','#00d0ff','#7fdbff','#00bfff','#67e8ff','#a0f0ff','#3ad1ff','#9bd6ff'],
    oct:12, kickPitch:175, snHp:2200, hatHp:9500,
    bassWave:'triangle', arpWave:'triangle', leadWave:'sine', padWave:'triangle', stabWave:'triangle', bassGlide:false,
    kickS:[0,8], snareS:[6,14], hatS:ALL, arpS:EVEN, leadS:[0,4,8,12], stabS:[7,15] },

  // 2 — ACID (magenta, saw mordant)
  { name:'ACID', accent:'#ff00e6',
    colors:['#ff00e6','#cc33ff','#ff3df0','#b14bff','#ff5ad6','#e040fb','#d36bff','#ff79f2'],
    oct:0, kickPitch:140, snHp:1200, hatHp:7000,
    bassWave:'sawtooth', arpWave:'sawtooth', leadWave:'sawtooth', padWave:'sawtooth', stabWave:'sawtooth', bassGlide:true,
    kickS:[0,3,6,8,11,14], snareS:[4,12], hatS:ODD, arpS:ALL, leadS:[2,6,10,14], stabS:[0,8] },

  // 3 — SUNSET (chaud, doux)
  { name:'SUNSET', accent:'#ff8a2b',
    colors:['#ff8a2b','#ff3d7f','#ffb03a','#ff5e3a','#ff7b54','#ffd23a','#ff6f61','#ffa54f'],
    oct:0, kickPitch:160, snHp:1600, hatHp:8500,
    bassWave:'square', arpWave:'triangle', leadWave:'triangle', padWave:'sawtooth', stabWave:'triangle', bassGlide:false,
    kickS:[0,4,8,12], snareS:[6,14], hatS:EVEN, arpS:EVEN, leadS:[0,5,10], stabS:[3,11] },

  // 4 — DEEP (violet, sub, sombre)
  { name:'DEEP', accent:'#8c7bff',
    colors:['#8c7bff','#6a5cff','#a78bfa','#5b6bff','#9d7bff','#7c5cff','#b39bff','#6f7bff'],
    oct:-12, kickPitch:120, snHp:1000, hatHp:6500,
    bassWave:'sine', arpWave:'triangle', leadWave:'sine', padWave:'sawtooth', stabWave:'square', bassGlide:false,
    kickS:[0,8], snareS:[12], hatS:SPARSE, arpS:[0,4,8,12], leadS:[8], stabS:[] },
];

// construit les 8 instruments d'un kit
function buildKit(cfg){
  const O = cfg.oct;
  return [
    { role:'KICK',  color:cfg.colors[0], trig:(s,t)=>{ if(cfg.kickS.includes(s)){ kick(t,cfg.kickPitch); return 1.4;} return 0; } },
    { role:'SNARE', color:cfg.colors[1], trig:(s,t)=>{ if(cfg.snareS.includes(s)){ noise(t,0.18,cfg.snHp,0.5,master); pluck(190,t,0.12,'triangle',0.25,master); return 1.0;} return 0; } },
    { role:'HAT',   color:cfg.colors[2], trig:(s,t)=>{ if(cfg.hatS.includes(s)){ noise(t,0.05,cfg.hatHp,0.16,master); return 0.5;} return 0; } },
    { role:'BASS',  color:cfg.colors[3], trig:(s,t)=>{ if(s%2===0){ const c=seg(s); const n=(s%4===0?c.bass:c.bass+12)+O; pluck(f(n),t,STEP_DUR*1.4,cfg.bassWave,0.42,master, cfg.bassGlide?f(n)*0.5:0); return 0.9;} return 0; } },
    { role:'ARP',   color:cfg.colors[4], trig:(s,t)=>{ if(cfg.arpS.includes(s)){ const c=seg(s); const n=c.tones[s%c.tones.length]+12+O; pluck(f(n),t,STEP_DUR*0.9,cfg.arpWave,0.16,leadBus); return 0.6;} return 0; } },
    { role:'LEAD',  color:cfg.colors[5], trig:(s,t)=>{ if(cfg.leadS.includes(s)){ const c=seg(s); const n=c.tones[c.tones.length-1]+12+O; pluck(f(n),t,STEP_DUR*1.6,cfg.leadWave,0.3,leadBus); return 0.8;} return 0; } },
    { role:'PAD',   color:cfg.colors[6], trig:(s,t)=>{ if(s%4===0){ const c=seg(s); pad(c.tones.map(n=>f(n+O)),t,STEP_DUR*4.4,0.12,master,cfg.padWave); return 1.1;} return 0; } },
    { role:'STAB',  color:cfg.colors[7], trig:(s,t)=>{ if(cfg.stabS.includes(s)){ const c=seg(s); c.tones.forEach(n=>pluck(f(n+12+O),t,STEP_DUR*0.7,cfg.stabWave,0.12,leadBus)); return 0.9;} return 0; } },
  ];
}

const INSTR = [];
SLIDES.forEach(cfg => buildKit(cfg).forEach(inst => INSTR.push(inst)));
const PER_SLIDE = 8;
const active = INSTR.map(()=>false);

// ---- planification ----
function scheduleStep(gStep, time){
  const s = gStep % STEPS;
  for (let i=0;i<INSTR.length;i++){
    if (!active[i]) continue;
    const power = INSTR[i].trig(s, time);
    if (power>0) visualQ.push({ time, idx:i, power });
  }
}
function scheduler(){
  while (nextTime < ctx.currentTime + LOOKAHEAD){
    scheduleStep(globalStep, nextTime);
    nextTime += STEP_DUR; globalStep++;
  }
}
function start(){
  init();
  if (!ctx || running) return;
  running = true; globalStep = 0; nextTime = ctx.currentTime + 0.06;
  scheduler(); schedTimer = setInterval(scheduler, 25);
}

// ---- API ----
function toggle(i){ init(); start(); active[i] = !active[i]; return active[i]; }
function isActive(i){ return active[i]; }
function instruments(){ return INSTR; }
function count(){ return INSTR.length; }
function slideCount(){ return SLIDES.length; }
function perSlide(){ return PER_SLIDE; }
function slideName(i){ return SLIDES[i] ? SLIDES[i].name : ''; }
function slideAccent(i){ return SLIDES[i] ? SLIDES[i].accent : '#00ff66'; }
function activeCount(){ return active.reduce((a,b)=>a+(b?1:0),0); }
function stopAll(){ for(let i=0;i<active.length;i++) active[i]=false; }

function dueVisuals(){
  if (!ctx) return [];
  const now=ctx.currentTime, out=[];
  while (visualQ.length && visualQ[0].time <= now) out.push(visualQ.shift());
  return out;
}
function toggleMute(){ muted=!muted; if(master) master.gain.value=muted?0:0.85; return muted; }
function isMuted(){ return muted; }

return { init, start, toggle, isActive, instruments, count, slideCount, perSlide,
         slideName, slideAccent, activeCount, stopAll, dueVisuals, toggleMute, isMuted };
})();

/* ============================================================
   NEON SYNTH MODULE — Moteur audio (Web Audio API)
   Carrousel de 5 planches × 8 voix = 40 instruments.
   Chaque planche a SA gamme, SA progression et SES mélodies
   → ambiances radicalement différentes, mais calées sur la
   même horloge (tempo réglable). Tout synthétisé en direct.
   ============================================================ */
const Synth = (() => {
'use strict';

let ctx=null, master=null, leadBus=null, delay=null, delayWet=null;
let muted=false, running=false, schedTimer=null;

// --- transport (tempo réglable) ---
let bpm = 104;
const STEPS = 16;                 // 16 doubles-croches = 8 temps
let stepDur = 60 / bpm / 2;
const LOOKAHEAD = 0.12;
let globalStep = 0, nextTime = 0;
const visualQ = [];

// fréquence depuis demi-tons (La4 = 440)
const f = st => 440 * Math.pow(2, st/12);

// nom de note -> demi-tons depuis La4 (ex: 'A4'=0, 'C5'=3, 'Bb3'=-11)
const SEMI = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
function n(name){
  const m=/^([A-G][#b]?)(-?\d)$/.exec(name);
  if(!m) return 0;
  const midi = 12*(parseInt(m[2],10)+1) + SEMI[m[1]];
  return midi - 69;
}
// "A4 . C5 ." -> [0,null,3,null]
const seq = str => str.trim().split(/\s+/).map(t => t==='.'?null:n(t));

function init(){
  if (ctx){ if (ctx.state==='suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
  master.connect(ctx.destination);

  delay = ctx.createDelay(1.0);
  delay.delayTime.value = stepDur * 1.5;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  delayWet = ctx.createGain(); delayWet.gain.value = 0.3;
  delay.connect(fb); fb.connect(delay);
  delay.connect(delayWet); delayWet.connect(master);

  leadBus = ctx.createGain(); leadBus.gain.value = 1;
  leadBus.connect(master); leadBus.connect(delay);

  unlock();
}
function unlock(){
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  try { const b=ctx.createBuffer(1,1,ctx.sampleRate); const s=ctx.createBufferSource();
        s.buffer=b; s.connect(ctx.destination); s.start(0); } catch(e){}
}

// ============================================================
//  BRIQUES DE SYNTHÈSE
// ============================================================
function note(freq,t,o){
  const osc=ctx.createOscillator(), g=ctx.createGain();
  osc.type=o.wave||'square';
  const dest=(o.dest==='lead'&&leadBus)?leadBus:master;
  let head=g;
  if(o.lp){ const lp=ctx.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.setValueAtTime(o.lp,t);
    if(o.lpEnv) lp.frequency.exponentialRampToValueAtTime(Math.max(80,o.lp*0.22),t+o.dur);
    osc.connect(lp); lp.connect(g); }
  else osc.connect(g);
  if(o.porta && o.last) { osc.frequency.setValueAtTime(o.last,t); osc.frequency.exponentialRampToValueAtTime(freq,t+0.05); }
  else osc.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(o.peak,t+(o.atk||0.008));
  g.gain.exponentialRampToValueAtTime(0.0001,t+o.dur);
  g.connect(dest);
  osc.start(t); osc.stop(t+o.dur+0.04);
}
function pad(freqs,t,dur,peak,wave){
  freqs.forEach((fr,i)=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=wave||'sawtooth'; o.frequency.value=fr*(i===0?1:1.006);
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1500;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(peak,t+dur*0.4);
    g.gain.linearRampToValueAtTime(0.0001,t+dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t+dur+0.05);
  });
}
function noise(t,dur,hp,peak){
  const src=ctx.createBufferSource();
  const buf=ctx.createBuffer(1,Math.max(1,ctx.sampleRate*dur),ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let k=0;k<d.length;k++) d[k]=(Math.random()*2-1)*(1-k/d.length);
  src.buffer=buf;
  const flt=ctx.createBiquadFilter(); flt.type='highpass'; flt.frequency.value=hp;
  const g=ctx.createGain(); g.gain.setValueAtTime(peak,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(t); src.stop(t+dur);
}
function kick(t,pitch){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(pitch,t);
  o.frequency.exponentialRampToValueAtTime(pitch*0.3,t+0.14);
  g.gain.setValueAtTime(0.95,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.24);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.26);
}
function tom(t,pitch){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(pitch,t);
  o.frequency.exponentialRampToValueAtTime(pitch*0.5,t+0.3);
  g.gain.setValueAtTime(0.7,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.36);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.4);
}

// ============================================================
//  DISPATCH DES VOIX -> trig(localStep, time) -> puissance
// ============================================================
const has=(arr,s)=>arr.indexOf(s)>=0;
function makeTrig(v){
  if(v.k==='drum'){
    return (s,t)=>{ if(!has(v.steps,s)) return 0;
      if(v.d==='kick'){ kick(t,v.pitch||150); return v.p||1.4; }
      if(v.d==='tom'){ tom(t,v.pitch||90); return v.p||1.3; }
      if(v.d==='snare'){ noise(t,0.18,v.hp||1500,0.5); note(190,t,{wave:'triangle',peak:0.22,dur:0.12}); return v.p||1.0; }
      if(v.d==='hat'){ noise(t,v.dur||0.05,v.hp||8000,v.gain||0.16); return v.p||0.5; }
      if(v.d==='noise'){ noise(t,v.dur||0.4,v.hp||500,v.gain||0.4); return v.p||1.0; }
      return 0; };
  }
  if(v.k==='seq'){
    return (s,t)=>{ const sm=v.notes[s]; if(sm==null) return 0;
      const fr=f(sm+(v.oct||0));
      note(fr,t,{wave:v.wave,peak:v.peak,dur:v.dur,dest:v.dest,atk:v.atk,lp:v.lp,lpEnv:v.lpEnv,porta:v.porta,last:v._last});
      v._last=fr; return v.p||0.7; };
  }
  if(v.k==='chord'){
    return (s,t)=>{ if(!has(v.steps,s)) return 0;
      const ch=v.prog[Math.floor(s/4)%v.prog.length];
      if(v.env==='pad') pad(ch.map(x=>f(x+(v.oct||0))),t,v.dur,v.peak,v.wave);
      else ch.forEach(x=>note(f(x+12+(v.oct||0)),t,{wave:v.wave,peak:v.peak,dur:v.dur,dest:v.dest||'lead'}));
      return v.p||1.0; };
  }
  return ()=>0;
}

// ============================================================
//  LES 5 PLANCHES — gammes / progressions / mélodies distinctes
// ============================================================
const ODD=[1,3,5,7,9,11,13,15], BEATS=[0,2,4,6,8,10,12,14], DOWN=[0,4,8,12], HALF=[0,8];

// progressions (demi-tons depuis La4)
const P_ORIGIN=[[0,3,7],[-4,0,3],[3,7,10],[-2,2,5]];          // Am F C G
const P_ICE   =[[0,3,7,14],[3,7,10,14],[-4,0,3,7],[-2,2,5,7]]; // Am9 Cmaj7 Fmaj7 G6
const P_ACID  =[[0,3,7],[0,3,7],[0,3,7],[0,3,7]];              // drone Am
const P_SUN   =[[3,7,10,14],[0,3,7,10],[5,8,12,15],[-2,2,5,8]];// Cmaj7 Am7 Dm7 G7
const P_DEEP  =[[0,3,7],[1,5,8],[0,3,7],[-2,1,5]];             // Am Bb Am Gm (phrygien)

const SLIDES = [
  // ============ 0 · ORIGIN — chiptune entraînant (La mineur) ============
  { name:'ORIGIN', accent:'#00ff66', voices:[
    {role:'KICK', color:'#00ff66', k:'drum', d:'kick',  steps:DOWN, pitch:150},
    {role:'SNARE',color:'#7cff00', k:'drum', d:'snare', steps:[4,12]},
    {role:'HAT',  color:'#00ffaa', k:'drum', d:'hat',   steps:ODD, hp:8000},
    {role:'BASS', color:'#39ff14', k:'seq', wave:'square',  peak:0.42, dur:0.3, notes:seq('A2 . A2 . F2 . F2 . C3 . C3 . G2 . G2 .')},
    {role:'ARP',  color:'#aaff00', k:'seq', wave:'square',  peak:0.16, dur:0.18, dest:'lead', notes:seq('A4 C5 E5 C5 F4 A4 C5 A4 C5 E5 G5 E5 G4 B4 D5 B4')},
    {role:'LEAD', color:'#00e676', k:'seq', wave:'triangle',peak:0.3,  dur:0.5, dest:'lead', notes:seq('E5 . . A5 . . G5 . . F5 . . E5 . . .')},
    {role:'PAD',  color:'#5cff9d', k:'chord', env:'pad', prog:P_ORIGIN, steps:DOWN, wave:'sawtooth', peak:0.12, dur:2.2},
    {role:'STAB', color:'#b6ff00', k:'chord', env:'stab',prog:P_ORIGIN, steps:[3,7,11,15], wave:'square', peak:0.1, dur:0.25},
  ]},

  // ============ 1 · ICE — ambiant cristallin, sans batterie ============
  { name:'ICE', accent:'#36e0ff', voices:[
    {role:'BELL', color:'#36e0ff', k:'seq', wave:'sine', peak:0.22, dur:1.0, dest:'lead', notes:seq('E6 . B5 . A5 . . E6 . B5 . . A5 . . .')},
    {role:'SHIMMER',color:'#00d0ff',k:'seq',wave:'triangle',peak:0.12,dur:0.3,dest:'lead', notes:seq('A5 B5 C6 E6 B5 C6 E6 A6 G5 A5 C6 E6 A5 B5 C6 E6')},
    {role:'TICK', color:'#7fdbff', k:'drum', d:'hat', steps:ODD, hp:11000, gain:0.06},
    {role:'SUB',  color:'#00bfff', k:'seq', wave:'sine', peak:0.3, dur:2.0, lp:600, notes:seq('A2 . . . . . . . F2 . . . . . . .')},
    {role:'PAD',  color:'#67e8ff', k:'chord', env:'pad', prog:P_ICE, steps:HALF, wave:'triangle', peak:0.13, dur:3.2},
    {role:'LEAD', color:'#a0f0ff', k:'seq', wave:'sine', peak:0.22, dur:1.2, dest:'lead', notes:seq('C6 . . . B5 . . . A5 . . . G5 . . .')},
    {role:'HARP', color:'#3ad1ff', k:'seq', wave:'triangle', peak:0.18, dur:0.6, dest:'lead', notes:seq('E6 C6 A5 G5 E5 . . . D6 B5 A5 G5 E5 . . .')},
    {role:'GLOW', color:'#9bd6ff', k:'chord', env:'stab', prog:P_ICE, steps:[4,12], wave:'sine', peak:0.08, dur:0.8, dest:'lead'},
  ]},

  // ============ 2 · ACID — techno acide, basse 303 ============
  { name:'ACID', accent:'#ff00e6', voices:[
    {role:'KICK', color:'#ff00e6', k:'drum', d:'kick', steps:BEATS, pitch:140},
    {role:'CLAP', color:'#cc33ff', k:'drum', d:'snare',steps:[4,12], hp:1200},
    {role:'OHAT', color:'#ff3df0', k:'drum', d:'hat',  steps:ODD, hp:7000, gain:0.2},
    {role:'303',  color:'#b14bff', k:'seq', wave:'sawtooth', peak:0.5, dur:0.16, porta:true, lp:900, lpEnv:true, notes:seq('A1 A1 A2 A1 C2 A1 E2 A1 A1 A1 A2 G1 A1 A1 A2 E2')},
    {role:'ACID', color:'#ff5ad6', k:'seq', wave:'sawtooth', peak:0.22, dur:0.2, dest:'lead', lp:2200, notes:seq('A4 . C5 . A4 . E5 . A4 . C5 . D5 . C5 .')},
    {role:'ZAP',  color:'#e040fb', k:'seq', wave:'square', peak:0.14, dur:0.12, dest:'lead', notes:seq('. A5 . A5 . . A5 . . A5 . A5 . . A5 .')},
    {role:'RUMBLE',color:'#d36bff',k:'chord', env:'pad', prog:P_ACID, steps:HALF, wave:'sawtooth', peak:0.1, dur:2.4, oct:-12},
    {role:'SWEEP',color:'#ff79f2', k:'drum', d:'noise', steps:HALF, dur:0.6, hp:300, gain:0.3},
  ]},

  // ============ 3 · SUNSET — lo-fi chaud, jazzy (Do majeur) ============
  { name:'SUNSET', accent:'#ff8a2b', voices:[
    {role:'KICK', color:'#ff8a2b', k:'drum', d:'kick', steps:HALF, pitch:150},
    {role:'RIM',  color:'#ff3d7f', k:'drum', d:'snare',steps:[6,14], hp:1900},
    {role:'SHAKE',color:'#ffb03a', k:'drum', d:'hat',  steps:BEATS, hp:9000, gain:0.08},
    {role:'BASS', color:'#ff5e3a', k:'seq', wave:'triangle', peak:0.4, dur:0.32, notes:seq('F2 . A2 . E2 . G2 . D2 . F2 . G2 . B2 .')},
    {role:'RHODES',color:'#ff7b54',k:'chord', env:'stab', prog:P_SUN, steps:DOWN, wave:'triangle', peak:0.13, dur:0.6, dest:'lead'},
    {role:'MELO', color:'#ffd23a', k:'seq', wave:'triangle', peak:0.24, dur:0.4, dest:'lead', notes:seq('G4 . A4 C5 . A4 G4 . E4 . G4 . A4 . . .')},
    {role:'PAD',  color:'#ff6f61', k:'chord', env:'pad', prog:P_SUN, steps:HALF, wave:'sawtooth', peak:0.1, dur:2.6},
    {role:'BELL', color:'#ffa54f', k:'seq', wave:'sine', peak:0.18, dur:1.0, dest:'lead', notes:seq('C6 . . . . . . . A5 . . . . . . .')},
  ]},

  // ============ 4 · DEEP — drone cinématique sombre (phrygien) ============
  { name:'DEEP', accent:'#8c7bff', voices:[
    {role:'DKICK',color:'#8c7bff', k:'drum', d:'tom', steps:HALF, pitch:78},
    {role:'IMPACT',color:'#6a5cff',k:'drum', d:'noise', steps:[0], dur:0.9, hp:180, gain:0.45},
    {role:'TICK', color:'#a78bfa', k:'drum', d:'hat', steps:[6,14], hp:6500, gain:0.1},
    {role:'SUB',  color:'#5b6bff', k:'seq', wave:'sine', peak:0.4, dur:2.2, lp:500, notes:seq('A1 . . . . . . . A1 . . . . . . .')},
    {role:'PAD',  color:'#9d7bff', k:'chord', env:'pad', prog:P_DEEP, steps:DOWN, wave:'sawtooth', peak:0.11, dur:2.4, oct:-12},
    {role:'MELO', color:'#7c5cff', k:'seq', wave:'triangle', peak:0.22, dur:1.0, dest:'lead', notes:seq('A3 . . . Bb3 . . . A3 . . . G3 . . .')},
    {role:'FIFTH',color:'#b39bff', k:'seq', wave:'sine', peak:0.26, dur:2.0, notes:seq('E2 . . . . . . . E2 . . . . . . .')},
    {role:'SPARK',color:'#6f7bff', k:'seq', wave:'sine', peak:0.16, dur:0.8, dest:'lead', notes:seq('. . . . . . . . . . . . E6 . . .')},
  ]},
];

// ---- aplatissement -> 40 instruments ----
const INSTR=[]; const PER_SLIDE=8;
SLIDES.forEach(sl=>sl.voices.forEach(v=>INSTR.push({color:v.color, role:v.role, trig:makeTrig(v)})));
const active = INSTR.map(()=>false);

// ============================================================
//  TRANSPORT
// ============================================================
function scheduleStep(gStep, time){
  const s=gStep%STEPS;
  for(let i=0;i<INSTR.length;i++){ if(!active[i]) continue;
    const power=INSTR[i].trig(s,time);
    if(power>0) visualQ.push({time,idx:i,power}); }
}
function scheduler(){
  while(nextTime < ctx.currentTime + LOOKAHEAD){
    scheduleStep(globalStep,nextTime);
    nextTime += stepDur; globalStep++;
  }
}
function start(){
  init();
  if(!ctx||running) return;
  running=true; globalStep=0; nextTime=ctx.currentTime+0.06;
  scheduler(); schedTimer=setInterval(scheduler,25);
}

// ---- API ----
function toggle(i){ init(); start(); active[i]=!active[i]; return active[i]; }
function isActive(i){ return active[i]; }
function instruments(){ return INSTR; }
function count(){ return INSTR.length; }
function slideCount(){ return SLIDES.length; }
function perSlide(){ return PER_SLIDE; }
function slideName(i){ return SLIDES[i]?SLIDES[i].name:''; }
function slideAccent(i){ return SLIDES[i]?SLIDES[i].accent:'#00ff66'; }
function activeCount(){ return active.reduce((a,b)=>a+(b?1:0),0); }
function stopAll(){ for(let i=0;i<active.length;i++) active[i]=false; }
function setBPM(b){ bpm=Math.max(50,Math.min(180,b|0)); stepDur=60/bpm/2; if(delay) delay.delayTime.value=stepDur*1.5; }
function getBPM(){ return bpm; }
function dueVisuals(){ if(!ctx) return []; const now=ctx.currentTime,o=[]; while(visualQ.length&&visualQ[0].time<=now) o.push(visualQ.shift()); return o; }
function toggleMute(){ muted=!muted; if(master) master.gain.value=muted?0:0.85; return muted; }
function isMuted(){ return muted; }

return { init, start, toggle, isActive, instruments, count, slideCount, perSlide,
         slideName, slideAccent, activeCount, stopAll, setBPM, getBPM,
         dueVisuals, toggleMute, isMuted };
})();

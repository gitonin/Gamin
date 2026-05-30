/* ============================================================
   NEON SYNTH MODULE — Moteur audio (Web Audio API)
   Séquenceur synchronisé : plusieurs instruments chiptune
   bouclent ensemble sur 8 temps. Chacun s'active/coupe
   indépendamment et reste calé sur l'horloge commune.
   Aucun fichier audio : tout est synthétisé en temps réel.
   ============================================================ */
const Synth = (() => {
'use strict';

let ctx=null, master=null, leadBus=null, delay=null, delayWet=null;
let muted=false, running=false, schedTimer=null;

// --- transport ---
const BPM = 104;
const STEPS = 16;                 // 16 doubles-croches = 8 temps
const STEP_DUR = 60 / BPM / 2;    // durée d'une croche
const LOOKAHEAD = 0.12;
let globalStep = 0, nextTime = 0;

// file d'événements visuels { time, idx, power }
const visualQ = [];

// fréquence : n demi-tons depuis La4 (440 Hz)
const f = n => 440 * Math.pow(2, n/12);

// progression d'accords (Am - F - C - G), 1 accord / 2 temps (4 pas)
const CH = [
  { tones:[0,3,7],   bass:-24 },  // Am
  { tones:[-4,0,3],  bass:-28 },  // F
  { tones:[3,7,10],  bass:-21 },  // C
  { tones:[-2,2,5],  bass:-26 },  // G
];
const seg = s => CH[Math.floor(s/4) % 4];

function init(){
  if (ctx){ if (ctx.state==='suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
  master.connect(ctx.destination);

  // bus delay (espace pour les leads)
  delay = ctx.createDelay(1.0);
  delay.delayTime.value = STEP_DUR * 1.5;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  delayWet = ctx.createGain(); delayWet.gain.value = 0.28;
  delay.connect(fb); fb.connect(delay);
  delay.connect(delayWet); delayWet.connect(master);

  leadBus = ctx.createGain(); leadBus.gain.value = 1;
  leadBus.connect(master);
  leadBus.connect(delay);

  unlock();   // déverrouille l'audio mobile (iOS démarre en 'suspended')
}

// Déverrouillage autoplay : resume() + court buffer silencieux,
// le tout dans le geste tactile qui appelle init().
function unlock(){
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch(e){}
}

// ---- briques de synthèse ----
function pluck(freq, t, dur, type, peak, dest, glide){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide,t+dur);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(dest||master);
  o.start(t); o.stop(t+dur+0.02);
}
function pad(freqs, t, dur, peak, dest){
  freqs.forEach((fr,i)=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='sawtooth';
    o.frequency.value = fr * (i===0?1:1.005);   // léger détune = chaleur
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1400;
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(peak,t+dur*0.4);     // attaque lente
    g.gain.linearRampToValueAtTime(0.0001,t+dur);       // release long
    o.connect(lp); lp.connect(g); g.connect(dest||master);
    o.start(t); o.stop(t+dur+0.05);
  });
}
function noise(t, dur, hp, peak, dest){
  const n=ctx.createBufferSource();
  const buf=ctx.createBuffer(1, Math.max(1,ctx.sampleRate*dur), ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let k=0;k<d.length;k++) d[k]=(Math.random()*2-1)*(1-k/d.length);
  n.buffer=buf;
  const flt=ctx.createBiquadFilter(); flt.type='highpass'; flt.frequency.value=hp;
  const g=ctx.createGain();
  g.gain.setValueAtTime(peak,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  n.connect(flt); flt.connect(g); g.connect(dest||master);
  n.start(t); n.stop(t+dur);
}

// ============================================================
//  INSTRUMENTS — trigger(localStep, time) -> puissance visuelle (0 = rien)
// ============================================================
const INSTR = [
  // 0 — KICK (beat)
  { name:'KICK', color:'#ff8a2b',
    trig:(s,t)=>{ if([0,4,8,12].includes(s)){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.setValueAtTime(150,t);
      o.frequency.exponentialRampToValueAtTime(48,t+0.14);
      g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
      o.connect(g); g.connect(master); o.start(t); o.stop(t+0.24);
      return 1.4; } return 0; } },

  // 1 — SNARE (beat, contretemps)
  { name:'SNARE', color:'#ff3d7f',
    trig:(s,t)=>{ if([2,6,10,14].includes(s)){
      noise(t,0.18,1400,0.5,master);
      pluck(190,t,0.12,'triangle',0.25,master);
      return 1.0; } return 0; } },

  // 2 — HIHAT (beat, croches off)
  { name:'HAT', color:'#bdfff0',
    trig:(s,t)=>{ if(s%2===1){ noise(t,0.05,8000,0.18,master); return 0.5; } return 0; } },

  // 3 — BASS
  { name:'BASS', color:'#c44bff',
    trig:(s,t)=>{ if(s%2===0){
      const c=seg(s); const n=(s%4===0)?c.bass:c.bass+12;
      pluck(f(n),t,STEP_DUR*1.4,'square',0.42,master);
      return 0.9; } return 0; } },

  // 4 — ARP chiptune (signature verte)
  { name:'ARP', color:'#00ff66',
    trig:(s,t)=>{ const c=seg(s); const n=c.tones[s % c.tones.length]+12;
      pluck(f(n),t,STEP_DUR*0.9,'square',0.16,leadBus); return 0.6; } },

  // 5 — PLUCK lead
  { name:'LEAD', color:'#36e0ff',
    trig:(s,t)=>{ if([0,3,6,8,11,14].includes(s)){
      const c=seg(s); const n=c.tones[c.tones.length-1]+12;
      pluck(f(n),t,STEP_DUR*1.6,'triangle',0.3,leadBus); return 0.8; } return 0; } },

  // 6 — PAD / nappe synthétique
  { name:'PAD', color:'#8c7bff',
    trig:(s,t)=>{ if(s%4===0){
      const c=seg(s); pad(c.tones.map(n=>f(n)), t, STEP_DUR*4.4, 0.12, master);
      return 1.1; } return 0; } },

  // 7 — STAB chiptune (accents)
  { name:'STAB', color:'#ffe23d',
    trig:(s,t)=>{ if([3,7,11,15].includes(s)){
      const c=seg(s); c.tones.forEach(n=>pluck(f(n+12),t,STEP_DUR*0.7,'square',0.12,leadBus));
      return 0.9; } return 0; } },
];

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
    nextTime += STEP_DUR;
    globalStep++;
  }
}

function start(){
  init();
  if (!ctx || running) return;
  running = true;
  globalStep = 0;
  nextTime = ctx.currentTime + 0.06;
  scheduler();
  schedTimer = setInterval(scheduler, 25);
}

// ---- API ----
function toggle(i){
  init(); start();
  active[i] = !active[i];
  return active[i];
}
function isActive(i){ return active[i]; }
function instruments(){ return INSTR; }
function count(){ return INSTR.length; }

// renvoie + retire les événements visuels dont l'heure est passée
function dueVisuals(){
  if (!ctx) return [];
  const now = ctx.currentTime, out=[];
  while (visualQ.length && visualQ[0].time <= now) out.push(visualQ.shift());
  return out;
}
function toggleMute(){ muted=!muted; if(master) master.gain.value = muted?0:0.85; return muted; }
function isMuted(){ return muted; }

return { init, start, toggle, isActive, instruments, count, dueVisuals, toggleMute, isMuted };
})();

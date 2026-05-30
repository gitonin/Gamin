/* ============================================================
   NEON WIREFRONT — Moteur audio chiptune (Web Audio API)
   Musique + bruitages générés en temps réel. Aucun fichier.
   ============================================================ */
const Chip = (() => {
'use strict';

let ctx = null, master = null, musicGain = null, sfxGain = null;
let muted = false, started = false;

// --- séquenceur ---
let schedTimer = null;
let nextNoteTime = 0;
let step = 0;
const BPM = 150;
const STEP = 60 / BPM / 4;        // durée d'une double-croche
const LOOKAHEAD = 0.1;            // fenêtre de planification (s)

// fréquence d'une note : n demi-tons depuis La4 (440 Hz)
const f = n => 440 * Math.pow(2, n / 12);

// Progression d'accords (vi-IV-I-V en La mineur) — 1 accord / mesure
// chaque accord : [basse, tons de l'arpège...] en demi-tons depuis La4
const BARS = [
  { bass:-24, chord:[0, 3, 7, 12] },   // Am
  { bass:-28, chord:[-4, 0, 3, 8] },   // F
  { bass:-21, chord:[3, 7, 10, 15] },  // C
  { bass:-26, chord:[-2, 2, 5, 10] },  // G
];
// motif de l'arpège (index dans chord) sur 16 double-croches
const ARP = [0, 2, 1, 3, 2, 1, 0, 2, 3, 1, 2, 0, 1, 3, 2, 1];

function init(){
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();    master.gain.value = muted ? 0 : 0.9;
  musicGain = ctx.createGain();  musicGain.gain.value = 0.35;
  sfxGain = ctx.createGain();    sfxGain.gain.value = 0.6;
  musicGain.connect(master);
  sfxGain.connect(master);
  master.connect(ctx.destination);
}

// --- brique : note d'oscillateur enveloppée ---
function blip(freq, t, dur, type, gain, dest, glideTo){
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

// --- planification d'un pas de séquence ---
function scheduleStep(s, t){
  const bar = Math.floor(s / 16) % BARS.length;
  const i = s % 16;
  const { bass, chord } = BARS[bar];

  // basse sur les temps (toutes les 4 doubles-croches)
  if (i % 4 === 0){
    blip(f(bass), t, STEP * 3.4, 'triangle', 0.5, musicGain);
  }
  // lead arpège (croches)
  if (i % 2 === 0){
    let note = chord[ARP[i] % chord.length];
    if (i % 8 === 0) note += 12;     // accent une octave au-dessus
    blip(f(note), t, STEP * 1.6, 'square', 0.22, musicGain);
  }
  // charley bruité léger sur les contretemps
  if (i % 2 === 1){
    hat(t, 0.06);
  }
}

// charley : bruit blanc court filtré passe-haut
function hat(t, dur){
  const n = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  n.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(hp); hp.connect(g); g.connect(musicGain);
  n.start(t); n.stop(t + dur);
}

function scheduler(){
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD){
    scheduleStep(step, nextNoteTime);
    nextNoteTime += STEP;
    step++;
  }
}

function startMusic(){
  init();
  if (!ctx || started) return;
  started = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.05;
  scheduler();
  schedTimer = setInterval(scheduler, 25);
}
function stopMusic(){
  if (schedTimer){ clearInterval(schedTimer); schedTimer = null; }
  started = false;
}

// ===== Bruitages =====
function shoot(){
  if (!ctx) return;
  blip(880, ctx.currentTime, 0.09, 'square', 0.25, sfxGain, 1500);
}
function explosion(){
  if (!ctx) return;
  const t = ctx.currentTime, dur = 0.32;
  const n = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
  n.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(lp); lp.connect(g); g.connect(sfxGain);
  n.start(t); n.stop(t + dur);
}
function hit(){
  if (!ctx) return;
  blip(300, ctx.currentTime, 0.3, 'sawtooth', 0.5, sfxGain, 70);
}
function uiStart(){
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 4, 7, 12].forEach((n, k) =>
    blip(f(n), t + k * 0.06, 0.12, 'square', 0.3, sfxGain));
}

function toggleMute(){
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  return muted;
}
function isMuted(){ return muted; }

return { init, startMusic, stopMusic, shoot, explosion, hit, uiStart, toggleMute, isMuted };
})();

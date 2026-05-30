/* ============================================================
   NEON WIREFRONT
   Shoot'em up 3D filaire — style Tron old school
   Moteur wireframe maison, Canvas 2D, optimisé mobile.
   ============================================================ */
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- Dimensions / écran haute densité ----
let W = 0, H = 0, CX = 0, CY = 0, FOCAL = 0, DPR = 1;
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  CX = W / 2;
  CY = H / 2;
  FOCAL = Math.min(W, H) * 1.15;   // distance focale → champ de vision
}
window.addEventListener('resize', resize);
resize();

const NEON = '#00ff66';

// ---- Projection perspective : (x,y,z monde) -> écran ----
// Caméra à l'origine, regarde vers +z. z>0 visible.
function project(x, y, z){
  if (z <= 0.1) return null;
  const s = FOCAL / z;
  return { x: CX + x * s, y: CY - y * s, s };
}

// ============================================================
//  MODÈLES FILAIRES (sommets + arêtes)
// ============================================================
function model(verts, edges){ return { verts, edges }; }

// Vaisseau du joueur (flèche / chasseur)
const SHIP = model(
  [
    [ 0.0,  0.0,  1.6],  // nez
    [-1.0, -0.3, -1.0],  // aile G arrière
    [ 1.0, -0.3, -1.0],  // aile D arrière
    [ 0.0,  0.5, -0.7],  // dérsale haute
    [ 0.0, -0.2, -0.4],  // ventre
    [-0.35,0.0, -1.0],   // tuyère G
    [ 0.35,0.0, -1.0],   // tuyère D
  ],
  [[0,1],[0,2],[0,3],[0,4],[1,2],[1,4],[2,4],[3,5],[3,6],[1,5],[2,6],[5,6]]
);

// Formes géométriques ennemies variées
const CUBE = model(
  [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
  [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
);
const TETRA = model(
  [[0,1.2,0],[-1,-0.8,1],[1,-0.8,1],[0,-0.8,-1.2]],
  [[0,1],[0,2],[0,3],[1,2],[2,3],[3,1]]
);
const OCTA = model(
  [[0,1.3,0],[0,-1.3,0],[1.3,0,0],[-1.3,0,0],[0,0,1.3],[0,0,-1.3]],
  [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]]
);
const PYRA = model(
  [[-1,-0.7,-1],[1,-0.7,-1],[1,-0.7,1],[-1,-0.7,1],[0,1.2,0]],
  [[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]]
);
const DIAMOND = model(
  [[0,1.5,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,-1.5,0]],
  [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1],[5,1],[5,2],[5,3],[5,4]]
);
const PRISM = model(
  [[-1,-1,1],[1,-1,1],[0,1,1],[-1,-1,-1],[1,-1,-1],[0,1,-1]],
  [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]]
);
const ENEMY_MODELS = [CUBE, TETRA, OCTA, PYRA, DIAMOND, PRISM];

// ---- Rotations 3D ----
function rotY(p, a){ const c=Math.cos(a),s=Math.sin(a); return [p[0]*c+p[2]*s, p[1], -p[0]*s+p[2]*c]; }
function rotX(p, a){ const c=Math.cos(a),s=Math.sin(a); return [p[0], p[1]*c-p[2]*s, p[1]*s+p[2]*c]; }
function rotZ(p, a){ const c=Math.cos(a),s=Math.sin(a); return [p[0]*c-p[1]*s, p[0]*s+p[1]*c, p[2]]; }

// Dessine un modèle filaire transformé (échelle, rotation, position)
function drawModel(m, pos, scale, rot, color, lineW){
  const pts = m.verts.map(v => {
    let p = [v[0]*scale, v[1]*scale, v[2]*scale];
    p = rotX(p, rot[0]); p = rotY(p, rot[1]); p = rotZ(p, rot[2]);
    return project(p[0]+pos[0], p[1]+pos[1], p[2]+pos[2]);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW || 2;
  ctx.beginPath();
  for (const e of m.edges){
    const a = pts[e[0]], b = pts[e[1]];
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

// ============================================================
//  ÉTAT DU JEU
// ============================================================
const STATE = { HOME:'home', PLAY:'play', OVER:'over' };
let state = STATE.HOME;

const game = {
  score:0, lives:3,
  playerX:0, playerVX:0,
  scroll:0, speed:26,
  enemies:[], bullets:[], particles:[], stars:[],
  spawnT:0, spawnEvery:0.85,
  fireT:0, fireRate:0.18,
  homeRot:0,
  shake:0,
  flash:0,
};
const PLAYER_Z = 3.2;     // plan du joueur (proche caméra)
const PLAYER_Y = -2.2;    // légèrement vers le bas
const X_LIMIT  = 7;       // bornes latérales
const FAR_Z    = 70;      // apparition des ennemis

// Champ d'étoiles (espace minimal)
function initStars(){
  game.stars = [];
  for (let i=0;i<70;i++){
    game.stars.push({ x:(Math.random()*2-1)*14, y:(Math.random()*2-1)*9, z:Math.random()*FAR_Z+2 });
  }
}
initStars();

// ============================================================
//  ENTRÉES TACTILES + CLAVIER
// ============================================================
const input = { left:false, right:false, fire:false };

function bindHold(id, prop){
  const el = document.getElementById(id);
  const on  = e => { e.preventDefault(); input[prop] = true; };
  const off = e => { e.preventDefault(); input[prop] = false; };
  el.addEventListener('touchstart', on,  {passive:false});
  el.addEventListener('touchend',   off, {passive:false});
  el.addEventListener('touchcancel',off, {passive:false});
  el.addEventListener('mousedown',  on);
  el.addEventListener('mouseup',    off);
  el.addEventListener('mouseleave', off);
}
bindHold('left','left');
bindHold('right','right');
bindHold('fire','fire');

// Clavier (test desktop)
addEventListener('keydown', e=>{
  if(e.key==='ArrowLeft')  input.left=true;
  if(e.key==='ArrowRight') input.right=true;
  if(e.key===' '||e.key==='ArrowUp'){ input.fire=true; e.preventDefault(); }
});
addEventListener('keyup', e=>{
  if(e.key==='ArrowLeft')  input.left=false;
  if(e.key==='ArrowRight') input.right=false;
  if(e.key===' '||e.key==='ArrowUp') input.fire=false;
});

// Tap sur le canvas en accueil = START
canvas.addEventListener('pointerdown', () => { if(state===STATE.HOME) startGame(); });

// Boutons écrans
document.getElementById('retry').addEventListener('click', startGame);

// Bouton son (mute / unmute)
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', e=>{
  e.stopPropagation();
  Chip.init();
  const m = Chip.toggleMute();
  muteBtn.textContent = m ? '✕' : '♪';
  muteBtn.classList.toggle('off', m);
});

// ============================================================
//  GESTION DES ÉCRANS
// ============================================================
const hud      = document.getElementById('hud');
const controls = document.getElementById('controls');
const overGO   = document.getElementById('gameover');

function startGame(){
  Chip.init();
  Chip.uiStart();
  Chip.startMusic();
  state = STATE.PLAY;
  game.score=0; game.lives=3;
  game.playerX=0; game.playerVX=0;
  game.enemies.length=0; game.bullets.length=0; game.particles.length=0;
  game.spawnT=0; game.fireT=0; game.scroll=0;
  game.spawnEvery=0.85; game.speed=26;
  game.shake=0; game.flash=0;
  initStars();
  hud.classList.remove('hidden');
  controls.classList.remove('hidden');
  overGO.classList.add('hidden');
  updateHUD();
}

function gameOver(){
  Chip.stopMusic();
  state = STATE.OVER;
  hud.classList.add('hidden');
  controls.classList.add('hidden');
  document.getElementById('finalScore').textContent = 'SCORE ' + game.score;
  overGO.classList.remove('hidden');
}

function updateHUD(){
  document.getElementById('score').textContent = 'SCORE ' + game.score;
  document.getElementById('lives').textContent = '♥'.repeat(Math.max(0,game.lives)) || '—';
}

// ============================================================
//  TIRS / EXPLOSIONS
// ============================================================
function fire(){
  game.bullets.push({ x:game.playerX, y:PLAYER_Y+0.2, z:PLAYER_Z+1.5 });
  Chip.shoot();
}
function explode(x,y,z,color){
  for(let i=0;i<14;i++){
    const a=Math.random()*Math.PI*2, sp=2+Math.random()*5;
    game.particles.push({
      x,y,z,
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, vz:(Math.random()-0.5)*6,
      life:0.6+Math.random()*0.4, max:1, color
    });
  }
}

function spawnEnemy(){
  const m = ENEMY_MODELS[(Math.random()*ENEMY_MODELS.length)|0];
  game.enemies.push({
    model:m,
    x:(Math.random()*2-1)*X_LIMIT,
    y:PLAYER_Y + (Math.random()*2-0.4)*1.6,
    z:FAR_Z,
    scale:0.9+Math.random()*0.7,
    rot:[Math.random()*6,Math.random()*6,Math.random()*6],
    rotV:[(Math.random()-0.5)*2,(Math.random()-0.5)*2,(Math.random()-0.5)*2],
    drift:(Math.random()-0.5)*1.2,
    hp:1,
  });
}

// ============================================================
//  MISE À JOUR
// ============================================================
function update(dt){
  if(state===STATE.HOME){ game.homeRot += dt*0.9; return; }
  if(state!==STATE.PLAY) return;

  // difficulté progressive
  game.speed = 26 + game.score*0.04;
  game.spawnEvery = Math.max(0.32, 0.85 - game.score*0.0015);

  // déplacement joueur
  const accel = 60;
  if(input.left)  game.playerVX -= accel*dt;
  if(input.right) game.playerVX += accel*dt;
  game.playerVX *= 0.86;                       // friction
  game.playerX += game.playerVX*dt;
  if(game.playerX < -X_LIMIT){ game.playerX=-X_LIMIT; game.playerVX=0; }
  if(game.playerX >  X_LIMIT){ game.playerX= X_LIMIT; game.playerVX=0; }

  // tir auto en maintenant
  game.fireT -= dt;
  if(input.fire && game.fireT<=0){ fire(); game.fireT=game.fireRate; }

  // défilement / étoiles
  game.scroll += game.speed*dt;
  for(const st of game.stars){
    st.z -= game.speed*dt;
    if(st.z<2){ st.z=FAR_Z; st.x=(Math.random()*2-1)*14; st.y=(Math.random()*2-1)*9; }
  }

  // spawn ennemis
  game.spawnT -= dt;
  if(game.spawnT<=0){ spawnEnemy(); game.spawnT=game.spawnEvery; }

  // ennemis
  for(let i=game.enemies.length-1;i>=0;i--){
    const e=game.enemies[i];
    e.z -= game.speed*dt;
    e.x += e.drift*dt;
    e.rot[0]+=e.rotV[0]*dt; e.rot[1]+=e.rotV[1]*dt; e.rot[2]+=e.rotV[2]*dt;

    // dépassé le joueur → collision si proche
    if(e.z < PLAYER_Z){
      const dx=Math.abs(e.x-game.playerX), dy=Math.abs(e.y-PLAYER_Y);
      if(dx < 1.1+e.scale*0.6 && dy < 1.1+e.scale*0.6){
        // touché !
        explode(e.x,e.y,e.z,'#ff2244');
        game.enemies.splice(i,1);
        hitPlayer();
        continue;
      }
      if(e.z < 1){ game.enemies.splice(i,1); continue; } // esquivé
    }
  }

  // balles
  for(let i=game.bullets.length-1;i>=0;i--){
    const b=game.bullets[i];
    b.z += 70*dt;
    if(b.z>FAR_Z+4){ game.bullets.splice(i,1); continue; }
    // collision balle/ennemi
    for(let j=game.enemies.length-1;j>=0;j--){
      const e=game.enemies[j];
      if(Math.abs(b.z-e.z)<1.4+e.scale &&
         Math.abs(b.x-e.x)<0.9+e.scale &&
         Math.abs(b.y-e.y)<0.9+e.scale){
        explode(e.x,e.y,e.z,NEON);
        Chip.explosion();
        game.enemies.splice(j,1);
        game.bullets.splice(i,1);
        game.score += 10;
        updateHUD();
        break;
      }
    }
  }

  // particules
  for(let i=game.particles.length-1;i>=0;i--){
    const p=game.particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
    p.life-=dt;
    if(p.life<=0) game.particles.splice(i,1);
  }

  if(game.shake>0) game.shake-=dt;
  if(game.flash>0) game.flash-=dt*2.5;
}

function hitPlayer(){
  game.lives--;
  game.shake=0.4; game.flash=1;
  Chip.hit();
  updateHUD();
  if(game.lives<=0) gameOver();
}

// ============================================================
//  RENDU
// ============================================================
// Tunnel / grille filaire (sol + plafond + parois) qui défile
function drawTunnel(){
  const spacing=6;
  const off = game.scroll % spacing;
  ctx.lineWidth=1.4;

  // lignes transversales (profondeur)
  for(let i=0;i<14;i++){
    const z = i*spacing - off + 2;
    if(z<=0.5) continue;
    const a = Math.max(0, 1 - z/FAR_Z);
    ctx.strokeStyle = `rgba(0,255,102,${0.10+a*0.55})`;
    const floorL = project(-14, -6, z), floorR = project(14, -6, z);
    const ceilL  = project(-14,  6, z), ceilR  = project(14,  6, z);
    ctx.beginPath();
    if(floorL&&floorR){ ctx.moveTo(floorL.x,floorL.y); ctx.lineTo(floorR.x,floorR.y); }
    if(ceilL&&ceilR){ ctx.moveTo(ceilL.x,ceilL.y); ctx.lineTo(ceilR.x,ceilR.y); }
    ctx.stroke();
  }

  // lignes longitudinales (rails fuyants)
  ctx.strokeStyle='rgba(0,255,102,0.30)';
  ctx.beginPath();
  for(let gx=-12; gx<=12; gx+=4){
    const n=project(gx,-6,2), f=project(gx,-6,FAR_Z);
    if(n&&f){ ctx.moveTo(n.x,n.y); ctx.lineTo(f.x,f.y); }
    const nc=project(gx,6,2), fc=project(gx,6,FAR_Z);
    if(nc&&fc){ ctx.moveTo(nc.x,nc.y); ctx.lineTo(fc.x,fc.y); }
  }
  // arêtes verticales des parois
  for(const sx of [-14,14]){
    const n=project(sx,-6,2), f=project(sx,-6,FAR_Z);
    const nc=project(sx,6,2), fc=project(sx,6,FAR_Z);
    if(n&&f){ ctx.moveTo(n.x,n.y); ctx.lineTo(f.x,f.y); }
    if(nc&&fc){ ctx.moveTo(nc.x,nc.y); ctx.lineTo(fc.x,fc.y); }
  }
  ctx.stroke();
}

function drawStars(){
  for(const st of game.stars){
    const p=project(st.x,st.y,st.z);
    if(!p) continue;
    const a=Math.max(0,1-st.z/FAR_Z);
    ctx.fillStyle=`rgba(0,255,102,${0.2+a*0.6})`;
    const r=Math.max(0.6, p.s*0.5);
    ctx.fillRect(p.x, p.y, r, r);
  }
}

function drawBullets(){
  ctx.strokeStyle=NEON;
  ctx.lineWidth=2.5;
  ctx.beginPath();
  for(const b of game.bullets){
    const a=project(b.x,b.y,b.z), c=project(b.x,b.y,b.z-1.6);
    if(a&&c){ ctx.moveTo(a.x,a.y); ctx.lineTo(c.x,c.y); }
  }
  ctx.stroke();
}

function drawParticles(){
  for(const p of game.particles){
    const pr=project(p.x,p.y,p.z);
    if(!pr) continue;
    const a=Math.max(0,p.life/p.max);
    ctx.fillStyle = (p.color===NEON)
      ? `rgba(0,255,102,${a})`
      : `rgba(255,40,80,${a})`;
    const r=Math.max(1,pr.s*0.9);
    ctx.fillRect(pr.x-r/2, pr.y-r/2, r, r);
  }
}

function drawPlayer(){
  // léger roulis selon la vitesse latérale
  const roll = -game.playerVX*0.05;
  const bob  = Math.sin(performance.now()*0.004)*0.06;
  ctx.shadowColor=NEON; ctx.shadowBlur=12;
  drawModel(SHIP, [game.playerX, PLAYER_Y+bob, PLAYER_Z], 1.25, [0.25, 0, roll], NEON, 2.4);
  ctx.shadowBlur=0;
}

function drawEnemies(){
  // trier loin -> proche
  const list=[...game.enemies].sort((a,b)=>b.z-a.z);
  for(const e of list){
    const a=Math.max(0.15, 1-e.z/FAR_Z);
    const col=`rgba(0,255,102,${0.35+a*0.65})`;
    drawModel(e.model, [e.x,e.y,e.z], e.scale, e.rot, col, 2);
  }
}

// ---- Écran d'accueil ----
function drawHome(){
  // vaisseau filaire qui tourne sur lui-même
  ctx.shadowColor=NEON; ctx.shadowBlur=16;
  drawModel(SHIP, [0, 0.4, 9], 3.4, [0.35, game.homeRot, Math.sin(game.homeRot*0.6)*0.15], NEON, 3);
  ctx.shadowBlur=0;

  // Titre
  ctx.textAlign='center';
  ctx.fillStyle=NEON;
  ctx.shadowColor=NEON; ctx.shadowBlur=18;
  ctx.font=`bold ${Math.min(W*0.13,68)}px "Courier New",monospace`;
  ctx.fillText('NEON', CX, H*0.20);
  ctx.fillText('WIREFRONT', CX, H*0.20 + Math.min(W*0.13,68)*0.95);
  ctx.shadowBlur=0;

  // sous-titre
  ctx.font=`${Math.min(W*0.04,18)}px "Courier New",monospace`;
  ctx.fillStyle='rgba(0,255,102,0.7)';
  ctx.fillText('— WIREFRAME SHOOTER —', CX, H*0.20 + Math.min(W*0.13,68)*1.7);

  // bouton START clignotant (dessiné dans le canvas)
  const bw=Math.min(W*0.55,260), bh=64, bx=CX-bw/2, by=H*0.74;
  const blink=0.55+0.45*Math.sin(performance.now()*0.005);
  ctx.strokeStyle=`rgba(0,255,102,${blink})`;
  ctx.lineWidth=2.5;
  ctx.shadowColor=NEON; ctx.shadowBlur=14*blink;
  roundRect(bx,by,bw,bh,12); ctx.stroke();
  ctx.shadowBlur=0;
  ctx.fillStyle=`rgba(0,255,102,${0.6+blink*0.4})`;
  ctx.font=`bold ${Math.min(W*0.07,30)}px "Courier New",monospace`;
  ctx.fillText('► START', CX, by+bh*0.66);

  ctx.font=`${Math.min(W*0.035,15)}px "Courier New",monospace`;
  ctx.fillStyle='rgba(0,255,102,0.45)';
  ctx.fillText('TOUCHEZ L\'ÉCRAN POUR JOUER', CX, by+bh+34);
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function render(){
  // fond noir + léger fondu (traînées)
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#000';
  // on garde un fond bien noir mais on laisse un peu de traînée néon
  ctx.globalCompositeOperation='source-over';

  ctx.save();
  if(game.shake>0){
    const s=game.shake*14;
    ctx.translate((Math.random()-0.5)*s,(Math.random()-0.5)*s);
  }

  if(state===STATE.HOME){
    drawStars();
    drawHome();
  } else {
    drawTunnel();
    drawStars();
    drawEnemies();
    drawBullets();
    drawParticles();
    drawPlayer();
  }
  ctx.restore();

  // flash rouge quand on est touché
  if(game.flash>0){
    ctx.fillStyle=`rgba(255,0,40,${game.flash*0.4})`;
    ctx.fillRect(0,0,W,H);
  }
}

// ============================================================
//  BOUCLE PRINCIPALE
// ============================================================
let last=performance.now();
function loop(now){
  let dt=(now-last)/1000;
  last=now;
  if(dt>0.05) dt=0.05;          // clamp (onglet en arrière-plan)
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

})();

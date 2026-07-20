import * as THREE from 'three';
import { scene, camera, ground, holoGroup } from './scene.js';
import { player } from './player.js';
import { vmRoot, flash, flashMat, flashLight, muzzleWorld, refreshViewmodel } from './viewmodel.js';
import { WEAPONS, M } from './weapons.js';
import { effectiveStats } from './attachments.js';
import { S } from './state.js';
import { targets } from './targets.js';
import { findEnemyByMesh, damageEnemy } from './enemies.js';
import { updateHUD, updateCombo, showHitmarker, popup } from './hud.js';
import { sfxShot, sfxHit, sfxClick, sfxReload, sfxEmpty } from './audio.js';

export function switchWeapon(wid){
  S.currentWeapon = wid;
  S.reloading = false;
  S.ammo = effectiveStats(wid).mag;
  refreshViewmodel();
  sfxClick(900,.14);
  S.vmKick = .6;
}

export function startReload(){
  const st = effectiveStats(S.currentWeapon);
  if(S.reloading || S.ammo>=st.mag) return;
  S.reloading = true;
  S.reloadEnd = performance.now()/1000 + st.reload;
  sfxReload();
  updateHUD();
}

/* ============================================================
   STRZELANIE
============================================================ */
const raycaster = new THREE.Raycaster();
// Reużywane wektory strzału — tworzone raz, mutowane przy każdym wystrzale (zamiast new Vector3 per strzał).
const _fireDir = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _endPoint = new THREE.Vector3();
const shootables = [];  // meshes celów + otoczenie
// Filtr odległościowy: lokacje żyją w scenie na stałe (rozstawione o 2500+ j., patrz
// locations.js ORIGINS), więc bez filtra `shootables` rośnie do setek/tysięcy meshy
// i KAŻDY strzał raycastuje względem CAŁEJ gry (~4ms). Zbieramy tylko meshe w promieniu
// wokół gracza — największa lokacja (compound) ma przekątną ~82 j., 130 daje bezpieczny zapas.
const _shootableFilterPos = new THREE.Vector3(); // scratch, unikamy alokacji w pętli
const SHOOTABLE_RADIUS = 130;
export function rebuildShootables(){
  shootables.length = 0;
  const r2 = SHOOTABLE_RADIUS * SHOOTABLE_RADIUS;
  scene.traverse(o=>{
    if(o.isMesh && o!==ground && !o.userData.noHit && o.parent!==vmRoot && !vmRoot.children.includes(o)){
      // pomijamy viewmodel
      let p=o; let inVM=false;
      while(p){ if(p===vmRoot||p===holoGroup){inVM=true;break;} p=p.parent; }
      if(inVM) return;
      // getWorldPosition, NIE .position — część obiektów jest zagnieżdżona w grupach
      o.getWorldPosition(_shootableFilterPos);
      if(_shootableFilterPos.distanceToSquared(player.pos) > r2) return; // odległa, inna lokacja
      shootables.push(o);
    }
  });
  shootables.push(ground); // ground globalny/zawsze blisko — bez filtra, jak dotychczas
}
setTimeout(rebuildShootables, 0);

export function tryFire(now){
  const st = effectiveStats(S.currentWeapon);
  if(S.reloading) return;
  if(now - S.lastShot < 60/st.rpm) return;
  if(S.ammo<=0){ sfxEmpty(); S.firing=false; return; }
  S.lastShot = now;
  S.ammo--;

  // spread — zależny od ruchu, ADS i statystyk
  const moving = Math.hypot(player.vel.x, player.vel.z);
  let spread = st.spread * (S.aiming? .35 : 1) * (1 + moving*.09) * (player.onGround?1:1.8);

  const dir = _fireDir.set(0,0,-1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random()-.5)*spread*2;
  dir.y += (Math.random()-.5)*spread*2;
  dir.normalize();

  raycaster.set(camera.getWorldPosition(_camPos), dir);
  raycaster.far = 300;
  // `shootables` bywa odświeżane rzadziej niż giną wrogowie (dopiero na start/koniec
  // misji) — pomijamy trafienia w meshe już zdjęte ze sceny (zwłoki po collapse),
  // inaczej zostają jako niewidzialne "widma" blokujące kolejne strzały.
  const hits = raycaster.intersectObjects(shootables, false).filter(h=>h.object.parent!==null);

  // punkt startowy tracera = wylot lufy
  flash.getWorldPosition(muzzleWorld);
  let endPoint = _endPoint.copy(_camPos).addScaledVector(dir, 200); // _camPos = pozycja kamery (ustawiona wyżej)

  if(hits.length){
    const h = hits[0];
    endPoint = h.point;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0,1,0);
    // trafienie w cel (papierowa tarcza strzelnicy)?
    const tgt = targets.find(t=>t.alive && (h.object===t.face || t.board.children.includes(h.object)));
    if(tgt){
      hitTarget(tgt, h.point, st);
    } else {
      // trafienie w wroga misji? (mesh wroga to grupa prymitywów — szukamy po przodkach)
      const enemy = findEnemyByMesh(h.object);
      if(enemy){
        damageEnemy(enemy, st.damage);
        sfxHit(false);
        showHitmarker();
        spawnSparks(h.point, n);
      } else {
        spawnSparks(h.point, n);
        spawnHole(h.point, n);
      }
    }
  }
  spawnTracer(muzzleWorld.clone(), endPoint);
  spawnCasing();

  // dźwięk + flash
  const heavy = st.damage/85;
  sfxShot(st.suppressed, heavy, S.currentWeapon);
  if(!st.suppressed){
    flashMat.opacity = 1;
    flashLight.intensity = 20;
  } else {
    flashMat.opacity = .25;
    flashLight.intensity = 4;
  }
  // flash lokalnie w vmRoot, przy wylocie lufy. (Poprzednie 3 przypisania nadpisywały się
  // nawzajem i alokowały tymczasowy Vector3 — zostaje tylko finalny, jednoznaczny set.)
  flash.position.set(0,.01,WEAPONS[S.currentWeapon].muzzleZ);
  flash.scale.setScalar(.8+Math.random()*.7);

  // recoil
  const r = st.recoil * (S.aiming? .6:1);
  S.recoilPitch += r * (0.8+Math.random()*.4);
  S.recoilYaw   += r * (Math.random()-.5) * .6;
  S.vmKick = 1;

  if(WEAPONS[S.currentWeapon].mode!=='AUTO') S.firing = false; // SEMI/PUMP: jeden strzał na klik
  if(S.ammo===0) setTimeout(startReload, 250);
  updateHUD();
}

function hitTarget(t, point, st){
  // odległość od środka tarczy → punkty
  const local = t.face.worldToLocal(point.clone());
  const d = Math.sqrt(local.x*local.x + local.z*local.z); // cylinder: oś Y po rotacji => x,z to płaszczyzna tarczy
  let pts, bull=false;
  if(d < .11){ pts = 100; bull = true; }
  else if(d < .21) pts = 50;
  else if(d < .32) pts = 25;
  else pts = 10;
  if(t.moving) pts *= 2;

  S.combo++;
  clearTimeout(S.comboEnd);
  S.comboEnd = setTimeout(()=>{ S.combo=0; updateCombo(); }, 2500);
  const total = pts * Math.min(S.combo, 5);
  S.score += total;

  sfxHit(bull);
  showHitmarker();
  popup(bull? `PERFECT +${total}` : `+${total}`, bull);
  updateHUD(); updateCombo();

  t.alive = false;
  t.fallT = 0;
  t.respawnAt = performance.now()/1000 + 2.2;
  spawnSparks(point, new THREE.Vector3(0,1,0));
}

/* ============================================================
   EFEKTY: tracery, iskry, łuski, dziury
============================================================ */
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({color:0xffe9a0, transparent:true, opacity:1});
function spawnTracer(from, to){
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, tracerMat.clone());
  scene.add(line);
  tracers.push({line, life:.09});
}
const sparks = [];
const sparkGeo = new THREE.SphereGeometry(.02,4,4);
const sparkMat = new THREE.MeshBasicMaterial({color:0xffcc66});
function spawnSparks(pos, normal){
  for(let i=0;i<8;i++){
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.position.copy(pos);
    const v = normal.clone().multiplyScalar(2+Math.random()*3)
      .add(new THREE.Vector3((Math.random()-.5)*3,(Math.random())*3,(Math.random()-.5)*3));
    scene.add(m);
    sparks.push({m, v, life:.4+Math.random()*.3});
  }
}
const holes = [];
const holeGeo = new THREE.CircleGeometry(.03,8);
const holeMat = new THREE.MeshBasicMaterial({color:0x111111, side:THREE.DoubleSide});
function spawnHole(pos, normal){
  const m = new THREE.Mesh(holeGeo, holeMat);
  m.position.copy(pos).addScaledVector(normal,.012);
  m.lookAt(pos.clone().add(normal));
  scene.add(m);
  holes.push(m);
  if(holes.length>60){ scene.remove(holes.shift()); }
}
const casings = [];
const caseGeo = new THREE.CylinderGeometry(.008,.008,.03,6);
function spawnCasing(){
  const m = new THREE.Mesh(caseGeo, M.gold);
  const p = new THREE.Vector3(.3,-.2,-.4).applyMatrix4(camera.matrixWorld);
  m.position.copy(p);
  const right = new THREE.Vector3(1,.8,0).applyQuaternion(camera.quaternion).multiplyScalar(1.5+Math.random());
  scene.add(m);
  casings.push({m, v:right, av:new THREE.Vector3(Math.random()*20,Math.random()*20,0), life:1.2});
}

export function updateEffects(dt){
  for(let i=tracers.length-1;i>=0;i--){
    const tr=tracers[i]; tr.life-=dt;
    tr.line.material.opacity = Math.max(0,tr.life/.09);
    if(tr.life<=0){ scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); tracers.splice(i,1); } // dispose: geometria per-tracer + sklonowany materiał (inaczej wyciek GPU)
  }
  for(let i=sparks.length-1;i>=0;i--){
    const s=sparks[i]; s.life-=dt;
    s.v.y -= 9*dt;
    s.m.position.addScaledVector(s.v,dt);
    s.m.scale.setScalar(Math.max(.01,s.life*2));
    if(s.life<=0){ scene.remove(s.m); sparks.splice(i,1); }
  }
  for(let i=casings.length-1;i>=0;i--){
    const c=casings[i]; c.life-=dt;
    c.v.y -= 9*dt;
    c.m.position.addScaledVector(c.v,dt);
    c.m.rotation.x += c.av.x*dt; c.m.rotation.z += c.av.y*dt;
    if(c.life<=0){ scene.remove(c.m); casings.splice(i,1); }
  }
}

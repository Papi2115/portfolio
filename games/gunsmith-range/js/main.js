// CrazyGames SDK: PIERWSZY import — jego ciało modułu woła loadingStart()
// natychmiast, jak najwcześniej w cyklu ładowania gry.
import { markLoaded, tickGameplayState } from './crazysdk.js';
import * as THREE from 'three';
import { renderer, scene, camera, colliders, groundHeightAt } from './scene.js';
import { player, keys, nearTable, updateSpeedBlur, updateTutorialHints } from './player.js';
import { S } from './state.js';
import { effectiveStats } from './attachments.js';
import { WEAPONS } from './weapons.js';
import { vmRoot, vmWeapon, refreshViewmodel, decayFlash, updateReloadAnim, reloadDip } from './viewmodel.js';
import { tryFire, switchWeapon } from './combat.js';
import { updateHUD, updateCrosshair, updateCraftCamera, updateHint, scopeOverlay, openCraft, closeCraft } from './hud.js';
import { targets, updateTargets } from './targets.js';
import { updateEffects } from './combat.js';
import { updateEnemies } from './enemies.js';
import { updateGrenades } from './grenades.js';
import { updateMission } from './missions.js';
import { updateWaypoint } from './waypoint.js';
import { nearLever } from './locations.js';
import './health.js';
import './economy.js';
import './narrator.js';
import './menu.js';
import './touch.js';
import './uiscale.js';

/* ============================================================
   PĘTLA GŁÓWNA
============================================================ */
let prevT = performance.now()/1000;
const camEuler = new THREE.Euler(0,0,0,'YXZ');
let curFov = 75;
let leanAmt = 0;                               // aktualne wychylenie (peek), płynnie dążące do celu Q/E
// LEAN_OFFSET < r(.45) - near plane(.05), żeby przy pełnym wychyleniu w stronę ściany, o którą
// gracz się opiera, kamera zostawała za near-clip'em ściany (inaczej ściana znika z widoku).
const LEAN_OFFSET = 0.38, LEAN_ROLL = 0.14;    // boczny offset kamery (jedn. świata) i kąt przechyłu (rad ~8°)
// Reużywane wektory pętli głównej — tworzone RAZ, mutowane co klatkę przez .set()/.add().
// Wcześniej każda klatka alokowała 4× new THREE.Vector3 + 1× Vector2 → tysiące obiektów/s dla GC.
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _adsPos = new THREE.Vector3();

function collide(pos, r=.45){
  for(const b of colliders){
    // tylko jeśli na wysokości gracza
    if(b.max.y < .3) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x-cx, dz = pos.z-cz;
    const d2 = dx*dx+dz*dz;
    if(d2 < r*r){
      const d = Math.sqrt(d2)||.0001;
      pos.x = cx + dx/d*r;
      pos.z = cz + dz/d*r;
    }
  }
  // Granica areny — prostokątne min/max aktualnie aktywnej strefy (baza albo
  // lokacja misji, patrz S.arenaMinX/MaxX/MinZ/MaxZ w state.js). Baza ma teraz
  // ciasne granice dopasowane do faktycznego budynku (bez pustej przestrzeni
  // na zewnątrz), misje nadpisują to na czas swojego trwania.
  pos.x = Math.max(S.arenaMinX+1, Math.min(S.arenaMaxX-1, pos.x));
  pos.z = Math.max(S.arenaMinZ+1, Math.min(S.arenaMaxZ-1, pos.z));
}

function tick(){
  requestAnimationFrame(tick);
  const now = performance.now()/1000;
  let dt = Math.min(now-prevT, .05);       // sclampowane dt dla fizyki/logiki (bez teleportacji po lag spike)
  prevT = now;

  // Centralny watcher CrazyGames gameplayStart/Stop — jedno wywołanie/klatkę,
  // pokrywa WSZYSTKIE przejścia S.mode (menu↔play↔craft, start/koniec misji).
  tickGameplayState(S.mode);

  /* ---- ruch gracza ---- */
  // !S.paused: panel pauzy (Escape) zamraża CAŁĄ symulację jedną flagą (ruch,
  // strzał, aim/FOV, viewmodel, hint, tutorial, waypoint, wrogowie, granaty, misja),
  // choć S.mode zostaje 'play'. Renderer/kamera dalej rysuje (overlay zasłania ~96%).
  if(S.mode==='play' && !S.paused){
    _fwd.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
    _right.set(-_fwd.z,0,_fwd.x);
    _wish.set(0,0,0);
    if(keys.KeyW) _wish.add(_fwd);
    if(keys.KeyS) _wish.sub(_fwd);
    if(keys.KeyA) _wish.sub(_right);
    if(keys.KeyD) _wish.add(_right);
    _wish.normalize();
    const sprint = keys.ShiftLeft && !S.aiming;
    const targetSpeed = player.speed * (sprint?player.sprintMul:1) * (S.aiming?.55:1);
    // gdy trzymamy klawisz ruchu → szybkie przyspieszanie do celu (jak dotąd);
    // gdy puszczamy (wish~0) → wolniejsze wyhamowanie = poślizg (~.2-.4s).
    const moving = _wish.lengthSq() > 1e-6;
    const rate = moving ? (player.onGround? 14 : 4)   // accel (klawisz wciśnięty)
                        : (player.onGround? 6  : 4);   // decel (poślizg do zera)
    player.vel.x += (_wish.x*targetSpeed - player.vel.x)*Math.min(1,rate*dt);
    player.vel.z += (_wish.z*targetSpeed - player.vel.z)*Math.min(1,rate*dt);

    if(keys.Space && player.onGround){ player.vel.y = 5.2; player.onGround=false; }
    player.vel.y -= 14*dt;

    // Substep pozycji+kolizji: zapobiega "tunelowaniu" przez cienkie ściany przy dużej
    // prędkości (sprint, zwłaszcza sprint+skok). Bez tego pojedyncze addScaledVector(dt)
    // mogło przenieść gracza NA WYLOT przez kolajder w jednym kroku, zanim collide() w
    // ogóle zobaczyło nakładanie — dzielimy przemieszczenie na kroki ≤ MAX_STEP i wołamy
    // collide() po KAŻDYM z nich, żeby korekta złapała każde przecięcie po drodze.
    const MAX_STEP = 0.25;   // bezpiecznie poniżej najcieńszej ścianki/przegrody (T=.8) w lokacjach
    const moveLen = Math.hypot(player.vel.x, player.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(moveLen / MAX_STEP));
    const stepDt = dt / steps;
    for(let s=0; s<steps; s++){
      player.pos.addScaledVector(player.vel, stepDt);
      collide(player.pos);
    }

    // Wysokość gruntu liczona dynamicznie (scene.js:groundHeightAt) zamiast sztywnego
    // 1.7 — pozwala na podesty/piętra (locations.js:addPlatform) w wybranych misjach.
    const gH = groundHeightAt(player.pos.x, player.pos.z);
    if(player.pos.y<=gH){ player.pos.y=gH; player.vel.y=0; player.onGround=true; }

    // head bob
    const hv = Math.hypot(player.vel.x, player.vel.z); // było: new THREE.Vector2(...).length() — alokacja co klatkę
    if(player.onGround && hv>.5) S.bobT += dt * hv * 1.6;
    const bobY = Math.sin(S.bobT*2)*.018*Math.min(1,hv/6);
    const bobX = Math.cos(S.bobT)*.012*Math.min(1,hv/6);

    // recoil recovery
    S.recoilPitch = THREE.MathUtils.lerp(S.recoilPitch, 0, Math.min(1, 8*dt));
    S.recoilYaw   = THREE.MathUtils.lerp(S.recoilYaw, 0, Math.min(1, 8*dt));

    // Wychylenie (peek) w lewo/prawo pod Q/E — płynnie interpolowane do celu, żeby nie
    // było skokowe. leanTarget: Q=-1 (lewo), E=+1 (prawo), oba naraz = 0 (anulują się).
    const leanTarget = (keys.KeyQ?-1:0) + (keys.KeyE?1:0);
    leanAmt = THREE.MathUtils.lerp(leanAmt, leanTarget, Math.min(1, 10*dt));

    camEuler.set(player.pitch + S.recoilPitch, player.yaw + S.recoilYaw, -leanAmt*LEAN_ROLL);
    camera.quaternion.setFromEuler(camEuler);
    camera.position.set(
      player.pos.x + bobX*Math.cos(player.yaw) + _right.x*leanAmt*LEAN_OFFSET,
      player.pos.y + bobY,
      player.pos.z + _right.z*leanAmt*LEAN_OFFSET
    );

    /* ---- strzał ---- */
    if(S.firing && (S.pointerLocked || S.touchActive)) tryFire(now);
    if(S.reloading && now>=S.reloadEnd){
      S.reloading=false;
      S.ammo = effectiveStats(S.currentWeapon).mag;
      updateHUD();
    }

    /* ---- FOV / ADS ---- */
    const st = effectiveStats(S.currentWeapon);
    const targetFov = S.aiming? 75/st.adsZoom : (keys.ShiftLeft&&hv>4? 82:75);
    curFov = THREE.MathUtils.lerp(curFov, targetFov, Math.min(1,12*dt));
    camera.fov = curFov; camera.updateProjectionMatrix();

    // scope overlay
    const useScope = S.aiming && st.scopeOverlay;
    scopeOverlay.style.display = useScope? 'block':'none';
    if(vmWeapon) vmWeapon.visible = !useScope;

    /* ---- viewmodel sway/kick ---- */
    S.vmKick = Math.max(0, S.vmKick - dt*7);
    const vm = WEAPONS[S.currentWeapon].vm;
    // reużywany _adsPos zamiast new THREE.Vector3 co klatkę
    if(S.aiming){
      if(S.currentWeapon==='pistol') _adsPos.set(0,-.175,-.38);
      else _adsPos.set(0,-.185,-.42);
    } else _adsPos.set(vm.pos[0], vm.pos[1], vm.pos[2]);
    S.vmSway.x = THREE.MathUtils.lerp(S.vmSway.x, -S.recoilYaw*2, Math.min(1,10*dt));
    S.vmSway.y = THREE.MathUtils.lerp(S.vmSway.y, S.recoilPitch*1.5, Math.min(1,10*dt));
    // dip przeładowania wliczony w CEL lerpa (nie dodawany do position po fakcie) —
    // inaczej offset kumulowałby się klatka po klatce i zależał od FPS.
    const dip = reloadDip();
    _adsPos.y -= dip*.16;
    _adsPos.z += dip*.05;
    vmRoot.position.lerp(_adsPos, Math.min(1,14*dt));
    vmRoot.position.z += S.vmKick*.09;
    vmRoot.position.y += Math.sin(S.bobT*2)*.006*Math.min(1,hv/6) - S.vmKick*.01;
    vmRoot.rotation.x = S.vmKick*.16 + S.vmSway.y + dip*.5;
    vmRoot.rotation.y = S.vmSway.x;
    vmRoot.rotation.z = Math.cos(S.bobT)*.005*Math.min(1,hv/6) + dip*.32;

    /* ---- animacja przeładowania: magazynek (pozycja vmRoot/rotacja już wliczone wyżej) ---- */
    updateReloadAnim();

    /* ---- crosshair ---- */
    const gap = 8 + st.spread*900 + hv*1.6 + S.vmKick*14;
    updateCrosshair(S.aiming? gap*.4 : gap);

    /* ---- hint ---- */
    if(nearTable()) updateHint(true, 'Gunsmith Workshop');
    else if(nearLever(player.pos)) updateHint(true, 'Pull Lever');
    else updateHint(false);

    /* ---- tutorial: proximity-triggered wskazówki Marasa (raz na miejsce) ---- */
    updateTutorialHints();

    /* ---- tutorial: ścieżka na podłodze do kolejnego celu (tylko w bazie) ---- */
    updateWaypoint(dt);

    /* ---- speed blur (reużywamy hv) ---- */
    updateSpeedBlur(hv);

    /* ---- wrogowie / granaty / runtime misji (tylko w aktywnej rozgrywce) ---- */
    updateEnemies(dt, player.pos);
    updateGrenades(dt);
    updateMission(dt);
  }

  /* ---- tryb craft: kamera patrzy na stół ---- */
  if(S.mode==='craft'){
    curFov = updateCraftCamera(dt, now, curFov);
  } else if(vmWeapon && !(S.aiming && effectiveStats(S.currentWeapon).scopeOverlay)){
    vmWeapon.visible = true;
  }

  /* ---- flash decay ---- */
  decayFlash(dt);

  /* ---- cele ---- */
  updateTargets(now, dt);

  /* ---- efekty ---- */
  updateEffects(dt);

  /* ---- poza grą: wyczyść ewentualny blur (nie zostawiamy zablokowanego) ---- */
  if(S.mode!=='play') updateSpeedBlur(0);

  renderer.render(scene, camera);
}

refreshViewmodel();
updateHUD();
// Koniec synchronicznej inicjalizacji (scena + menu + HUD gotowe) → loadingStop.
markLoaded();
tick();

// debug (konsola przeglądarki)
window.dbg = { player, openCraft, closeCraft, tryFire:(n)=>tryFire(n??performance.now()/1000),
  setMode:m=>S.mode=m, getMode:()=>S.mode, targets, effectiveStats, switchWeapon };

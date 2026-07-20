import * as THREE from 'three';
import { scene, colliders, addCollider, ground, losOccluders } from './scene.js';
import { player } from './player.js';
import { takeDamage } from './health.js';
import { addCredits } from './economy.js';
import { S } from './state.js';

/* ============================================================
   WROGOWIE / AI  —  GUNSMITH RANGE
   ------------------------------------------------------------
   3 typy: 'shooter', 'tactical', 'knife'.
   Wrogowie startują jako 'idle' (nieświadomi). Aggro dopiero gdy:
     - zobaczą gracza (dystans + nieprzesłonięty raycast LOS), albo
     - ktoś obok nich zginie (damageEnemy → alarm w promieniu).

   Moduł jest samowystarczalny: własny zegar (_t), własne VFX (tracery),
   własne śledzenie colliderów (żeby clearEnemies nie skasował świata).

   Publiczne API (nazwy/sygnatury zamrożone — importują je inne moduły):
     enemies                                        (tablica)
     spawnEnemy(type, position, opts={})            → obiekt wroga
     clearEnemies()
     updateEnemies(dt, playerPos)
     damageEnemy(enemyRefOrId, amount)
     damageEnemiesInRadius(position, radius, amount, opts={})
     stunEnemiesInRadius(position, radius, duration)
============================================================ */

export const enemies = [];

/* Zegar modułu — akumulowany z dt w updateEnemies (deterministyczny,
   niezależny od performance.now). Wszystkie timery (strzał, LOS-check,
   duty-cycle, cooldown melee, stun) używają _t. */
let _t = 0;

let _idCounter = 1;

/* Zbiór Box3 należących do wrogów — żeby ruch wrogów ich nie „widział"
   jako ścian, i żeby clearEnemies zdejmował tylko nasze collidery. */
const enemyBoxes = new Set();

/* Konfiguracja per-typ. Wartości balansowe (AI „sensowne", nie firing squad). */
const TYPES = {
  shooter: {
    hp: 70, reward: 8, color: 0x6b7250,          // neutralna oliwka/szarość
    detectRange: 30, ranged: true,
    fireInterval: 1.5, fireDamage: 8, hitChance: 0.55, effRange: 34,
    moveSpeed: 0.9, wanderRadius: 1.6, melee: false,
  },
  tactical: {
    hp: 78, reward: 12, color: 0x3d4636,          // ciemny „camo"
    detectRange: 32, ranged: true,
    fireInterval: 1.3, fireDamage: 9, hitChance: 0.55, effRange: 36,
    moveSpeed: 1.0, wanderRadius: 1.2, melee: false,
    duckMin: 1.0, duckMax: 2.0, peekMin: 0.8, peekMax: 1.3,
  },
  knife: {
    hp: 55, reward: 12, color: 0xcc4422,          // czerwono-pomarańczowy akcent
    detectRange: 18, ranged: false,
    moveSpeed: 3.6, melee: true,
    meleeRange: 1.6, meleeDamage: 16, meleeCooldown: 1.0,
  },
};

/* ============================================================
   MODELE WROGÓW — proceduralne, oparte na prymitywach (BoxGeometry),
   sportowane z demo bandyta_atak/zasadzka/noz.html.

   WYDAJNOŚĆ (do ~14 wrogów naraz × ~20 boxów/model):
   - JEDNA współdzielona geometria jednostkowa (UNIT_BOX 1×1×1) skalowana
     per-mesh przez .scale.set(w,h,d) — zamiast osobnej BoxGeometry na box.
   - Współdzielone materiały: getMat() cache'uje jeden MeshStandardMaterial
     na unikalny (color|roughness|metalness). Wszystkie żywe modele danego
     typu reużywają te same instancje.
   - KONSEKWENCJA: disposeMesh() NIE zwalnia tych zasobów (patrz niżej) —
     zniszczyłoby wygląd pozostałych żywych wrogów. Są to moduł-singletony
     (jak dawne bodyMat/darkMat), żyją całą sesję.
   - castShadow tylko na dużych bryłach (tors/nogi/ramiona/głowa/broń);
     drobne detale (oczy, celowniki, maska, pasek, błysk) mają cast=false,
     by nie mnożyć casterów cieni przy wielu wrogach.
------------------------------------------------------------ */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _matCache = new Map();
function getMat(color, roughness = 0.85, metalness = 0.05){
  const key = color + '|' + roughness + '|' + metalness;
  let m = _matCache.get(key);
  if(!m){ m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); _matCache.set(key, m); }
  return m;
}
/* box helper: mesh na współdzielonej geometrii + współdzielonym materiale.
   opts.cast=false → drobny detal (bez rzucania cienia). */
function boxMesh(w, h, d, color, opts = {}){
  const m = new THREE.Mesh(UNIT_BOX, getMat(color, opts.roughness ?? 0.85, opts.metalness ?? 0.05));
  m.scale.set(w, h, d);
  const cast = opts.cast !== false;
  m.castShadow = cast; m.receiveShadow = cast;
  return m;
}

/* Współdzielone zasoby błysku lufy (additive) — jedna instancja na CAŁY moduł.
   Animujemy TYLKO group.visible + group.scale (per-obiekt), NIGDY opacity
   materiału → bezpieczne współdzielenie między wszystkimi strzelcami. */
const _flashMat = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const _flashCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false });
const _flashPlaneGeo = new THREE.PlaneGeometry(0.42, 0.42);
const _flashCoreGeo = new THREE.SphereGeometry(0.09, 6, 6);

/* palety per-typ (sportowane z plików referencyjnych; tactical przyciemniony
   względem shooter dla wizualnego odróżnienia — pliki miały identyczną paletę). */
const PALETTES = {
  shooter: { jacket:0x4a4632, jacketArm:0x413d2c, pants:0x33301f, pantsLeg:0x2c2919,
    belt:0x1c1611, mask:0x1b1b1b, skin:0xc79a72, gloves:0x1f1f1f, boots:0x181410 },
  tactical: { jacket:0x3d4636, jacketArm:0x353d30, pants:0x2b3226, pantsLeg:0x242a20,
    belt:0x161a12, mask:0x14140f, skin:0xbe9068, gloves:0x191919, boots:0x14110c },
  knife: { jacket:0x5c3a2e, jacketArm:0x502f25, pants:0x2e2a22, pantsLeg:0x282419,
    belt:0x1c1611, mask:0x6b1f1f, skin:0xa87657, gloves:0x241a14, boots:0x1a140f },
};

/* Dwuczłonowa kończyna: joint (bark/biodro) → bend (łokieć/kolano) → stopa. */
function buildLimbChain(upperLen, upperThick, lowerLen, lowerThick, color, footBox){
  const joint = new THREE.Group();
  const upper = boxMesh(upperThick, upperLen, upperThick, color);
  upper.position.y = -upperLen / 2;
  joint.add(upper);

  const bend = new THREE.Group();
  bend.position.y = -upperLen;
  joint.add(bend);

  const lower = boxMesh(lowerThick, lowerLen, lowerThick, color, { roughness: 0.9 });
  lower.position.y = -lowerLen / 2;
  bend.add(lower);

  let endMesh = null;
  if(footBox){
    endMesh = boxMesh(footBox.w, footBox.h, footBox.d, footBox.color, { roughness: 0.95 });
    endMesh.position.set(0, -lowerLen - footBox.h / 2 + 0.02, footBox.d * 0.18);
    bend.add(endMesh);
  }
  return { joint, bend, upper, lower, endMesh };
}

/* Buduje humanoida. weapon: 'rifle' (shooter/tactical) | 'knife'.
   Twarz i broń skierowane w +Z (zgodne z faceTarget → mesh.rotation.y). */
function buildBandit(palette, opts){
  const weapon = opts.weapon;
  const hipsBaseY = opts.hipsBaseY;
  const torsoBaseRotX = opts.torsoLean;

  const root = new THREE.Group();
  // kontener podnoszący model tak, by stopy stały na y≈0 (jak dawny box-model)
  const rig = new THREE.Group();
  rig.position.y = opts.feetLift;
  root.add(rig);

  // ---- biodra ----
  const hips = new THREE.Group();
  hips.position.y = hipsBaseY;
  rig.add(hips);

  const pelvis = boxMesh(0.5, 0.28, 0.32, palette.pants);
  hips.add(pelvis);

  // ---- tors ----
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.16;
  torsoGroup.rotation.x = torsoBaseRotX;
  hips.add(torsoGroup);

  const waist = boxMesh(0.46, 0.16, 0.30, palette.jacket);
  waist.position.y = 0.08; torsoGroup.add(waist);
  const chest = boxMesh(0.58, 0.44, 0.34, palette.jacket);
  chest.position.y = 0.16 + 0.22; torsoGroup.add(chest);
  const belt = boxMesh(0.52, 0.08, 0.34, palette.belt, { cast: false });
  belt.position.y = 0.02; torsoGroup.add(belt);

  // ---- szyja + głowa ----
  const neck = new THREE.Group();
  neck.position.y = 0.16 + 0.44 + 0.05;
  neck.rotation.x = opts.neckRot;
  torsoGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.16;
  neck.add(headGroup);

  const head = boxMesh(0.30, 0.30, 0.28, palette.skin);
  headGroup.add(head);
  const mask = boxMesh(0.315, 0.19, 0.30, palette.mask, { roughness: 0.95, cast: false });
  mask.position.set(0, -0.055, 0.005); headGroup.add(mask);
  const eyeL = boxMesh(0.06, 0.03, 0.02, 0x0a0a0a, { roughness: 0.4, cast: false });
  eyeL.position.set(-0.08, 0.03, 0.15); headGroup.add(eyeL);
  const eyeR = boxMesh(0.06, 0.03, 0.02, 0x0a0a0a, { roughness: 0.4, cast: false });
  eyeR.position.set(0.08, 0.03, 0.15); headGroup.add(eyeR);
  const knot = boxMesh(0.10, 0.07, 0.08, palette.mask, { cast: false });
  knot.position.set(0, 0.08, -0.16); headGroup.add(knot);

  // ---- ramiona ----
  function makeArm(sign){
    const shoulderAnchor = new THREE.Group();
    shoulderAnchor.position.set(sign * 0.34, 0.16 + 0.40, 0.0);
    torsoGroup.add(shoulderAnchor);
    const arm = buildLimbChain(0.40, 0.15, 0.37, 0.13, palette.jacketArm, {
      w: 0.14, h: 0.16, d: 0.20, color: palette.gloves,
    });
    arm.endMesh.position.set(0, -0.37 - 0.06, weapon === 'knife' ? 0.06 : 0.09);
    shoulderAnchor.add(arm.joint);
    return arm;
  }
  const armL = makeArm(1);
  const armR = makeArm(-1);

  let weaponMount = null, weaponBase = null, flashGroup = null;

  if(weapon === 'rifle'){
    // poza spoczynkowa: chwyt karabinu (IK z demo)
    armR.joint.rotation.set(0.164, 0, 0.974);
    armR.bend.rotation.x = -1.603;
    armL.joint.rotation.set(-0.949, 0, -0.551);
    armL.bend.rotation.x = -0.335;

    weaponMount = new THREE.Group();
    weaponBase = { px: -0.09, py: 0.37, pz: 0.44, rx: -0.08, ry: 0.10, rz: 0 };
    weaponMount.position.set(weaponBase.px, weaponBase.py, weaponBase.pz);
    weaponMount.rotation.set(weaponBase.rx, weaponBase.ry, weaponBase.rz);
    torsoGroup.add(weaponMount);

    const gunMetal = 0x1c1c1c, gunMetal2 = 0x2a2a2a, wood = 0x3b2a1a;
    const stock = boxMesh(0.09, 0.11, 0.24, wood, { roughness: 0.8 });
    stock.position.set(0, 0, -0.20); weaponMount.add(stock);
    const receiver = boxMesh(0.10, 0.11, 0.34, gunMetal, { roughness: 0.55, metalness: 0.4 });
    receiver.position.set(0, 0, 0.02); weaponMount.add(receiver);
    const grip = boxMesh(0.06, 0.16, 0.07, gunMetal2, { roughness: 0.7, cast: false });
    grip.position.set(0, -0.13, -0.07); grip.rotation.x = 0.25; weaponMount.add(grip);
    const handguard = boxMesh(0.08, 0.08, 0.28, gunMetal2, { roughness: 0.6, cast: false });
    handguard.position.set(0, -0.02, 0.17); weaponMount.add(handguard);
    const barrel = boxMesh(0.035, 0.035, 0.55, gunMetal, { roughness: 0.4, metalness: 0.6 });
    barrel.position.set(0, 0.005, 0.55); weaponMount.add(barrel);
    const mag = boxMesh(0.055, 0.24, 0.075, gunMetal2, { roughness: 0.6, cast: false });
    mag.position.set(0, -0.19, 0.06); mag.rotation.x = -0.35; weaponMount.add(mag);
    const sightRear = boxMesh(0.03, 0.05, 0.03, gunMetal, { cast: false });
    sightRear.position.set(0, 0.085, -0.08); weaponMount.add(sightRear);
    const sightFront = boxMesh(0.025, 0.06, 0.025, gunMetal, { cast: false });
    sightFront.position.set(0, 0.08, 0.50); weaponMount.add(sightFront);

    // błysk lufy (współdzielone geo/mat; per-instancja tylko visible+scale)
    flashGroup = new THREE.Group();
    flashGroup.position.set(0, 0.005, 0.86);
    weaponMount.add(flashGroup);
    const flashP1 = new THREE.Mesh(_flashPlaneGeo, _flashMat);
    const flashP2 = new THREE.Mesh(_flashPlaneGeo, _flashMat);
    flashP2.rotation.z = Math.PI / 2;
    const core = new THREE.Mesh(_flashCoreGeo, _flashCoreMat);
    flashGroup.add(flashP1, flashP2, core);
    flashGroup.visible = false;
  } else {
    // nóż w prawej dłoni (podąża za przedramieniem)
    const knife = new THREE.Group();
    knife.position.set(0, -0.37 - 0.06, 0.10);
    knife.rotation.x = 0.6;
    armR.bend.add(knife);
    const handle = boxMesh(0.045, 0.045, 0.16, 0x2a1c12, { roughness: 0.7, cast: false });
    handle.position.set(0, 0, 0.02); knife.add(handle);
    const guard = boxMesh(0.11, 0.035, 0.03, 0x3a3a3a, { roughness: 0.5, metalness: 0.4, cast: false });
    guard.position.set(0, 0, 0.10); knife.add(guard);
    const blade = boxMesh(0.035, 0.02, 0.30, 0xc9d2da, { roughness: 0.25, metalness: 0.75, cast: false });
    blade.position.set(0, 0, 0.27); knife.add(blade);
    const tip = boxMesh(0.02, 0.02, 0.06, 0xc9d2da, { roughness: 0.2, metalness: 0.8, cast: false });
    tip.position.set(0, 0, 0.45); knife.add(tip);
  }

  // ---- nogi ----
  function makeLeg(sign){
    const hipAnchor = new THREE.Group();
    hipAnchor.position.set(sign * 0.15, -0.14, 0.0);
    hips.add(hipAnchor);
    const leg = buildLimbChain(0.45, 0.18, 0.40, 0.155, palette.pantsLeg, {
      w: 0.18, h: 0.12, d: 0.30, color: palette.boots,
    });
    hipAnchor.add(leg.joint);
    return leg;
  }
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  root.userData = {
    noHit: true, // nie mieszaj się z raycastem broni gracza / okluzją LOS
    rig: {
      hips, torsoGroup, headGroup, armL, armR, legL, legR, hipsBaseY, torsoBaseRotX,
      weaponMount, weaponBase, flashGroup,
      armRestL: { jx: armL.joint.rotation.x, jz: armL.joint.rotation.z, bx: armL.bend.rotation.x },
      armRestR: { jx: armR.joint.rotation.x, jz: armR.joint.rotation.z, bx: armR.bend.rotation.x },
    },
  };
  return root;
}

/* opts stylu chodu/postawy per-typ + kalibracja feetLift (stopy na y≈0). */
const MODEL_OPTS = {
  shooter:  { weapon: 'rifle', hipsBaseY: 0.90, torsoLean: 0.16, neckRot: -0.20, feetLift: 0.19 },
  tactical: { weapon: 'rifle', hipsBaseY: 0.90, torsoLean: 0.16, neckRot: -0.20, feetLift: 0.19 },
  knife:    { weapon: 'knife', hipsBaseY: 1.02, torsoLean: 0.36, neckRot: -0.42, feetLift: 0.07 },
};

function buildEnemyModel(key){
  return buildBandit(PALETTES[key] || PALETTES.shooter, MODEL_OPTS[key] || MODEL_OPTS.shooter);
}

/* ------------------------------------------------------------
   LOS: czy z 'from' widać 'to' bez przeszkody?  Prawdziwa okluzja —
   raycast po scene.children, ignorujemy własny mesh i ziemię.
------------------------------------------------------------ */
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();

function isDescendant(obj, root){
  let p = obj;
  while(p){ if(p === root) return true; p = p.parent; }
  return false;
}

// Wywoływane w momencie przejścia w 'combat' — daje krótki czas reakcji zamiast
// natychmiastowego strzału, gdyby nextFire/meleeReady wygasły podczas długiego idle.
function onSpotPlayer(e){
  const reaction = 0.2 + Math.random() * 0.3;
  e.nextFire = Math.max(e.nextFire, _t + reaction);
  e.meleeReady = Math.max(e.meleeReady, _t + reaction);
}

function hasNoHitAncestor(obj){
  let p = obj;
  while(p){ if(p.userData && p.userData.noHit) return true; p = p.parent; }
  return false;
}

function losClear(from, to, selfMesh){
  _dir.copy(to).sub(from);
  const dist = _dir.length();
  if(dist < 0.001) return true;
  _dir.multiplyScalar(1 / dist);
  _ray.set(from, _dir);
  _ray.far = dist;
  let hits;
  try {
    // Raycast TYLKO po dedykowanej liście ścian/osłon (kilkadziesiąt płaskich meshy) zamiast
    // po scene.children z recursive:true (setki węzłów: makieta, broń, narzędzia, gwiazdy, cele,
    // tracery, wszyscy wrogowie). To był największy pojedynczy koszt AI — teraz ~rząd wielkości mniej pracy.
    hits = _ray.intersectObjects(losOccluders, false);
  } catch(e){
    return true; // scena pusta/uszkodzona — nie blokujemy sztucznie
  }
  for(const h of hits){
    if(h.distance >= dist - 0.15) continue;          // za graczem — nie liczy się
    if(h.object === ground) continue;                // podłoga nie zasłania poziomego LOS
    if(h.object && hasNoHitAncestor(h.object)) continue; // inni wrogowie/markery (flaga jest na grupie, nie na dziecku)
    if(selfMesh && isDescendant(h.object, selfMesh)) continue; // własne ciało
    return false;                                    // realna przeszkoda (ściana/skrzynia)
  }
  return true;
}

/* ------------------------------------------------------------
   Collider wroga — statyczne half-extents policzone raz, aktualizowane
   co klatkę z pozycji mesha (żeby biegnący 'knife' nie zostawiał
   niewidzialnej ściany w miejscu spawnu).
------------------------------------------------------------ */
function registerCollider(e){
  const before = colliders.length;
  addCollider(e.mesh, 0.05);
  const box = colliders[colliders.length - 1];
  if(box && colliders.length > before){
    e.colliderBox = box;
    enemyBoxes.add(box);
    // Half-extents CIAŁA postaci — stałe, NIE liczone z pełnego mesha.
    // Lufa karabinu / nóż sięgają lokalnie z≈1.3; AABB collidera nie obraca się
    // z modelem (syncCollider centruje go symetrycznie wokół e.pos), więc liczenie
    // z Box3.setFromObject(cały mesh) dałoby ~1.5m ścianę kolizji we wszystkie
    // strony niezależnie od kierunku patrzenia. Bierzemy tylko footprint tors/biodra.
    e.colHalf = new THREE.Vector3(0.38, 0.85, 0.32);
    e.colBaseY = { min: box.min.y, max: box.max.y };
    syncCollider(e); // od razu ściśnij świeżo dodany (napompowany) box do footprintu ciała
  } else {
    e.colliderBox = null;
  }
}

function syncCollider(e){
  const b = e.colliderBox;
  if(!b || !e.colHalf) return;
  const p = e.mesh.position;
  b.min.x = p.x - e.colHalf.x; b.max.x = p.x + e.colHalf.x;
  b.min.z = p.z - e.colHalf.z; b.max.z = p.z + e.colHalf.z;
  // y zostawiamy stałe (kolizje gracza są 2D w XZ)
}

function removeCollider(e){
  const b = e.colliderBox;
  if(!b) return;
  const idx = colliders.indexOf(b);
  if(idx >= 0) colliders.splice(idx, 1);
  enemyBoxes.delete(b);
  e.colliderBox = null;
}

/* Odpychanie od ścian/skrzyń (circle-vs-AABB w XZ). Pomija collidery wrogów. */
function avoidWorld(pos, radius){
  for(const box of colliders){
    if(enemyBoxes.has(box)) continue;
    const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx*dx + dz*dz;
    if(d2 < radius*radius && d2 > 1e-6){
      const d = Math.max(Math.sqrt(d2), 0.08);   // floor na d — zapobiega push→∞ przy głębokim zanurzeniu w collider
      const push = Math.min((radius - d) / d, 8); // cap na push jako druga warstwa bezpieczeństwa (żeby nie „wystrzelić" wroga)
      pos.x += dx * push; pos.z += dz * push;
    }
  }
}

/* Jednorazowa (przy spawnie) korekta pozycji: wypycha wroga z każdej skrzyni/ściany,
   w którą wspawn-point go zanurzył — dla WSZYSTKICH typów (shooter/tactical się nie
   ruszają, więc bez tego zostałyby wtopione na stałe). Ograniczona pętla iteracji,
   ta sama circle-vs-AABB logika co avoidWorld (pomija collidery wrogów). */
function resolveSpawnOverlap(e){
  const p = e.mesh.position;
  for(let i = 0; i < 6; i++){
    let moved = false;
    for(const box of colliders){
      if(enemyBoxes.has(box)) continue;
      const cx = Math.max(box.min.x, Math.min(p.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(p.z, box.max.z));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx*dx + dz*dz;
      const radius = 0.45; // footprint ciała + margines
      if(d2 < radius*radius){
        if(d2 > 1e-6){
          const d = Math.max(Math.sqrt(d2), 0.08);
          const push = Math.min((radius - d) / d, 8);
          p.x += dx * push; p.z += dz * push;
        } else {
          // środek wroga dokładnie w środku skrzyni: brak kierunku — pchnij po X
          p.x += radius;
        }
        moved = true;
      }
    }
    if(!moved) break;
  }
  clampArena(e.pos);
  syncCollider(e); // box collidera podąża za skorygowaną pozycją
}

/* ------------------------------------------------------------
   VFX: proste tracery ognia wroga (styl luźno wzorowany na combat.js,
   ale w pełni samodzielny — nic nie importujemy z combat.js).
------------------------------------------------------------ */
const _tracers = [];
const _tracerMat = new THREE.LineBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 1 });
function spawnTracer(from, to){
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, _tracerMat.clone());
  line.userData.noHit = true;
  scene.add(line);
  _tracers.push({ line, life: 0.07 });
}
function updateTracers(dt){
  for(let i = _tracers.length - 1; i >= 0; i--){
    const tr = _tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.07);
    if(tr.life <= 0){ scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); _tracers.splice(i, 1); } // dispose: geometria per-tracer + sklonowany materiał (inaczej wyciek GPU)
  }
}

/* ------------------------------------------------------------
   SPAWN
------------------------------------------------------------ */
export function spawnEnemy(type, position, opts = {}){
  let key = type;
  if(!TYPES[key]){
    console.warn(`spawnEnemy: nieznany typ "${type}", używam 'shooter'.`);
    key = 'shooter';
  }
  const cfg = TYPES[key];

  // pozycja: Vector3 lub {x,y,z}
  const px = position ? (position.x ?? 0) : 0;
  const py = position ? (position.y ?? 0) : 0;
  const pz = position ? (position.z ?? 0) : 0;

  const mesh = buildEnemyModel(key);
  mesh.position.set(px, py, pz);
  scene.add(mesh);

  const maxHp = Number.isFinite(opts.hp) ? opts.hp : cfg.hp;
  const reward = Number.isFinite(opts.rewardCredits) ? opts.rewardCredits : cfg.reward;

  const e = {
    id: _idCounter++,
    type: key,
    mesh,
    pos: mesh.position,                 // referencja — trzymana w sync z meshem
    hp: maxHp, maxHp,
    alive: true,
    state: 'idle',                      // 'idle' | 'alert' | 'combat' | 'dead'
    cfg,
    reward,
    homeX: px, homeY: py, homeZ: pz,    // punkt spawnu (idle wander wokół niego)
    // timery
    nextCheck: _t + Math.random() * 0.5,      // stagger LOS-checków
    nextFire: _t + cfg.fireInterval * (0.6 + Math.random() * 0.8),
    meleeReady: _t + cfg.meleeCooldown * (0.4 + Math.random() * 0.3), // brak natychmiastowego ataku tuż po spawnie
    stunnedUntil: 0,
    // animacja / duty-cycle
    bobPhase: Math.random() * 6.28,
    // pose (rig procedural): timery i stany animacji odczytywane przez poseEnemy
    rig: mesh.userData.rig,
    fireFlashT: 999,                    // czas od ostatniego strzału (odrzut/błysk lufy)
    hideAmt: (key === 'tactical') ? 1 : 0, // wygładzony 0..1 duck/peek (tactical startuje schowany)
    runPhase: Math.random() * 6.28,     // faza cyklu biegu (knife)
    moveAmt: 0,                          // wygładzone 0..1 „ile biegnie" (knife)
    attackT: 999,                        // czas od pchnięcia nożem (knife)
    chasing: false,
    // tactical
    hidden: false,
    phaseEnd: 0,
    coverPoints: Array.isArray(opts.coverPoints) ? opts.coverPoints : null,
    coverTarget: null,
  };

  // tactical: znajdź najbliższy cover point (jeśli podano) — TYLKO jako cel
  // wizualny/animacyjny (e.coverTarget, nieszkodliwy). NIE koryguje pozycji
  // spawnu: wróg stoi DOKŁADNIE na przekazanym (statycznym) enemySpawnPoint z
  // danych lokacji — żadnego przeliczania mesh.position/px/pz w runtime.
  if(key === 'tactical' && e.coverPoints && e.coverPoints.length){
    let best = null, bestD = Infinity;
    for(const cp of e.coverPoints){
      const dx = cp.x - px, dz = cp.z - pz;
      const d = dx*dx + dz*dz;
      if(d < bestD){ bestD = d; best = cp; }
    }
    e.coverTarget = best;
    e.phaseEnd = _t + rand(cfg.duckMin, cfg.duckMax);
    e.hidden = true;
  } else if(key === 'tactical'){
    e.phaseEnd = _t + rand(cfg.duckMin, cfg.duckMax);
    e.hidden = true;
  }

  registerCollider(e);
  resolveSpawnOverlap(e); // FIX B: wypchnij z ewentualnego zanurzenia w skrzyni/ścianie (wszystkie typy)
  enemies.push(e);
  return e;
}

function rand(a, b){ return a + Math.random() * (b - a); }

// Usuwanie modelu wroga: geometrie i materiały są WSPÓŁDZIELONE między wszystkimi
// żywymi wrogami (UNIT_BOX + getMat cache + zasoby błysku) — dispose zniszczyłby
// wygląd pozostałych. Model nie ma żadnych zasobów unikalnych per-instancja, więc
// wystarczy odczepienie ze sceny (robione przez wołających removeFromParent).
// Funkcja zostaje jako no-op dla zgodności wywołań (clearEnemies / śmierć).
function disposeMesh(_g){ /* celowo puste — patrz komentarz wyżej */ }

/* ------------------------------------------------------------
   CLEAR
------------------------------------------------------------ */
export function clearEnemies(){
  for(const e of enemies){
    removeCollider(e);
    if(e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
    if(e.mesh) disposeMesh(e.mesh);
  }
  enemies.length = 0;
  // sprzątamy też wiszące tracery
  for(const tr of _tracers){ if(tr.line.parent) tr.line.parent.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); }
  _tracers.length = 0;
}

/* ------------------------------------------------------------
   ŚMIERĆ wroga — wspólna ścieżka dla damageEnemy / damageEnemiesInRadius.
------------------------------------------------------------ */
function killEnemy(e){
  if(!e.alive) return;
  e.alive = false;
  e.state = 'dead';
  e.hp = 0;
  removeCollider(e);
  addCredits(e.reward);

  // zgaś ewentualny błysk lufy — gałąź !alive robi `continue` przed poseEnemy(),
  // więc poseFlash nie zgasiłby go i świeciłby przez cały collapse.
  if(e.rig && e.rig.flashGroup) e.rig.flashGroup.visible = false;

  // krótki „collapse" — przewrócenie, potem usunięcie
  e.deathT = 0;

  // alarm: obudź pobliskich IDLE wrogów (usłyszeli/zobaczyli, że kolega ginie)
  alertNearby(e.pos, 18, e);
}

function alertNearby(pos, radius, exclude){
  const r2 = radius * radius;
  for(const o of enemies){
    if(o === exclude || !o.alive) continue;
    if(o.state !== 'idle') continue;
    const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z;
    if(dx*dx + dz*dz <= r2){
      o.state = 'alert';
    }
  }
}

/* ------------------------------------------------------------
   DAMAGE — po referencji lub id.
------------------------------------------------------------ */
function resolveEnemy(ref){
  if(ref && typeof ref === 'object'){
    return enemies.includes(ref) ? ref : null;
  }
  // id (number/string)
  return enemies.find(e => e.id === ref || String(e.id) === String(ref)) || null;
}

/* Znajdź żywego wroga, którego mesh (grupa) jest przodkiem trafionego obiektu.
   Używane przez combat.js: raycast broni gracza trafia w prymityw-dziecko grupy
   wroga → chodzimy w górę po parentach aż trafimy na e.mesh. */
export function findEnemyByMesh(object){
  let p = object;
  while(p){
    for(let i = 0; i < enemies.length; i++){
      const e = enemies[i];
      if(e.alive && e.mesh === p) return e;
    }
    p = p.parent;
  }
  return null;
}

export function damageEnemy(enemyRefOrId, amount){
  const e = resolveEnemy(enemyRefOrId);
  if(!e || !e.alive) return;
  const dmg = Math.max(0, Number(amount) || 0);
  if(dmg <= 0) return;
  e.hp -= dmg;
  // trafienie budzi wroga natychmiast (nawet bez własnego LOS)
  if(e.state === 'idle') e.state = 'alert';
  if(e.hp <= 0) killEnemy(e);
}

export function damageEnemiesInRadius(position, radius, amount, opts = {}){
  if(!position) return;
  const r = Math.max(0, Number(radius) || 0);
  const r2 = r * r;
  const lethal = !!opts.lethal;
  const dmg = Math.max(0, Number(amount) || 0);
  // kopia listy żywych — killEnemy modyfikuje stan, ale nie tablicę enemies
  for(const e of enemies.slice()){
    if(!e.alive) continue;
    const dx = e.pos.x - position.x, dy = e.pos.y - position.y, dz = e.pos.z - position.z;
    if(dx*dx + dy*dy + dz*dz > r2) continue;
    if(lethal){ killEnemy(e); continue; }
    if(dmg <= 0) continue;
    e.hp -= dmg;
    if(e.state === 'idle') e.state = 'alert';
    if(e.hp <= 0) killEnemy(e);
  }
}

export function stunEnemiesInRadius(position, radius, duration){
  if(!position) return;
  const r = Math.max(0, Number(radius) || 0);
  const r2 = r * r;
  const dur = Math.max(0, Number(duration) || 0);
  for(const e of enemies){
    if(!e.alive) continue;
    const dx = e.pos.x - position.x, dy = e.pos.y - position.y, dz = e.pos.z - position.z;
    if(dx*dx + dy*dy + dz*dz <= r2){
      const wakeAt = _t + dur;
      e.stunnedUntil = wakeAt;
      // przesuń też timery akcji poza koniec ogłuszenia — inaczej "doganiają" i cała
      // grupa strzela/tnie w tej samej klatce, w której stun się kończy (catch-up bug)
      const reaction = 0.25 + Math.random() * 0.35; // krótki czas reakcji po otrząśnięciu
      e.nextFire = Math.max(e.nextFire, wakeAt + reaction);
      e.meleeReady = Math.max(e.meleeReady, wakeAt + reaction);
      e.phaseEnd = Math.max(e.phaseEnd, wakeAt);
      e.nextCheck = Math.max(e.nextCheck, wakeAt);
    }
  }
}

/* ------------------------------------------------------------
   ZACHOWANIA per-typ (wołane z updateEnemies dla żywych, nieoszołomionych).
------------------------------------------------------------ */
const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();

/* Scratch Box3 dla „bezpiecznika podłogi" podczas collapse (śmierć wroga).
   Alokowany raz na moduł — updateEnemies używa go ponownie co klatkę, żeby
   nie tworzyć nowego Box3 na każdy martwy mesh. */
const _deathBox = new THREE.Box3();

function eyePos(e, out){
  out.set(e.pos.x, e.pos.y + 1.15, e.pos.z);
  return out;
}
function playerAim(playerPos, out){
  out.set(playerPos.x, playerPos.y - 0.1, playerPos.z); // celuj w tors gracza
  return out;
}

function tryDetect(e, playerPos){
  const dx = playerPos.x - e.pos.x, dz = playerPos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  if(dist > e.cfg.detectRange) return false;
  eyePos(e, _eye);
  playerAim(playerPos, _tgt);
  return losClear(_eye, _tgt, e.mesh);
}

function faceTarget(e, tx, tz){
  const yaw = Math.atan2(tx - e.pos.x, tz - e.pos.z);
  e.mesh.rotation.y = yaw;
}

function doRangedCombat(e, dt, playerPos){
  faceTarget(e, playerPos.x, playerPos.z);

  // tactical: duty-cycle chowania/wychylania
  let canFire = true;
  if(e.type === 'tactical'){
    if(_t >= e.phaseEnd){
      e.hidden = !e.hidden;
      e.phaseEnd = _t + (e.hidden
        ? rand(e.cfg.duckMin, e.cfg.duckMax)
        : rand(e.cfg.peekMin, e.cfg.peekMax));
      // (pozycja „za osłoną" jest ustawiana raz przy spawnie — patrz spawnEnemy;
      //  dawne przypisanie e.homeX/homeZ = e.coverTarget było martwym kodem, usunięte)
    }
    // kucanie/wychylanie realizuje poseTactical() na rigu (biodra/tors/kolana),
    // sterowane e.hidden — bez ruszania e.pos.y ani skalowania mesha.
    canFire = !e.hidden;
  }

  if(!canFire) return;
  if(_t < e.nextFire) return;
  e.nextFire = _t + e.cfg.fireInterval * (0.75 + Math.random() * 0.5);

  const dist = Math.hypot(playerPos.x - e.pos.x, playerPos.z - e.pos.z);
  if(dist > e.cfg.effRange) return;

  eyePos(e, _eye);
  playerAim(playerPos, _tgt);
  const clear = losClear(_eye, _tgt, e.mesh);
  if(!clear) return; // brak LOS (ściana/róg) → wróg w ogóle nie strzela: żadnego tracera, błysku, odrzutu ani obrażeń

  // VFX: tracer z klatki piersiowej wroga w stronę gracza (z rozrzutem przy pudle)
  const from = _eye.clone();
  let hit = false;
  if(clear){
    // szansa trafienia maleje z dystansem — AI „sensowne", nie zabójcze
    const chance = e.cfg.hitChance * Math.max(0.25, 1 - dist / (e.cfg.effRange * 1.4));
    hit = Math.random() < chance;
  }
  const to = _tgt.clone();
  if(!hit){
    to.x += (Math.random() - 0.5) * 1.4;
    to.y += (Math.random() - 0.5) * 1.0;
    to.z += (Math.random() - 0.5) * 1.4;
  }
  spawnTracer(from, to);
  e.fireFlashT = 0; // wyzwól odrzut broni + błysk lufy w rigu DOKŁADNIE w momencie strzału

  if(hit) takeDamage(e.cfg.fireDamage);
}

function doKnifeCombat(e, dt, playerPos){
  const dx = playerPos.x - e.pos.x, dz = playerPos.z - e.pos.z;
  const dist = Math.hypot(dx, dz);
  faceTarget(e, playerPos.x, playerPos.z);

  if(dist > e.cfg.meleeRange){
    // biegnij prosto na gracza (proste steer-toward, lekkie omijanie ścian)
    e.chasing = true; // napędza cykl biegu (animateRun) w poseKnife()
    const step = e.cfg.moveSpeed * dt;
    e.pos.x += (dx / (dist || 1)) * step;
    e.pos.z += (dz / (dist || 1)) * step;
    avoidWorld(e.pos, 0.4);
    clampArena(e.pos);
  } else {
    // w zasięgu — atak na cooldownie (nie co klatkę)
    e.chasing = false;
    if(_t >= e.meleeReady){
      e.meleeReady = _t + e.cfg.meleeCooldown;
      takeDamage(e.cfg.meleeDamage);
      e.attackT = 0; // wyzwól animację pchnięcia nożem (poseKnife)
    }
  }
}

function idleWander(e, dt){
  // tylko minimalne kręcenie w miejscu; „oddech"/postawę robi poseEnemy na rigu
  e.mesh.rotation.y += Math.sin(_t * 0.5 + e.bobPhase) * dt * 0.15;
}

/* ------------------------------------------------------------
   POZA / ANIMACJA RIGU — wołane co klatkę dla żywych wrogów.
   Wpięte w prawdziwy stan AI (nie autonomiczne zegary demo):
   odrzut/błysk z e.fireFlashT (moment strzału), duck z e.hidden,
   bieg z e.chasing, pchnięcie z e.attackT.
------------------------------------------------------------ */
const RUN_SPEED = 7.2;

// ostry kop + zanik (0 w spoczynku) — jak recoilEnvelope() z bandyta_atak.html
function recoilEnvelope(x){
  if(x < 0 || x > 0.5) return 0;
  const attack = 0.035;
  if(x < attack) return x / attack;
  return Math.exp(-(x - attack) * 13.0);
}
// impuls pchnięcia nożem 0→1→0
function thrustEnvelope(x){
  if(x < 0 || x > 0.35) return 0;
  return Math.sin((x / 0.35) * Math.PI);
}
// błysk lufy: TYLKO visible + scale (materiał współdzielony, nie ruszamy opacity)
function poseFlash(r, ft, allow){
  const fg = r.flashGroup;
  if(!fg) return;
  if(allow && ft >= 0 && ft < 0.055){
    const k = 1 - ft / 0.055;
    const s = 0.7 + k * 0.9;
    fg.visible = true;
    fg.scale.set(s, s, s);
    fg.rotation.z = _t * 53.0; // migotanie orientacji (deterministyczne, bez alokacji)
  } else {
    fg.visible = false;
  }
}

function poseShooter(e, dt){
  const r = e.rig;
  e.fireFlashT += dt;
  const rec = recoilEnvelope(e.fireFlashT);
  const ph = _t * 2 + e.bobPhase;
  // nogi rozstawione, planted; drobne przenoszenie ciężaru
  r.legR.joint.rotation.x = -0.05 + Math.sin(ph) * 0.02;
  r.legL.joint.rotation.x =  0.05 - Math.sin(ph) * 0.02;
  r.legR.bend.rotation.x = 0.30;
  r.legL.bend.rotation.x = 0.34;
  // biodra: oddech + przenoszenie ciężaru, mikro-drżenie od odrzutu
  r.hips.position.y = r.hipsBaseY + Math.sin(_t * 1.6 + e.bobPhase) * 0.02 - rec * 0.015;
  r.hips.rotation.y = Math.sin(_t * 1.1 + e.bobPhase) * 0.03;
  // tors: lean bazowy − lekki odchył na strzale
  r.torsoGroup.rotation.x = r.torsoBaseRotX - rec * 0.05;
  r.torsoGroup.rotation.y = Math.sin(_t * 1.1) * 0.02;
  r.headGroup.rotation.y = Math.sin(_t * 0.6 + e.bobPhase) * 0.03;
  // ramiona: chwyt broni + sway + kop odrzutu (z nie ruszamy — stała chwytu)
  const sway = Math.sin(_t * 2.2 + e.bobPhase) * 0.03;
  const kick = rec * 0.14;
  r.armR.joint.rotation.x = r.armRestR.jx + sway + kick;
  r.armR.bend.rotation.x = r.armRestR.bx + sway * 0.5 - rec * 0.10;
  r.armL.joint.rotation.x = r.armRestL.jx + sway + kick * 0.7;
  r.armL.bend.rotation.x = r.armRestL.bx + sway * 0.5 - rec * 0.06;
  // broń: odrzut do tyłu + lufa w górę
  const wb = r.weaponBase;
  r.weaponMount.position.z = wb.pz - rec * 0.07;
  r.weaponMount.position.y = wb.py + rec * 0.015;
  r.weaponMount.rotation.x = wb.rx - rec * 0.13;
  poseFlash(r, e.fireFlashT, true);
}

function poseTactical(e, dt){
  const r = e.rig;
  e.fireFlashT += dt;
  const rec = recoilEnvelope(e.fireFlashT);
  // wygładzone przejście duck/peek z e.hidden (odpowiednik smoothstep z demo)
  const target = e.hidden ? 1 : 0;
  e.hideAmt += (target - e.hideAmt) * Math.min(1, dt * 6);
  const hide = e.hideAmt;
  const breathe = Math.sin(_t * 1.6) * 0.012 * (1 - hide);
  r.hips.position.y = r.hipsBaseY - hide * 0.60 + breathe - rec * 0.01;
  r.torsoGroup.rotation.x = r.torsoBaseRotX + hide * 1.14 - rec * 0.05;
  r.torsoGroup.rotation.y = 0;
  r.legR.joint.rotation.x = hide * 0.55;
  r.legL.joint.rotation.x = hide * 0.55;
  r.legR.bend.rotation.x = 0.45 + hide * 0.95;
  r.legL.bend.rotation.x = 0.45 + hide * 0.95;
  r.headGroup.rotation.x = -hide * 0.15;
  const sway = Math.sin(_t * 2.4) * 0.02 * (1 - hide);
  r.armR.joint.rotation.x = r.armRestR.jx - rec * 0.18 + sway;
  r.armR.bend.rotation.x = r.armRestR.bx - rec * 0.22;
  r.armL.joint.rotation.x = r.armRestL.jx - rec * 0.10 + sway;
  r.armL.bend.rotation.x = r.armRestL.bx - rec * 0.12;
  const wb = r.weaponBase;
  r.weaponMount.position.z = wb.pz - rec * 0.13;
  r.weaponMount.position.y = wb.py + rec * 0.02;
  r.weaponMount.rotation.x = wb.rx - rec * 0.28;
  poseFlash(r, e.fireFlashT, hide < 0.1); // błysk tylko gdy wychylony
}

function poseKnife(e, dt){
  const r = e.rig;
  const target = e.chasing ? 1 : 0;
  e.moveAmt += (target - e.moveAmt) * Math.min(1, dt * 8);
  const amp = e.moveAmt;
  e.runPhase += dt * RUN_SPEED * (0.25 + 0.75 * amp);
  e.attackT += dt;
  const phase = e.runPhase;
  const thr = thrustEnvelope(e.attackT);
  const pR = phase, pL = phase + Math.PI;
  // nogi: mocny wymach + zgięcie kolana na fazie wznoszenia (amplituda skalowana biegiem)
  const hipAmp = 0.85, kneeBase = 0.10, kneeSwing = 1.35;
  r.legR.joint.rotation.x = Math.sin(pR) * hipAmp * amp;
  r.legL.joint.rotation.x = Math.sin(pL) * hipAmp * amp;
  r.legR.bend.rotation.x = kneeBase + Math.max(0, Math.cos(pR)) * kneeSwing * amp;
  r.legL.bend.rotation.x = kneeBase + Math.max(0, Math.cos(pL)) * kneeSwing * amp;
  // lewe ramię (wolne) — kontrwymach
  r.armL.joint.rotation.x = Math.sin(pR) * 0.95 * amp;
  r.armL.bend.rotation.x = -1.15 - Math.max(0, Math.sin(pR)) * 0.55 * amp;
  // prawe ramię (nóż) — wymach biegu + pchnięcie (thrust prostuje łokieć i pcha bark w przód)
  r.armR.joint.rotation.x = 0.55 + Math.sin(pL) * 0.35 * amp - thr * 1.15;
  r.armR.bend.rotation.x = -1.25 + Math.sin(pL) * 0.18 * amp + thr * 0.95;
  // biodra/tors: bujanie biegu + lunge na pchnięciu
  const bob = Math.abs(Math.sin(phase)) * 0.10 * amp;
  r.hips.position.y = r.hipsBaseY + bob;
  r.hips.rotation.y = Math.sin(phase) * 0.10 * amp;
  r.torsoGroup.rotation.y = -Math.sin(phase) * 0.12 * amp;
  r.torsoGroup.rotation.z = Math.sin(phase) * 0.04 * amp;
  r.torsoGroup.rotation.x = r.torsoBaseRotX + Math.sin(phase * 2) * 0.03 * amp + thr * 0.25;
  r.headGroup.rotation.y = Math.sin(phase * 0.5) * 0.04;
}

function poseEnemy(e, dt){
  if(e.type === 'knife') poseKnife(e, dt);
  else if(e.type === 'tactical') poseTactical(e, dt);
  else poseShooter(e, dt);
}

function clampArena(pos){
  // Prostokątne granice aktualnie aktywnej areny (baza albo lokacja misji,
  // patrz S.arenaMinX/MaxX/MinZ/MaxZ w state.js) — inaczej wrogowie w misjach
  // teleportowaliby się z powrotem w okolice (0,0) zamiast trzymać się lokacji.
  if(pos.x < S.arenaMinX+1.5) pos.x = S.arenaMinX+1.5; else if(pos.x > S.arenaMaxX-1.5) pos.x = S.arenaMaxX-1.5;
  if(pos.z < S.arenaMinZ+1.5) pos.z = S.arenaMinZ+1.5; else if(pos.z > S.arenaMaxZ-1.5) pos.z = S.arenaMaxZ-1.5;
}

/* ------------------------------------------------------------
   TICK per-klatka
------------------------------------------------------------ */
export function updateEnemies(dt, playerPos){
  const d = Number(dt) || 0;
  _t += d;

  updateTracers(d);

  const pp = playerPos || (player && player.pos);
  if(!pp){ // brak pozycji gracza — nie prowadzimy AI, ale nie wywalamy się
    return;
  }

  for(let i = enemies.length - 1; i >= 0; i--){
    const e = enemies[i];

    // martwi: collapse → usunięcie
    if(!e.alive){
      if(e.state === 'dead' && e.deathT !== undefined){
        e.deathT += d;
        e.mesh.rotation.x = Math.min(Math.PI / 2, e.deathT * 6);
        e.mesh.position.y = Math.max(0.02, e.homeY - e.deathT * 0.4);
        // Bezpiecznik podłogi: nowe, szczegółowe modele mają broń/nóż wysunięte
        // w lokalne +Z; obrót collapse'u o ~90° wokół X mapuje te punkty na ujemne Y
        // (y' = -z), przez co część geometrii przebijała podłogę. Zmierz realny
        // najniższy punkt PO obrocie i podnieś całość, jeśli zjechała pod y≈0.
        // Formuła opadania wyżej celowo NIETKNIĘTA (zachowuje tempo/wygląd upadku).
        e.mesh.updateWorldMatrix(true, true);
        _deathBox.setFromObject(e.mesh);
        if(_deathBox.min.y < 0.02){
          e.mesh.position.y += (0.02 - _deathBox.min.y);
        }
        if(e.deathT > 1.0){
          if(e.mesh.parent) e.mesh.parent.remove(e.mesh);
          disposeMesh(e.mesh);
          enemies.splice(i, 1);
        }
      }
      continue;
    }

    // oszołomienie (flashbang): zamrażamy AI, nie resetujemy stanu
    if(_t < e.stunnedUntil){
      // zgaś błysk lufy — `continue` pomija poseEnemy(), więc błysk zamrożony
      // podczas strzału-tuż-przed-stunem świeciłby przez cały czas ogłuszenia.
      if(e.rig && e.rig.flashGroup) e.rig.flashGroup.visible = false;
      continue;
    }

    // wykrywanie (staggerowane) — dopóki jeszcze nie w walce
    if(e.state !== 'combat'){
      if(_t >= e.nextCheck){
        e.nextCheck = _t + 0.3 + Math.random() * 0.2;
        if(e.state === 'idle'){
          if(tryDetect(e, pp)){ e.state = 'combat'; onSpotPlayer(e); }
        } else if(e.state === 'alert'){
          // zaalarmowany: obraca się i szuka; wchodzi w combat gdy złapie LOS
          if(tryDetect(e, pp)){ e.state = 'combat'; onSpotPlayer(e); }
        }
      }
    }

    // zachowanie wg stanu
    if(e.state === 'idle'){
      e.chasing = false;
      idleWander(e, d);
    } else if(e.state === 'alert'){
      // czujny: obróć się w stronę gracza i czekaj na LOS
      e.chasing = false;
      faceTarget(e, pp.x, pp.z);
    } else if(e.state === 'combat'){
      if(e.cfg.melee) doKnifeCombat(e, d, pp);
      else doRangedCombat(e, d, pp);
    }

    // animacja rigu (postawa/oddech/bieg/odrzut) dla każdego żywego stanu
    poseEnemy(e, d);

    syncCollider(e);
  }
}

import * as THREE from 'three';
import { scene, addCollider, colliders, losOccluders, addPlatform, wallMat, crateMat, registerAreaLight } from './scene.js';

/* ============================================================
   LOKACJE MISJI — GUNSMITH RANGE
   ------------------------------------------------------------
   5 samodzielnych lokacji budowanych proceduralnie z prymitywów
   THREE.js. Każda lokacja stoi we WŁASNYM, odległym układzie
   współrzędnych (patrz ORIGINS), więc nic się nigdzie nie
   nakłada — nie ma żadnego pokazywania/ukrywania. Geometria po
   zbudowaniu żyje w scenie na stałe (brak usuwania — celowo).

   loadLocation(id) buduje lokację leniwie (idempotentnie) i
   zwraca { spawnPoint, enemySpawnPoints, coverPoints }.
   tryBreachDoor(playerPos) obsługuje wyważenie drzwi w 'house'.
============================================================ */

export const LOCATION_LIST = [
  {id:'warehouse',  name:'PORT WAREHOUSE'},
  {id:'outpost',    name:'DESERT OUTPOST'},
  {id:'street',     name:'CITY STREET'},
  {id:'house',      name:'HOUSE ON THE HILL'},
  {id:'industrial', name:'INDUSTRIAL PLANT'},
  {id:'bunker',     name:'UNDERGROUND BUNKER'},
  {id:'airfield',   name:'ABANDONED AIRFIELD'},
  {id:'train',      name:'FREIGHT STATION'},
  {id:'harbor',     name:'HARBOR DOCKS'},
  {id:'compound',   name:'CARTEL STRONGHOLD'},
];

// Odległe, nie nakładające się origin-y (baza zajmuje x,z ∈ [-45,45]).
// Rozstaw 2500 j. — grubo ponad wymagane ~1500 j.
export const ORIGINS = {
  warehouse:  {x:2500,  z:-2500},
  outpost:    {x:5000,  z:-2500},
  street:     {x:7500,  z:-2500},
  house:      {x:10000, z:-2500},
  industrial: {x:12500, z:-2500},
  bunker:     {x:15000, z:-2500},
  airfield:   {x:17500, z:-2500},
  train:      {x:20000, z:-2500},
  harbor:     {x:22500, z:-2500},
  compound:   {x:25000, z:-2500},
};

/* --- lokalne materiały (ten sam styl low-poly box/cylinder) --- */
const whWallMat   = new THREE.MeshStandardMaterial({color:0x3a4048, roughness:.85});
const whFloorMat  = new THREE.MeshStandardMaterial({color:0x2a2f34, roughness:.95});
const sandFloorMat= new THREE.MeshStandardMaterial({color:0xc2a878, roughness:.98});
const sandbagMat  = new THREE.MeshStandardMaterial({color:0x8a7b52, roughness:1});
const towerMat    = new THREE.MeshStandardMaterial({color:0x6f6048, roughness:.9});
const roadMat     = new THREE.MeshStandardMaterial({color:0x26282c, roughness:.95});
const buildingMat = new THREE.MeshStandardMaterial({color:0x6b6f76, roughness:.9});
const windowMat   = new THREE.MeshStandardMaterial({color:0x10151c, roughness:.4, metalness:.3});
const carMat      = new THREE.MeshStandardMaterial({color:0x6a3030, roughness:.7, metalness:.2});
const doorMat     = new THREE.MeshStandardMaterial({color:0x4a3620, roughness:.8});
const hedgeMat    = new THREE.MeshStandardMaterial({color:0x2f5a34, roughness:1});
const houseWallMat= new THREE.MeshStandardMaterial({color:0xb8ac94, roughness:.9});
const houseFloorMat= new THREE.MeshStandardMaterial({color:0x6a5a44, roughness:.95});
const yardMat     = new THREE.MeshStandardMaterial({color:0x3d5230, roughness:.98});
const indMat      = new THREE.MeshStandardMaterial({color:0x4a4e54, roughness:.85});
const indFloorMat = new THREE.MeshStandardMaterial({color:0x30343a, roughness:.95});
const pipeMat     = new THREE.MeshStandardMaterial({color:0x707a82, roughness:.6, metalness:.4});
// --- materiały nowych lokacji ---
const bunkerWallMat = new THREE.MeshStandardMaterial({color:0x4b4f52, roughness:.95});
const bunkerFloorMat= new THREE.MeshStandardMaterial({color:0x33373a, roughness:.98});
const bunkerTrimMat = new THREE.MeshStandardMaterial({color:0x8a5a2a, roughness:.6, metalness:.3});
const tarmacMat   = new THREE.MeshStandardMaterial({color:0x35383d, roughness:.96});
const planeMat    = new THREE.MeshStandardMaterial({color:0x8f969c, roughness:.5, metalness:.5});
const planeWingMat= new THREE.MeshStandardMaterial({color:0x7a8188, roughness:.55, metalness:.5});
const hangarMat   = new THREE.MeshStandardMaterial({color:0x565b60, roughness:.85});
const railBedMat  = new THREE.MeshStandardMaterial({color:0x2c2a26, roughness:.98});
const railMat     = new THREE.MeshStandardMaterial({color:0x9a9ea2, roughness:.4, metalness:.7});
const sleeperMat  = new THREE.MeshStandardMaterial({color:0x3a2f24, roughness:.95});
const boxcarMat   = new THREE.MeshStandardMaterial({color:0x5a4632, roughness:.8, metalness:.1});
const boxcarMat2  = new THREE.MeshStandardMaterial({color:0x3f4a52, roughness:.8, metalness:.1});
const platformMat = new THREE.MeshStandardMaterial({color:0x585c60, roughness:.9});
const dockMat     = new THREE.MeshStandardMaterial({color:0x44484c, roughness:.92});
const waterMat    = new THREE.MeshStandardMaterial({color:0x0e2230, roughness:.35, metalness:.4});
const contRed     = new THREE.MeshStandardMaterial({color:0x8a3a2c, roughness:.85});
const contBlue    = new THREE.MeshStandardMaterial({color:0x2a5570, roughness:.85});
const contGreen   = new THREE.MeshStandardMaterial({color:0x3a6a4a, roughness:.85});
const contYellow  = new THREE.MeshStandardMaterial({color:0x9a8a3a, roughness:.85});
const craneMat    = new THREE.MeshStandardMaterial({color:0xb06a20, roughness:.6, metalness:.3});
const compoundGroundMat = new THREE.MeshStandardMaterial({color:0x6a5f48, roughness:.97});
const compoundWallMat   = new THREE.MeshStandardMaterial({color:0x9a8a70, roughness:.9});
const villaMat    = new THREE.MeshStandardMaterial({color:0xc4b498, roughness:.85});
const villaRoofMat= new THREE.MeshStandardMaterial({color:0x7a4030, roughness:.8});
const poolMat     = new THREE.MeshStandardMaterial({color:0x1a6a90, roughness:.3, metalness:.4});
// --- materiały mechanizmów interaktywnych (dźwignia) + rampy/podesty ---
const leverBaseMat  = new THREE.MeshStandardMaterial({color:0x4c5157, roughness:.7, metalness:.45});
const leverHandleMat= new THREE.MeshStandardMaterial({color:0xd23b2a, roughness:.5, metalness:.3});
const rampMat       = new THREE.MeshStandardMaterial({color:0x5a5f66, roughness:.9});

/* --- helpery budujące (współrzędne LOKALNE, origin dodawany) --- */
function makePlacer(ox, oz){
  return function box(x,y,z,w,h,d,mat,collide=false,pad=.25,rotY=0){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(ox+x, y, oz+z);
    if(rotY) m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    if(collide){ addCollider(m, pad); losOccluders.push(m); } // ściana/osłona blokuje też LOS wrogów (jak wall() w scene.js)
    return m;
  };
}
function addFloor(ox, oz, size, mat){
  const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  f.rotation.x = -Math.PI/2;
  f.position.set(ox, 0.01, oz);
  f.receiveShadow = true;
  scene.add(f);
  return f;
}
function addPointLight(ox, oz, x, y, z, color, intensity, dist){
  const L = new THREE.PointLight(color, intensity, dist, 1.8);
  L.position.set(ox+x, y, oz+z);
  scene.add(L);
  // Rejestruj do cullingu wg obszaru (jak addLamp) — inaczej użycie tego helpera
  // w przyszłości dałoby wiecznie widoczne, niecullowane światło.
  if(_currentLocationId) registerAreaLight(L, _currentLocationId);
  return L;
}
const V = (ox, oz, x, y, z) => new THREE.Vector3(ox+x, y, oz+z);

/* --- helpery WZORCA (z buildWarehouse): pełne zamknięcie + przegrody ---
   enclose(): 2 CIĄGŁE ściany boczne (x=±W/2) na całej długości + 2 ściany
   czołowe domykające oba końce. Ściany boczne dłuższe o 2T (zakładka w rogach)
   → brak "włosowych" szczelin. divider(): ściana działowa w poprzek z centralną
   (lub przesuniętą) luką na drzwi/tunel/wyłom; segmenty sięgają DOKŁADNIE do
   ściany bocznej (outer edge na osi muru = zakładka T/2 w narożnik). */
function enclose(box, W, zC, D, H, T, mat, pad){
  const half = W/2;
  box(-half, H/2, zC, T, H, D + 2*T, mat, true, pad);   // ściana zach. (cała długość)
  box( half, H/2, zC, T, H, D + 2*T, mat, true, pad);   // ściana wsch.
  box(0, H/2, zC + D/2, W, H, T, mat, true, pad);       // czoło północne (wejście)
  box(0, H/2, zC - D/2, W, H, T, mat, true, pad);       // czoło południowe (głąb)
}
function divider(box, W, z, gapC, gapHalf, H, T, mat, pad){
  const half = W/2;
  const lEdge = gapC - gapHalf, rEdge = gapC + gapHalf;
  const lw = lEdge - (-half);        // segment lewy: x∈[-half, lEdge]
  const rw = half - rEdge;           // segment prawy: x∈[rEdge, half]
  if(lw > .05) box((-half + lEdge)/2, H/2, z, lw, H, T, mat, true, pad);
  if(rw > .05) box((rEdge + half)/2, H/2, z, rw, H, T, mat, true, pad);
}

// Widoczne źródło światła: punktowe światło + świecąca „żarówka" (mesh
// MeshBasicMaterial, jak lamp() w scene.js), żeby źródła były czytelne
// wizualnie, nie tylko niewidzialne point-lighty.
function addLamp(ox, oz, x, y, z, color, intensity, dist, r=.16){
  intensity = intensity * 1.3; // globalny mnożnik jasności lamp dla WSZYSTKICH 10 lokacji (jeden punkt kontroli)
  const L = new THREE.PointLight(color, intensity, dist, 1.8);
  L.position.set(ox+x, y, oz+z);
  scene.add(L);
  // Rejestruj światło pod bieżącą lokacją (ustawianą w loadLocation) — culling
  // świateł nieaktywnych lokacji. Wszystkie addLamp() wykonują się synchronicznie
  // wewnątrz builder() wywoływanego z loadLocation, więc _currentLocationId jest aktualne.
  if(_currentLocationId) registerAreaLight(L, _currentLocationId);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), new THREE.MeshBasicMaterial({color}));
  bulb.position.set(ox+x, y, oz+z);
  scene.add(bulb);
  return L;
}

/* --- WERTYKALNOŚĆ (piętra/rampy) — TYLKO dla gracza (scene.groundHeightAt) ---
   addDeck(): płaski podest o stałym topY na całym zakresie XZ (jedno addPlatform
   + widoczna płyta). addRamp(): pochylnia jako sekwencja WĄSKICH sąsiadujących
   podestów o stopniowo rosnącym topY (płynne wchodzenie, brak "teleportu") +
   jeden widoczny, przechylony box pokrywający całą pochylnię. Wszystkie
   współrzędne LOKALNE (origin ox/oz dodawany w środku). Wrogowie NIE korzystają
   z podestów (silnik AI ma kolizję 2D i stałą wysokość gruntu) — dlatego żaden
   enemySpawnPoint nie może leżeć na rampie/podeście. */
function addDeck(ox, oz, xMin, xMax, zMin, zMax, topY, mat){
  addPlatform(ox+xMin, ox+xMax, oz+zMin, oz+zMax, topY);      // wysokość gruntu gracza
  const deck = new THREE.Mesh(new THREE.BoxGeometry(xMax-xMin, .28, zMax-zMin), mat);
  deck.position.set(ox+(xMin+xMax)/2, topY-.14, oz+(zMin+zMax)/2);  // top płyty = topY
  deck.castShadow = deck.receiveShadow = true; scene.add(deck);
  return deck;
}
function addRamp(ox, oz, xMin, xMax, zBottom, zTop, yTop, steps, mat){
  // Wchodzenie od zBottom (topY≈0) do zTop (topY=yTop). zTop jest zwykle bardziej
  // ujemne (głębiej). Każdy próg = yTop/steps (mały → płynnie). Zakresy Z stykają
  // się bez dziur (kolejny start = poprzedni koniec).
  const d = (zBottom - zTop) / steps;          // >0 gdy zTop bardziej ujemne
  for(let i=0; i<steps; i++){
    const zA = zBottom - i*d;                  // bliżej zBottom
    const zB = zBottom - (i+1)*d;              // bliżej zTop
    addPlatform(ox+xMin, ox+xMax, oz+Math.min(zA,zB), oz+Math.max(zA,zB), yTop*(i+1)/steps);
  }
  // widoczna pochylnia: jeden przechylony box na całą długość (kryje "schodki")
  const len = Math.hypot(zBottom - zTop, yTop);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(xMax-xMin, .28, len), mat);
  ramp.position.set(ox+(xMin+xMax)/2, yTop/2, oz+(zBottom+zTop)/2);
  ramp.rotation.x = Math.atan2(yTop, zBottom - zTop);  // +z (zBottom) w dół, -z (zTop) w górę
  ramp.castShadow = ramp.receiveShadow = true; scene.add(ramp);
  return ramp;
}

/* ============================================================
   STAN
============================================================ */
const built = {};        // id -> wynik loadLocation (cache/idempotencja)
let houseDoor = null;     // { pivot, mesh, colliderBox, center:THREE.Vector3, breached }
// Id lokacji aktualnie budowanej (ustawiany w loadLocation przed builder()).
// addLamp() rejestruje pod nim swoje światła — jeden punkt zamiast taga w każdej
// z 10 funkcji build*, i klucz jest GWARANTOWANIE równy m.locationId z missions.js.
let _currentLocationId = null;

/* Bramy sterowane etapowo (Część 2). gates[id] = {mesh, colliderBox,
   opened, baseY, rise}. openGate(id) usuwa kolizję i podnosi bramę;
   dla id bez bramy = bezpieczny no-op (return false). Rejestrowane są
   przy budowie lokacji tylko dla WYBRANYCH lokacji i blokują wyłącznie
   OPCJONALNE skróty/boczne przejścia — nigdy jedynej drogi do strefy —
   żeby misja była przechodliwa nawet zanim missions.js wywoła openGate. */
const gates = {};
function registerGate(id, mesh, rise){
  addCollider(mesh, .3);
  losOccluders.push(mesh);              // zamknięta brama blokuje też LOS wrogów
  gates[id] = {
    mesh, colliderBox: colliders[colliders.length - 1],
    opened: false, baseY: mesh.position.y, rise: rise || 3.4,
  };
}
function resetGate(id){                 // przywróć zamknięty stan przy replayu
  const g = gates[id];
  if(!g || !g.opened) return;
  g.opened = false;
  if(colliders.indexOf(g.colliderBox) < 0) colliders.push(g.colliderBox);
  if(losOccluders.indexOf(g.mesh) < 0) losOccluders.push(g.mesh); // przywróć blokadę LOS przy replayu
  g.mesh.position.y = g.baseY;
}

/* ============================================================
   DŹWIGNIE — brama otwierana PRZEZ GRACZA ([F]), nie automatycznie po fali.
   Odpowiednik gates/openGate, ale wyzwalany interakcją. levers[] trzyma:
   {locationId, gateId, handlePivot (obracana rączka), worldPos, used}.
   Dźwignia po prostu WYWOŁUJE openGate(gateId) — reużywa całej mechaniki bram.
   gateId ≠ locationId (żeby missions.js:openGate(locationId) NIE otwierał jej
   automatycznie między etapami — otwiera ją tylko gracz).
============================================================ */
const levers = [];
function makeLeverMesh(ox, oz, x, z, rotY){
  const grp = new THREE.Group();
  grp.position.set(ox+x, 0, oz+z);
  grp.rotation.y = rotY || 0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .7), leverBaseMat);
  base.position.set(0, .25, 0);
  const post = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.1, .2), leverBaseMat);
  post.position.set(0, .85, 0);
  const pivot = new THREE.Group();       // oś obrotu rączki (~1.3 nad podłogą)
  pivot.position.set(0, 1.3, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .9, 8), leverHandleMat);
  handle.position.set(0, .45, 0);        // rączka wystaje od osi w górę
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 10), leverHandleMat);
  knob.position.set(0, .9, 0);
  pivot.add(handle); pivot.add(knob);
  pivot.rotation.x = -0.55;              // pozycja startowa: rączka odchylona "do góry/tyłu"
  grp.add(base); grp.add(post); grp.add(pivot);
  grp.traverse(o => { if(o.isMesh){ o.castShadow = o.receiveShadow = true; } });
  scene.add(grp);
  return pivot;
}
function registerLever(locationId, gateId, ox, oz, x, z, rotY){
  const handlePivot = makeLeverMesh(ox, oz, x, z, rotY);
  levers.push({
    locationId, gateId, handlePivot,
    worldPos: new THREE.Vector3(ox+x, 1.3, oz+z),
    used: false,
  });
}
function resetLevers(id){                // replay: rączka do góry + brama zamknięta
  for(const lv of levers){
    if(lv.locationId !== id) continue;
    if(lv.used){ lv.used = false; lv.handlePivot.rotation.x = -0.55; }
    resetGate(lv.gateId);                 // no-op jeśli brama nieotwarta
  }
}
// Analogiczne do tryBreachDoor: "nic nie rób" gdy poza zasięgiem (~2.3 j.).
// Znajduje najbliższą NIEUŻYTĄ dźwignię w zasięgu, otwiera jej bramę, animuje
// pociągnięcie rączki, zwraca true/false.
export function tryPullLever(playerPos){
  if(!playerPos) return false;
  let best = null, bestD = 2.3*2.3;
  for(const lv of levers){
    if(lv.used) continue;
    const dx = playerPos.x - lv.worldPos.x, dz = playerPos.z - lv.worldPos.z;
    const d2 = dx*dx + dz*dz;
    if(d2 < bestD){ bestD = d2; best = lv; }
  }
  if(!best) return false;
  best.used = true;
  openGate(best.gateId);                  // reużycie mechaniki bram
  // animacja: obrót rączki w dół (pociągnięcie)
  const piv = best.handlePivot;
  const startX = piv.rotation.x, targetX = 0.9;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const dur = 300;
  function pull(now){
    const p = Math.min(1, (now - t0) / dur);
    piv.rotation.x = startX + (targetX - startX) * (1 - (1-p)*(1-p));  // easeOutQuad
    if(p < 1 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(pull);
  }
  if(typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(pull);
  else piv.rotation.x = targetX;
  return true;
}

// Jak tryPullLever, ale TYLKO odczyt — do pokazania podpowiedzi [F] bez ciągnięcia dźwigni.
export function nearLever(playerPos){
  if(!playerPos) return false;
  for(const lv of levers){
    if(lv.used) continue;
    const dx = playerPos.x - lv.worldPos.x, dz = playerPos.z - lv.worldPos.z;
    if(dx*dx + dz*dz < 2.3*2.3) return true;
  }
  return false;
}

/* ============================================================
   1. MAGAZYN PORTOWY (warehouse) — wnętrze, ciasne uliczki skrzyń
============================================================ */
function buildWarehouse(){
  const O = ORIGINS.warehouse, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK: 4 GENUINE zamknięte pomieszczenia (nie jedna hala z parawanem) ===
  //   STREFA 1 wejście   z:[ 8, 18]  (spawn)
  //   STREFA 2 hala      z:[-8,  8]  (etap 1)
  //   TUNEL (wąski, 2 j. prześwitu) z:[-14,-8]
  //   STREFA 3 magazyn   z:[-26,-14] (etap 2, "uszkodzona" sekcja)
  //   WYŁOM (wysadzona ściana, szeroki)  z=-26
  //   STREFA 4 rampa     z:[-40,-26] (etap 3, finał)
  // Cała lokacja: x∈[-14,14] (28 szer.), z∈[-40,18] (58 gł.) — STAŁA szerokość,
  // więc jeden precyzyjny prostokąt podłogi (box, nie addFloor) pokrywa DOKŁADNIE
  // grywalny obszar, zero marnowanej przestrzeni.
  const H = 7, T = .8, TP = 1;
  box(0, .02, -11, 28, .04, 58, whFloorMat);              // podłoga — dokładnie x∈[-14,14], z∈[-40,18]

  // --- obwód: w pełni zamknięty (brak wyjścia na zewnątrz — gracz startuje w środku) ---
  box(-14, H/2, -11, TP, H, 58, whWallMat, true, .3);      // ściana zachodnia (cała długość)
  box( 14, H/2, -11, TP, H, 58, whWallMat, true, .3);      // ściana wschodnia (cała długość)
  box(0, H/2, 18, 28, H, TP, whWallMat, true, .3);         // tylna ściana STREFY 1 (domyka na północy)
  box(0, H/2, -40, 28, H, TP, whWallMat, true, .3);        // ściana czołowa STREFY 4 (domyka na południu)

  // --- przegroda 1/2: STREFA1 → STREFA2, drzwi x:[-1.5,1.5] ---
  box(-7.75, H/2, 8, 12.5, H, T, whWallMat, true, .3);     // x:-14..-1.5
  box( 7.75, H/2, 8, 12.5, H, T, whWallMat, true, .3);     // x:1.5..14

  // --- przegroda 2/tunel: STREFA2 → TUNEL, wąska luka x:[-1,1] (motyw #1) ---
  box(-7.5, H/2, -8, 13, H, T, whWallMat, true, .3);       // x:-14..-1
  box( 7.5, H/2, -8, 13, H, T, whWallMat, true, .3);       // x:1..14
  // ściany samego tunelu (prześwit x:[-1,1] ≈2 j. — jednoosobowy korytarz),
  // zakładka ~.2-.6 na przegrody z obu stron (patrz bunkier — dyscyplina styków)
  box(-1.4, H/2, -11, T, H, 6.4, whWallMat, true, .3);     // z:-14.2..-7.8
  box( 1.4, H/2, -11, T, H, 6.4, whWallMat, true, .3);
  for(const z of [-9,-10.5,-12,-13.5]) box(0, H-.3, z, 2.3, .5, .12, whWallMat); // niska belka nad tunelem (deko, klaustrofobia)

  // --- WYŁOM: STREFA3 → STREFA4, szeroka "wysadzona" luka x:[-3,3] (motyw #3) ---
  box(-8.5, H/2, -26, 11, H, T, whWallMat, true, .3);      // x:-14..-3
  box( 8.5, H/2, -26, 11, H, T, whWallMat, true, .3);      // x:3..14
  // gruz i postrzępione krawędzie wokół wyłomu (czysto wizualne, bez kolizji)
  box(-2.2, .4, -25.3, 1.6, .8, 1.6, crateMat, false, 0, .4);
  box( 1.8, .3, -24.6, 1.3, .6, 1.3, crateMat, false, 0, .8);
  box(0, H-1.3, -26, 6.4, 1.2, .3, whWallMat, false, 0, .08); // wisząca, wyszczerbiona krawędź nadproża

  // --- belki stropowe (dekoracja, po każdej strefie) ---
  for(const bz of [14, 2,-4, -18,-22, -30,-36]) box(0, H-.4, bz, 27, .4, .4, whWallMat);

  // === STREFA 1 — wejście: minimalna, spokojna (brak wrogów) ===
  box(-10, 1.1, 12, 1.8, 2.2, 1.6, crateMat, true, .25);
  box( 10, .9, 14, 2.4, 1.8, 1.3, doorMat, true, .25);     // skrzynia z ładunkiem
  box(0, 3.3, 17.4, 6, 1.6, .15, whWallMat);               // zamknięta roleta doku (deko, tylna ściana)

  // === STREFA 2 — główna hala (etap 1): 2 rzędy skrzyń, czytelne alejki ===
  const bay2 = [[-9,4,1.8,true],[9,4,1.8,true],[-9,-4,2,false],[9,-4,2,false],[0,0,1.6,false]];
  for(const [x,z,s,stack] of bay2){
    box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.5);
    if(stack) box(x, s+s/2, z, s*.85, s*.85, s*.85, crateMat, false, 0, Math.random()*.5);
  }

  // === STREFA 3 — "uszkodzona" sekcja (etap 2): rozrzut po przekątnej, gruz ===
  const bay3 = [[-8,-16,1.8],[6,-18,2],[-4,-22,1.6],[10,-15,1.4],[-11,-23,1.7]];
  for(const [x,z,s] of bay3) box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.8);
  box(-12, .3, -20, 2.4, .6, .6, pipeMat);                 // pęknięta rura (deko)
  box(3, .2, -25, 1.6, .4, 2.0, whWallMat, false, 0, .3);  // fragment zawalonej ściany na ziemi

  // === STREFA 4 — rampa końcowa (etap 3, finał): otwarta, dramatyczna ===
  box(-9, 1.4, -32, 2.2, 2.8, 2, crateMat, true, .25);
  box( 9, 1.4, -32, 2.2, 2.8, 2, crateMat, true, .25);
  box(0, .5, -37, 4, 1.0, 3, doorMat, true, .3);           // wielka skrzynia ładunkowa na rampie
  {
    // wiszący hak dźwigu nad rampą finałową
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.6,6), pipeMat);
    chain.position.set(ox, H-.6, oz-30); scene.add(chain);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.35,.09,6,12), pipeMat);
    hook.position.set(ox, H-2.9, oz-30); hook.rotation.x=Math.PI/2; scene.add(hook);
  }

  // --- drobne detale atmosferyczne rozsiane po lokacji ---
  box(-13, .15, 13, 2.0, .3, 1.3, doorMat);                // paleta (strefa 1)
  box(12.7, 2, -3, .5, 3.6, 4, whWallMat);                 // regał magazynowy (strefa 2)
  box(12.5, .9, -3, .75, .1, 3.6, doorMat);                // półka
  for(const [bx,bz] of [[-12.5,-19],[12,-30]]){            // beczki
    const br = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1.2,12), pipeMat);
    br.position.set(ox+bx, .6, oz+bz); br.castShadow=true; scene.add(br);
  }
  box(-13.4, 2.4, -34, 1.5, 1.3, .12, windowMat);          // tablica/plakat (strefa 4)

  // === OŚWIETLENIE: gęste, własne per strefa (12 świateł, było 9) ===
  addLamp(ox, oz, 0, H-.4, 14, 0xffd9a8, 15, 22);    // strefa 1 (ciepłe, wejście)
  addLamp(ox, oz, 0, H-.4, 8.5, 0xfff0d0, 12, 16);   // nad drzwiami 1/2
  addLamp(ox, oz,-8, H-.4, 4, 0xffcaa0, 14, 22);     // strefa 2 L
  addLamp(ox, oz, 8, H-.4, -3, 0xffcaa0, 14, 22);    // strefa 2 P
  addLamp(ox, oz, 0, H-1.2, -11, 0xff9868, 8, 12);   // tunel (przyćmione, klaustrofobia)
  addLamp(ox, oz,-8, H-.4,-17, 0xff5a3c, 13, 22);    // strefa 3 (czerwone, "uszkodzona")
  addLamp(ox, oz, 8, H-.4,-22, 0xff5a3c, 12, 22);
  addLamp(ox, oz, 0, H-.4,-26, 0xffb070, 10, 16);    // przy wyłomie
  addLamp(ox, oz,-9, H-.4,-31, 0xbfd4ff, 14, 24);    // strefa 4 (chłodne, finałowe)
  addLamp(ox, oz, 9, H-.4,-31, 0xbfd4ff, 14, 24);
  addLamp(ox, oz, 0, H-.4,-37, 0xd8e0ff, 12, 20);
  addLamp(ox, oz,-13, H-.4, 0, 0xffcaa0, 10, 18);    // przy regale (strefa 2)

  const spawnPoint = V(ox, oz, 0, 1.7, 15);
  // uszeregowane strefa po strefie (2 → 3 → 4), zgodnie z kolejnością etapów
  const enemySpawnPoints = [
    [-6.5,5],[11.5,5],[-8.7,-1.4],[9.3,-1.4],[0.2,2.3],      // STREFA 2 (etap 1) — 5 pkt
    [-7.7,-13.5],[7.3,-15.4],[-1.6,-21],[10.2,-12.8],[-8.5,-24], // STREFA 3 (etap 2) — 5 pkt
    [-9,-29],[9,-29],[-6,-35],[6,-35],[0,-32],[3.3,-38],     // STREFA 4 (etap 3) — 6 pkt
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-9,4],[9,4],[-9,-4],[9,-4],[0,0],
    [-8,-16],[6,-18],[-4,-22],[10,-15],
    [-9,-32],[9,-32],[0,-37],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   2. PUSTYNNY POSTERUNEK (outpost) — otwarty, worki z piaskiem, wieża
============================================================ */
function buildOutpost(){
  const O = ORIGINS.outpost, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: forteca pustynna, W PEŁNI ZAMKNIĘTA ===
  // Cała lokacja: x∈[-15,15] (30 szer.), z∈[-40,16] (56 gł.) — STAŁA szerokość,
  // podłoga JEDNYM prostokątem box() pokrywa dokładnie grywalny obszar.
  //   ENTRY   brama/wjazd    z:[  6, 16] (spawn, brak wrogów)
  //   STREFA1 dziedziniec    z:[ -8,  6]  etap1 — drzwi (luka 3 j.)
  //   STREFA2 koszary        z:[-24, -8]  etap2 — WĄSKI TUNEL (2.2 j.)
  //   STREFA3 dowództwo      z:[-40,-24]  etap3 — WYŁOM (6 j. + gruz)
  const W = 30, H = 6, T = .8, TP = 1;
  const zC = -12, D = 56;
  box(0, .02, zC, W, .04, D, sandFloorMat);              // podłoga — dokładnie x∈[-15,15], z∈[-40,16]
  enclose(box, W, zC, D, H, TP, towerMat, .3);           // obwód zamknięty (adobe)

  // --- przegrody między strefami ---
  divider(box, W, 6, 0, 1.5, H, T, towerMat, .3);        // ENTRY→S1: drzwi (luka x:-1.5..1.5)
  divider(box, W, -8, 0, 1.1, H, T, towerMat, .3);       // S1→S2: tunel (luka x:-1.1..1.1)
  box(-1.5, H/2, -11, T, H, 6.4, towerMat, true, .3);    // ściany tunelu (z:-14.2..-7.8), prześwit x:[-1.1,1.1]
  box( 1.5, H/2, -11, T, H, 6.4, towerMat, true, .3);
  divider(box, W, -24, 0, 3, H, T, towerMat, .3);        // S2→S3: przejście (luka x:-3..3)
  box(-2.4, .5, -23.3, 1.8, 1.0, 1.6, sandbagMat, false, 0, .3);  // gruz przy bramie
  box( 2.0, .35, -22.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.2, -24, 6.2, 1.1, .3, towerMat, false, 0, .1);       // nadproże bramy
  // >>> DŹWIGNIA (Część A): stalowa brama do DOWÓDZTWA (S3) na GŁÓWNEJ drodze;
  //     dźwignia stoi w koszarach (S2), WIDOCZNA zanim gracz dojdzie do bramy. <<<
  {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 4.8, .6), bunkerTrimMat);
    gate.position.set(ox, 2.4, oz-24);
    gate.castShadow = gate.receiveShadow = true; scene.add(gate);
    registerGate('outpost_lever', gate, 5.2);
  }
  registerLever('outpost', 'outpost_lever', ox, oz, 3, -20.5, 0);  // pulpit dźwigni w S2

  // === ENTRY — wjazd: szlaban, tablica, skrzynka (brak wrogów) ===
  box(-5, 2.4, 12, .6, 4.8, .6, towerMat, true, .3);     // słup bramy L
  box( 5, 2.4, 12, .6, 4.8, .6, towerMat, true, .3);     // słup bramy P
  box(0, 4.6, 12, 10.6, .5, .5, towerMat);               // belka szlabanu (deko)
  box(0, 3.9, 12, 3, .9, .25, carMat);                   // tablica ostrzegawcza (deko)
  box(-12, .35, 13, 1.4, .7, .9, crateMat);              // skrzynka amunicji (deko)

  // === STREFA1 — dziedziniec (etap1): worki z piaskiem, wrak jeepa ===
  for(const [x,z] of [[-9,2],[9,0],[-3,-5],[6,-3]]) box(x, .7, z, 5, 1.4, 1.2, sandbagMat, true, .25, Math.random()*.4);
  box(11, .55, 3, 4.0, 1.1, 1.9, carMat, true, .3, .2);  // wrak jeepa (osłona)
  box(11, 1.5, 3.4, 2.4, .9, 1.6, carMat, false, 0, .2); // kabina jeepa (deko)
  { const br = new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,1.3,12), pipeMat);
    br.position.set(ox-12, .65, oz-3); br.castShadow=true; scene.add(br); }  // beczka

  // === STREFA2 — koszary (etap2): prycze/skrzynie + wieża obserwacyjna w rogu ===
  // UWAGA: żaden z tych x nie może być bliżej niż ~2j. od x=0 w zakresie z:[-14.2,-7.8]
  // — to prześwit tunelu S1→S2 (szer. 2.2j.); skrzynia na środku by go całkowicie zatkała.
  for(const [x,z,s] of [[-11,-11,1.8],[11,-13,2],[-5,-20,1.6],[7,-18,1.8],[3.5,-17,1.4]])
    box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.6);
  box(-13.5, 1.0, -12, 2.6, 2.0, 1.0, sandbagMat, false, 0, .2); // prycza (deko)
  {
    const tx = 12, tz = -21;                             // wieża obserwacyjna (podstawa koliduje)
    for(const [dx,dz] of [[-1.2,-1.2],[1.2,-1.2],[-1.2,1.2],[1.2,1.2]]){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,5,8), towerMat);
      leg.position.set(ox+tx+dx, 2.6, oz+tz+dz); leg.castShadow=true; scene.add(leg);
    }
    box(tx, 5.1, tz, 3.0, .3, 3.0, towerMat);            // platforma (deko)
    box(tx, 1.0, tz, 2.0, 2.0, 2.0, towerMat, true, .3); // podstawa (kolizja)
  }

  // === STREFA3 — dowództwo (etap3, finał): namiot sztabowy, radiostacja ===
  box(-10, 1.4, -32, 2.2, 2.8, 2, crateMat, true, .25);
  box( 10, 1.4, -32, 2.2, 2.8, 2, crateMat, true, .25);
  box(0, 1.2, -37, 4.4, 2.4, 3.2, sandbagMat, false, 0, .2);  // namiot sztabowy (bryła, deko)
  box(0, 2.5, -37, 4.6, .5, 3.4, carMat, false, 0, .2);       // dach namiotu (deko)
  box(-12, .7, -35, 1.6, 1.4, .9, indMat, true, .25);         // radiostacja (osłona)
  box(-13.4, 2.4, -34, 1.5, 1.3, .12, windowMat);             // mapa/tablica (deko)

  // === OŚWIETLENIE: 11 świateł, własne per strefa (ciepłe→czerwone→chłodne) ===
  addLamp(ox, oz, 0, H-.4, 13, 0xffe6b0, 14, 24);   // entry (ciepłe)
  addLamp(ox, oz, 0, H-.4, 6, 0xfff0c8, 12, 18);    // brama
  addLamp(ox, oz,-9, H-.4, 0, 0xffdca0, 13, 22);    // S1 L
  addLamp(ox, oz, 9, H-.4, -2, 0xffdca0, 13, 22);   // S1 P
  addLamp(ox, oz, 0, H-1.0, -11, 0xff9868, 8, 12);  // tunel (przyćmione)
  addLamp(ox, oz,-9, H-.4,-14, 0xffb888, 12, 22);   // S2 L
  addLamp(ox, oz, 9, H-.4,-18, 0xffb888, 12, 22);   // S2 P
  addLamp(ox, oz, 0, H-.4,-24, 0xffb070, 10, 16);   // przy wyłomie
  addLamp(ox, oz,-9, H-.4,-31, 0xff6a48, 13, 22);   // S3 (czerwone, finał)
  addLamp(ox, oz, 9, H-.4,-31, 0xff6a48, 12, 22);
  addLamp(ox, oz, 0, H-.4,-37, 0xbfd4ff, 12, 20);   // S3 głąb (chłodne)

  const spawnPoint = V(ox, oz, 0, 1.7, 12);
  // uszeregowane strefa po strefie (S1 → S2 → S3), zgodnie z etapami
  const enemySpawnPoints = [
    [-10.4,-0.7],[9.9,-2.7],[-3.5,-2.3],[5.6,-5.7],[0,-2],  // S1 (etap1) 5
    [-8.5,-11],[11.5,-10.4],[-4.6,-17.7],[9.5,-18],[-0.4,-17.2], // S2 (etap2) 5
    [-11,-29.8],[11,-29.8],[-6,-36],[6,-36],[0,-33],[0,-27], // S3 (etap3) 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-9,2],[9,0],[-3,-5],[6,-3],
    [-11,-11],[11,-13],[-5,-20],[7,-18],
    [-10,-32],[10,-32],[-12,-35],[0,-37],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   3. ULICA MIEJSKA (street) — korytarz ulicy, fasady, wraki aut
============================================================ */
function buildStreet(){
  const O = ORIGINS.street, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: kanion ulicy, ZAMKNIĘTY na obu końcach ===
  // Cała lokacja: x∈[-14,14] (28 szer.), z∈[-40,16] (56 gł.) — STAŁA szerokość.
  // Ściany boczne = ciągłe fasady kamienic (obwód). Podłoga JEDNYM box().
  //   ENTRY   skrzyżowanie   z:[  6, 16] (spawn)
  //   STREFA1 jezdnia         z:[ -8,  6]  etap1 — brama-wrak (drzwi 3 j.)
  //   STREFA2 plac targowy    z:[-24, -8]  etap2 — TUNEL podziemny (2.2 j.)
  //   STREFA3 ślepy zaułek    z:[-40,-24]  etap3 — WYŁOM w kamienicy (6 j.)
  const W = 28, H = 9, T = .8, TP = 1, half = W/2;
  const zC = -12, D = 56;
  box(0, .02, zC, W, .04, D, roadMat);                   // jezdnia — dokładnie x∈[-14,14], z∈[-40,16]
  enclose(box, W, zC, D, H, TP, buildingMat, .3);        // pierzeje (obwód zamknięty)
  // okna wpuszczone w fasady (deko)
  for(const wz of [12, 2, -4, -14, -20, -30, -36]){
    for(const wy of [3, 6]){
      box(-half+.55, wy, wz, .15, 1.2, 1.0, windowMat);
      box( half-.55, wy, wz, .15, 1.2, 1.0, windowMat);
    }
  }
  for(const gz of [8,-2,-12,-26,-34]){                   // gzymsy/balkony (deko)
    box(-half+.7, 7.2, gz, .5, .3, 2.0, buildingMat);
    box( half-.7, 7.2, gz, .5, .3, 2.0, buildingMat);
  }

  // --- przegrody między strefami ---
  // === ZAKRĘT: przejścia między strefami są PRZESUNIĘTE na przeciwne boki, więc
  //     trasa ZYGZAKUJE (środek → zachód → wschód) zamiast biec prosto wzdłuż Z. ===
  divider(box, W, 6, 0, 1.5, H, T, buildingMat, .3);     // ENTRY→S1 (drzwi, środek)
  divider(box, W, -8, -8, 1.1, H, T, buildingMat, .3);   // S1→S2 (tunel PRZY ZACHODNIEJ pierzei, luka x:-9.1..-6.9)
  box(-9.5, H/2, -11, T, H, 6.4, buildingMat, true, .3); // ściany tunelu podziemnego (prześwit x:[-9.1,-6.9])
  box(-6.5, H/2, -11, T, H, 6.4, buildingMat, true, .3);
  for(const z of [-9,-10.5,-12,-13.5]) box(-8, H-.4, z, 2.3, .5, .12, buildingMat); // strop tunelu (deko)
  divider(box, W, -24, 8, 3, H, T, buildingMat, .3);     // S2→S3 (wyłom PRZY WSCHODNIEJ pierzei, luka x:5..11)
  box(6.7, .5, -23.3, 1.8, 1.0, 1.6, buildingMat, false, 0, .3);   // gruz wyłomu
  box(9.5, .35, -22.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(8, H-1.5, -24, 6.2, 1.3, .3, buildingMat, false, 0, .1);     // zerwane nadproże

  // === ENTRY — skrzyżowanie: sygnalizator, chodnik, kiosk (brak wrogów) ===
  box(-6.5, .15, 11, 1, .3, 10, buildingMat);            // krawężnik L
  box( 6.5, .15, 11, 1, .3, 10, buildingMat);            // krawężnik P
  { const tl = new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,5,8), buildingMat);
    tl.position.set(ox+6, 2.5, oz+12); scene.add(tl);
    box(6, 4.8, 12, .5, 1.2, .4, windowMat); }            // sygnalizator (deko)
  box(-6.2, .9, 13, 1.0, 1.8, .8, buildingMat);           // kiosk (deko)

  // === STREFA1 — jezdnia (etap1): wraki aut jako osłony ===
  for(const [x,z,r] of [[-3,2,.2],[3,-2,-.3],[-4,-5,.1]]){
    box(x, .5, z, 4.2, 1.0, 1.9, carMat, true, .3, r);   // nadwozie
    box(x, 1.45, z, 2.6, .9, 1.7, carMat, false, 0, r);  // kabina
  }
  box(1.6, .55, 5, 1.2, 1.1, 1.0, buildingMat, true, .25); // bloczek betonowy przy bramie-wraku
  { const hyd = new THREE.Mesh(new THREE.CylinderGeometry(.2,.24,1.0,8), carMat);
    hyd.position.set(ox-6.2, .5, oz-1); scene.add(hyd); }   // hydrant (deko)

  // === STREFA2 — plac targowy (etap2): stragany, kontener, wrak ===
  for(const [x,z,s] of [[-10,-11,1.8],[10,-13,2],[-4,-20,1.6],[6,-17,1.8],[0,-15,1.4]])
    box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.5);
  box(-12, .9, -18, 1.6, 1.8, 1.4, indMat, true, .25);     // kontener na śmieci
  box(11, .5, -20, 4.0, 1.0, 1.9, carMat, true, .3, .3);   // wrak (osłona)
  box(11, 1.4, -20, 2.4, .8, 1.7, carMat, false, 0, .3);

  // === STREFA3 — ślepy zaułek (etap3, finał): barykada, gruzowisko ===
  box(-9, 1.4, -32, 2.2, 2.8, 2, buildingMat, true, .25);
  box( 9, 1.4, -32, 2.2, 2.8, 2, buildingMat, true, .25);
  box(0, .9, -30, 6, 1.8, 1.2, sandbagMat, true, .25);     // barykada w poprzek zaułka (osłona)
  box(-11, .7, -36, 2.6, 1.4, 1.8, buildingMat, false, 0, .3); // hałda gruzu (deko)
  box(12, .12, -34, .8, .24, 1.2, doorMat);                // śmieci (deko)

  // === OŚWIETLENIE: 11 świateł (latarnie + strefy), ciepłe→chłodne ===
  addLamp(ox, oz, 0, 6.8, 13, 0xffd090, 13, 26);   // entry (ciepłe)
  addLamp(ox, oz, -6.8, 5.6, 8, 0xffcf80, 11, 20, .13); // latarnia entry
  addLamp(ox, oz, 1.5, 4.6, 6, 0xffe0a0, 11, 18);  // brama-wrak
  addLamp(ox, oz, -6, 6.0, -2, 0xffd8a0, 12, 22);  // S1
  addLamp(ox, oz, -8, 5.4, -11, 0xff9868, 8, 14);  // tunel (zachód — zakręt)
  addLamp(ox, oz, -8, 6.0, -14, 0xffcf9a, 12, 22); // S2 L
  addLamp(ox, oz, 8, 6.0, -18, 0xffcf9a, 12, 22);  // S2 P
  addLamp(ox, oz, 8, 6.0, -24, 0xffb070, 10, 16);  // wyłom (wschód — zakręt)
  addLamp(ox, oz, -8, 6.5, -31, 0x9fd0ff, 12, 24); // S3 (chłodne)
  addLamp(ox, oz, 8, 6.5, -31, 0x9fd0ff, 12, 24);
  addLamp(ox, oz, 0, 6.5, -37, 0xbfd4ff, 12, 22);

  const spawnPoint = V(ox, oz, 0, 1.7, 12);
  const enemySpawnPoints = [
    [-6.6,2.4],[6.6,-2],[-3.5,-2.6],[4,4],[-0.7,-0.6],     // S1 5
    [-11.3,-13.4],[10.5,-10.4],[-3.6,-17.7],[6.5,-14.6],[2.2,-15], // S2 5
    [-9,-29.8],[9,-29.8],[-5,-36],[5,-36],[0,-33],[0,-27], // S3 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-3,2],[3,-2],[-4,-5],[1.6,5],
    [-10,-11],[10,-13],[-4,-20],[6,-17],
    [-9,-32],[9,-32],[0,-30],[-11,-36],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   4. DOM NA WZGÓRZU (house) — start NA ZEWNĄTRZ, wyważ drzwi, szturm
============================================================ */
function buildHouse(){
  const O = ORIGINS.house, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: posiadłość W PEŁNI ZAMKNIĘTA murem ===
  // Gracz startuje NA ZEWNĄTRZ (ogrodzony dziedziniec), wyważa drzwi [F] i
  // szturmuje wnętrze. Cała lokacja: x∈[-13,13] (26 szer.), z∈[-34,16] (50 gł.).
  //   OGRÓD   (entry, spawn na zewnątrz) z:[  2, 16]  — brak wrogów
  //   >>> DRZWI WYWAŻALNE w ścianie frontowej z=2 (mechanizm houseDoor) <<<
  //   SALON        z:[ -8,  2]  etap1 — drzwi wewn. (2.6 j., przesunięte)
  //   HOL/KUCHNIA  z:[-20, -8]  etap2 — WYŁOM w ścianie (5 j.)
  //   SYPIALNIE    z:[-34,-20]  etap3
  const W = 26, H = 6, T = .8, TP = 1;
  const zC = -9, D = 50;
  box(0, .02, zC, W, .04, D, yardMat);                   // grunt — x∈[-13,13], z∈[-34,16]
  box(0, .03, -16, W-1.6, .04, 36, houseFloorMat);       // podłoga wnętrza (deski) z:[-34,2]
  enclose(box, W, zC, D, H, TP, houseWallMat, .3);       // mur posiadłości (zamknięty)
  box(0, 6.3, -16, W+1, .4, 37, houseWallMat);           // dach domu nad wnętrzem (deko)

  // --- ściana frontowa domu (z=2) z LUKĄ na drzwi (x:-0.6..0.6) ---
  divider(box, W, 2, 0, .6, H, T, houseWallMat, .3);
  // --- przegrody pokoi ---
  divider(box, W, -8, -3, 1.3, H, T, houseWallMat, .3);  // SALON→HOL: drzwi przesunięte w lewo (2.6 j.)
  divider(box, W, -20, 0, 2.5, H, T, houseWallMat, .3);  // HOL→SYPIALNIE: WYŁOM (5 j.)
  box(-3, .5, -19.3, 1.8, 1.0, 1.6, houseWallMat, false, 0, .3); // gruz wyłomu
  box( 2.4, .35, -20.6, 1.4, .7, 1.2, crateMat, false, 0, .7);

  // --- DRZWI (wyważalne) na zawiasie przy lewej krawędzi luki (x=-0.6, z=2) ---
  const pivot = new THREE.Group();
  pivot.position.set(ox - 0.6, 0, oz + 2);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, .12), doorMat);
  doorMesh.position.set(0.6, 1.05, 0);     // przesunięcie od zawiasu (pół szerokości)
  doorMesh.castShadow = doorMesh.receiveShadow = true;
  pivot.add(doorMesh);
  scene.add(pivot);
  // klamka (dekoracja)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.07,8,8), new THREE.MeshStandardMaterial({color:0xd8c060, metalness:.6, roughness:.3}));
  knob.position.set(1.05, 1.05, .1); pivot.add(knob);
  // kolizja drzwi (blokuje wejście do czasu wyważenia)
  addCollider(doorMesh, .15);
  losOccluders.push(doorMesh);              // zamknięte drzwi blokują też LOS wrogów
  const colliderBox = colliders[colliders.length - 1];
  houseDoor = {
    pivot, mesh: doorMesh, colliderBox,
    center: new THREE.Vector3(ox, 1.05, oz + 2),
    breached: false,
  };

  // === OGRÓD (entry, spawn na zewnątrz): ścieżka, żywopłoty, latarnia ===
  box(0, .06, 9, 2.4, .12, 12, houseFloorMat);           // ścieżka do drzwi
  for(const [x,z,w] of [[-8,10,3],[8,10,3],[-8,5,3],[8,5,3]]) box(x, .7, z, w, 1.4, .8, hedgeMat, true, .2);
  box(-11, .5, 13, 1.4, 1.0, .8, doorMat, false, 0, .1); // skrzynka/ławka (deko)
  { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,1.8,6), towerMat);
    lamp.position.set(ox+9, .9, oz+12); scene.add(lamp); } // latarnia ogrodowa (deko)

  // === SALON (etap1): regał (osłona), kanapa, ława, dywan ===
  box(-8, 1.0, -4, 2.4, 2.0, 1.1, crateMat, true, .25);  // regał (osłona)
  box(8, .8, -5, 2.4, 1.6, 1.2, doorMat, false, 0, .1);  // kanapa (deko)
  box(0, .5, -3, 1.8, 1.0, .9, doorMat);                 // ława (deko)
  box(0, .03, -4, 6, .04, 5, hedgeMat);                  // dywan (deko, płaski)
  box(-11.6, 3.4, -4, .1, 1.2, 1.6, windowMat);          // obraz (deko)

  // === HOL/KUCHNIA (etap2): szafka, lodówka (osłony), stół, komoda ===
  box(-9, 1.0, -13, 2.0, 2.0, 1.0, crateMat, true, .25); // szafka wysoka (osłona)
  box(9, 1.0, -16, 1.8, 2.0, 1.6, indMat, true, .25);    // lodówka (osłona)
  box(0, .9, -14, 2.6, .12, 1.4, doorMat);               // stół (deko)
  box(-6, .55, -18, 1.5, 1.1, .7, doorMat);              // komoda (deko)

  // === SYPIALNIE (etap3, finał): szafy (osłony), łóżko, biurko ===
  box(-9, 1.0, -26, 2.0, 2.0, 1.0, crateMat, true, .25); // szafa (osłona)
  box(9, 1.0, -30, 2.0, 2.0, 1.0, crateMat, true, .25);
  box(-8, .4, -30, 2.6, .8, 1.7, doorMat);               // łóżko (deko)
  box(8, .5, -24, 1.5, 1.0, .7, doorMat);                // biurko (deko)
  box(11.6, 3.4, -28, .1, 1.2, 1.6, windowMat);          // obraz (deko)

  // === OŚWIETLENIE: 11 świateł — ogród (chłodny) + pokoje (ciepłe→czerwone) ===
  addLamp(ox, oz, 0, 5.2, 12, 0xffe8c0, 12, 24);    // ogród przód (ciepłe)
  addLamp(ox, oz, -9, 4.6, 7, 0xdfe6ff, 12, 22);    // ogród L (chłodne)
  addLamp(ox, oz, 9, 4.6, 7, 0xdfe6ff, 12, 22);     // ogród P
  addLamp(ox, oz, 0, 5.0, 4, 0xfff0d0, 11, 16);     // ganek
  addLamp(ox, oz, -7, 5.0, -4, 0xffcf9a, 13, 20);   // salon L (ciepłe)
  addLamp(ox, oz, 7, 5.0, -4, 0xffcf9a, 13, 20);    // salon P
  addLamp(ox, oz, -8, 5.0, -14, 0xffdca8, 12, 20);  // hol L
  addLamp(ox, oz, 8, 5.0, -16, 0xffdca8, 12, 20);   // kuchnia P
  addLamp(ox, oz, -8, 5.0, -27, 0xff8a5a, 12, 20);  // sypialnia L (ciepło-czerwone finał)
  addLamp(ox, oz, 8, 5.0, -29, 0xff8a5a, 12, 20);   // sypialnia P
  addLamp(ox, oz, 0, 5.0, -24, 0xffb070, 11, 18);   // przy wyłomie

  const spawnPoint = V(ox, oz, 0, 1.7, 9);              // NA ZEWNĄTRZ, twarzą do domu (-z)
  // uszeregowane SALON → HOL → SYPIALNIE (za drzwiami, w głąb)
  const enemySpawnPoints = [
    [-8,-2],[8,-3],[-3,-6],[4,-1],[0,-5],                  // SALON (etap1) 5
    [-8.8,-11.3],[9.2,-14],[-4,-18],[5,-11],[0,-16],       // HOL (etap2) 5
    [-8.7,-24.3],[9.3,-28.3],[-5,-32],[5,-24],[0,-28],[0.2,-32.2], // SYPIALNIE (etap3) 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-8,-4],[8,-5],[0,-3],
    [-9,-13],[9,-16],[0,-14],
    [-9,-26],[9,-30],[-8,-30],[8,-24],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   5. ZAKŁAD PRZEMYSŁOWY (industrial) — największy, finał
============================================================ */
function buildIndustrial(){
  const O = ORIGINS.industrial, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: zakład, W PEŁNI ZAMKNIĘTY, 4 strefy ===
  // Cała lokacja: x∈[-16,16] (32 szer.), z∈[-44,20] (64 gł.) — STAŁA szerokość.
  //   ENTRY   brama zakładu   z:[  8, 20] (spawn)
  //   STREFA1 hala silosów    z:[ -8,  8]  etap1 — drzwi (3 j.)
  //   STREFA2 maszynownia     z:[-26, -8]  etap2 — TUNEL rurowy (2.2 j.)
  //   STREFA3 serce zakładu   z:[-44,-26]  etap3 — WYŁOM (6 j.)
  const W = 32, H = 8, T = .8, TP = 1;
  const zC = -12, D = 64;
  box(0, .02, zC, W, .04, D, indFloorMat);               // podłoga — dokładnie x∈[-16,16], z∈[-44,20]
  enclose(box, W, zC, D, H, TP, indMat, .3);

  divider(box, W, 8, 0, 1.5, H, T, indMat, .3);          // ENTRY→S1 (drzwi)
  divider(box, W, -8, 0, 1.1, H, T, indMat, .3);         // S1→S2 (tunel)
  box(-1.5, H/2, -11, T, H, 6.4, indMat, true, .3);      // ściany tunelu rurowego (prześwit x:[-1.1,1.1])
  box( 1.5, H/2, -11, T, H, 6.4, indMat, true, .3);
  { const p = new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,6.4,10), pipeMat);
    p.rotation.x=Math.PI/2; p.position.set(ox, H-.6, oz-11); scene.add(p); } // rura nad tunelem
  divider(box, W, -26, 0, 3, H, T, indMat, .3);          // S2→S3 (przejście do reaktora)
  box(-2.4, .6, -25.3, 2.0, 1.2, 1.6, indMat, false, 0, .3);  // gruz przy bramie
  box( 2.0, .35, -24.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.4, -26, 6.2, 1.2, .3, indMat, false, 0, .1);    // nadproże bramy
  // >>> DŹWIGNIA (Część A): grodziowa brama do SERCA ZAKŁADU / reaktora (S3) na
  //     GŁÓWNEJ drodze; pulpit z dźwignią stoi w maszynowni (S2), przed bramą. <<<
  {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(6, 5.4, .6), bunkerTrimMat);
    gate.position.set(ox, 2.7, oz-26);
    gate.castShadow = gate.receiveShadow = true; scene.add(gate);
    registerGate('industrial_lever', gate, 6.0);
    box(0, 5.9, -26, 6.4, .4, 1.0, indMat);              // prowadnica bramy (deko)
  }
  registerLever('industrial', 'industrial_lever', ox, oz, -4, -23, 0);  // pulpit dźwigni w S2

  // belki stropowe (deko po strefach)
  for(const bz of [14, 2,-4, -18,-22, -32,-40]) box(0, H-.4, bz, W-1, .4, .4, indMat);

  // === ENTRY — brama zakładu (brak wrogów) ===
  box(-11, 1.1, 15, 2.0, 2.2, 1.8, crateMat, true, .25);
  box(11, .9, 16, 2.4, 1.8, 1.3, indMat, true, .25);
  { const vpipe = new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,7,10), pipeMat);
    vpipe.position.set(ox+14, 3.5, oz+18); scene.add(vpipe); }

  // === STREFA1 — hala silosów (etap1): 2 silosy (kolizja) + skrzynie ===
  for(const [x,z] of [[-11,0],[11,2]]){
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,H,16), pipeMat);
    silo.position.set(ox+x, H/2, oz+z); silo.castShadow=silo.receiveShadow=true; scene.add(silo);
    addCollider(silo, .3);
  }
  for(const [x,z,s] of [[-4,5,1.8],[5,-4,2],[0,0,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.6);

  // === STREFA2 — maszynownia (etap2): blok maszyny, przenośnik, barykady ===
  box(12, 3, -14, 7, 6, 7, indMat, true, .3);            // blok maszynowni (kolizja)
  box(-11, 1.0, -18, 8, 2.0, 1.6, indMat, true, .3);     // korpus przenośnika (osłona)
  for(let i=-3;i<=3;i++) box(-11+i*1.1, 2.05, -18, .5, .12, 1.8, pipeMat); // rolki (deko)
  for(const [x,z,w] of [[-6,-11,4],[4,-22,4]]) box(x, .9, z, w, 1.8, 1.2, sandbagMat, true, .25);

  // === STREFA3 — serce zakładu (etap3, finał): silos centralny, reaktor ===
  { const silo = new THREE.Mesh(new THREE.CylinderGeometry(3,3,H,16), pipeMat);
    silo.position.set(ox-11, H/2, oz-36); silo.castShadow=true; scene.add(silo); addCollider(silo,.3); }
  box(10, 3, -38, 6, 6, 6, indMat, true, .3);            // reaktor (kolizja)
  for(const [x,z,s] of [[-3,-30,2],[3,-40,1.8],[0,-33,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.6);
  box(-14, 2.4, -40, 1.5, 1.3, .12, windowMat);          // panel sterowania (deko)

  // === OŚWIETLENIE: 11 świateł, ciepłe→chłodne w głąb ===
  addLamp(ox, oz, 0, H-.4, 16, 0xffe0c0, 15, 30);   // entry (ciepłe)
  addLamp(ox, oz, -11, H-.4, 2, 0xffcaa0, 14, 26);  // S1 L
  addLamp(ox, oz, 11, H-.4, 0, 0xffcaa0, 14, 26);   // S1 P
  addLamp(ox, oz, 0, H-1.0, -11, 0xff9868, 8, 14);  // tunel
  addLamp(ox, oz, -10, H-.4, -14, 0x9fd0ff, 14, 26);// S2 L (chłodne)
  addLamp(ox, oz, 10, H-.4, -18, 0x9fd0ff, 13, 26); // S2 P
  addLamp(ox, oz, 0, H-.4, -26, 0xffb070, 10, 18);  // wyłom
  addLamp(ox, oz, -11, H-.4, -34, 0xff6a48, 14, 26);// S3 (czerwone finał)
  addLamp(ox, oz, 10, H-.4, -38, 0xff6a48, 13, 26);
  addLamp(ox, oz, 0, H-.4, -40, 0xbfd4ff, 12, 24);  // S3 głąb (chłodne)
  addLamp(ox, oz, 0, H-.4, 8, 0xfff0d0, 11, 18);    // nad drzwiami

  const spawnPoint = V(ox, oz, 0, 1.7, 16);
  const enemySpawnPoints = [
    [-13,4],[13.2,5.7],[-5,-4],[6,5],[-0.1,-2.3],          // S1 5
    [-13,-12],[6,-14],[-5,-22],[13,-22],[0,-20],           // S2 5
    [-13,-31.7],[13,-33.7],[-5,-40],[5.5,-40],[0,-30],[0,-42], // S3 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-11,4],[11,2],[0,0],
    [-6,-11],[4,-22],[-11,-18],
    [-3,-30],[3,-40],[10,-34],[-13,-38],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   6. PODZIEMNY BUNKIER (bunker) — ciasne korytarze + pomieszczenia
      Klaustrofobiczny, betonowy, ale gęsto oświetlony lampami
      awaryjnymi. Rozgałęziający się układ, walka na bliski dystans.
============================================================ */
function buildBunker(){
  const O = ORIGINS.bunker, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: bunkier, W PEŁNI ZAMKNIĘTY, niski sufit ===
  // Cała lokacja: x∈[-12,12] (24 szer.), z∈[-40,16] (56 gł.). Sufit H=4 (klaustrofobia).
  //   ENTRY   zejście        z:[  6, 16] (spawn)
  //   STREFA1 wartownia       z:[ -6,  6]  etap1 — właz (drzwi 2.4 j.)
  //   STREFA2 cele            z:[-24, -6]  etap2 — WĄSKI TUNEL (2 j.) + arsenał za BRAMĄ
  //   STREFA3 komora          z:[-40,-24]  etap3 — WYŁOM (5 j.)
  const W = 24, H = 4, T = .8, TP = 1;
  const zC = -12, D = 56;
  box(0, .02, zC, W, .04, D, bunkerFloorMat);            // podłoga — dokładnie x∈[-12,12], z∈[-40,16]
  enclose(box, W, zC, D, H, TP, bunkerWallMat, .3);

  // === ZAKRĘT: tunel (S1→S2) przy WSCHODNIEJ ścianie (jego zakres Z jest na
  //     północ od arsenału, więc brak kolizji), a wyłom (S2→S3) przy ZACHODNIEJ —
  //     trasa łamie się w bok, arsenał (wschód, z:-14..-22) = boczny detour. ===
  divider(box, W, 6, 0, 1.2, H, T, bunkerWallMat, .3);   // ENTRY→S1 (właz 2.4 j., środek)
  divider(box, W, -6, 6, 1.0, H, T, bunkerWallMat, .3);  // S1→S2 (tunel WSCHÓD, prześwit x:5..7)
  box(4.6, H/2, -9, T, H, 6.4, bunkerWallMat, true, .3); // ściany tunelu (prześwit x:[5,7])
  box(7.4, H/2, -9, T, H, 6.4, bunkerWallMat, true, .3);
  for(const z of [-7,-8.5,-10,-11.5]) box(6, H-.25, z, 2.1, .4, .12, bunkerTrimMat); // belki tunelu (deko)
  divider(box, W, -24, -6, 2.5, H, T, bunkerWallMat, .3);// S2→S3 (wyłom ZACHÓD, luka x:-8.5..-3.5)
  box(-5.8, .5, -23.3, 1.8, 1.0, 1.4, bunkerWallMat, false, 0, .3); // gruz
  box(-7.8, .35, -22.6, 1.3, .7, 1.0, crateMat, false, 0, .7);
  box(-6, H/2, -23.55, .12, 2.6, 2.2, bunkerFloorMat);   // ciemna rysa w murze (deko)

  // === ARSENAŁ za BRAMĄ (openGate 'bunker') — OPCJONALNY schowek we wschodnim
  // rogu STREFY2 (x:5..12, z:-22..-14). Brak spawnów w środku → misja
  // przechodliwa nawet bez openGate. ===
  box(8.5, H/2, -14, 7, H, T, bunkerWallMat, true, .3);  // ściana płn arsenału (x:5..12)
  box(8.5, H/2, -22, 7, H, T, bunkerWallMat, true, .3);  // ściana płd arsenału
  box(5, H/2, -20.6, T, H, 2.8, bunkerWallMat, true, .3);// ściana zach.: segment dolny (z:-22..-19.2)
  box(5, H/2, -15.4, T, H, 2.8, bunkerWallMat, true, .3);// segment górny (z:-16.8..-14); brama z:-19.2..-16.8
  {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(.5, 3.4, 2.4), bunkerTrimMat);
    gate.position.set(ox+5, 1.7, oz-18);
    gate.castShadow = gate.receiveShadow = true; scene.add(gate);
    registerGate('bunker', gate, 3.6);                   // kolizja + rejestracja bramy
    box(5, 3.7, -18, .9, .3, 2.8, bunkerWallMat);         // nadproże wrót (deko)
  }
  box(9, .06, -18, 2.4, .06, 5, bunkerTrimMat);          // krata podłogowa arsenału (deko)
  box(10.5, 1.2, -20, 1.0, 2.4, .8, bunkerWallMat, false, 0, .2); // regał broni (deko)

  // === ENTRY — zejście (brak wrogów) ===
  box(-9, .9, 12, 1.6, 1.8, 1.0, crateMat, true, .25);
  box(9, 1.4, 13, 1.4, 2.8, .8, bunkerWallMat, true, .25); // szafka (osłona)

  // === STREFA1 — wartownia (etap1): filary, biurko, radio ===
  for(const [x,z,s] of [[-8,2,1.6],[8,0,1.6],[0,3,1.4]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  box(-9, .7, -3, 2.2, 1.4, .9, doorMat);                // biurko dowodzenia (deko)
  box(-9, 1.5, -3, .8, .5, .5, bunkerTrimMat);           // radio (deko)

  // === STREFA2 — cele (etap2): filary, szafki, beczka ===
  for(const [x,z,s] of [[-8,-11,1.6],[-9,-20,1.6],[0,-15,1.4]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  for(const [lx,lz] of [[-11,-10],[-11,-20]]) box(lx, 1.4, lz, 1.2, 2.6, .8, bunkerWallMat, true, .25); // szafki
  { const br = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1.2,10), bunkerTrimMat);
    br.position.set(ox-4, .6, oz-18); scene.add(br); }

  // === STREFA3 — komora (etap3, finał): filary, szafa na dokumenty ===
  for(const [x,z,s] of [[-8,-30,1.6],[8,-34,1.6],[0,-28,1.4]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  box(-10, .7, -36, 2.2, 1.4, .9, doorMat);              // szafa na dokumenty (deko)
  box(9, 1.2, -30, 1.0, 2.4, .8, bunkerWallMat, false, 0, .1); // regał (deko)

  // pomarańczowe rury awaryjne wzdłuż stref (deko)
  for(const z of [0,-14,-32]){ box(-11.4, H-.5, z, .1, .25, 3, bunkerTrimMat); box(11.4, H-.5, z, .1, .25, 3, bunkerTrimMat); }

  // === OŚWIETLENIE: 11 lamp awaryjnych, ciepłe→czerwone w głąb ===
  addLamp(ox, oz, 0, H-.3, 13, 0xffd8a0, 11, 16, .12);  // entry
  addLamp(ox, oz, 0, H-.3, 6, 0xffb070, 10, 14, .12);   // właz
  addLamp(ox, oz, -8, H-.3, 0, 0xffc890, 10, 16, .12);  // S1 L
  addLamp(ox, oz, 8, H-.3, 0, 0xffc890, 10, 16, .12);   // S1 P
  addLamp(ox, oz, 6, H-.6, -9, 0xff9868, 7, 11, .12);   // tunel (wschód — zakręt)
  addLamp(ox, oz, -8, H-.3, -14, 0xff8058, 10, 16, .12);// S2 L (czerwonawe)
  addLamp(ox, oz, -8, H-.3, -21, 0xff8058, 10, 16, .12);
  addLamp(ox, oz, 8.5, H-.3, -18, 0xcfe0ff, 9, 14, .12);// arsenał (chłodne)
  addLamp(ox, oz, -8, H-.3, -31, 0xff6a48, 10, 16, .12);// S3 (czerwone finał)
  addLamp(ox, oz, 8, H-.3, -34, 0xff6a48, 10, 16, .12);
  addLamp(ox, oz, 0, H-.3, -37, 0xcfe0ff, 10, 15, .12); // S3 głąb (chłodne)

  const spawnPoint = V(ox, oz, 0, 1.7, 12);
  // uszeregowane od wejścia (z+) w głąb (z-) — dla podziału na etapy
  const enemySpawnPoints = [
    [-7.8,4],[8.2,2],[-4,-3],[5,-2],[-0.2,1.1],            // S1 5
    [-7.7,-9],[-8.7,-18],[0.3,-13.1],[9.1,-11],[3.3,-19.8], // S2 5 (nie w arsenale)
    [-7.7,-28],[8.3,-32],[-5,-37],[5,-37],[0.3,-26.1],[0,-33], // S3 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-8,2],[8,0],[0,3],
    [-8,-11],[-9,-20],[0,-15],
    [-8,-30],[8,-34],[-10,-36],[0,-28],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   7. OPUSZCZONE LOTNISKO (airfield) — bardzo otwarty teren,
      wraki samolotów jako osłony, 2 hangary jako podobszary,
      długie linie strzału dla strzelców.
============================================================ */
function buildAirfield(){
  const O = ORIGINS.airfield, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: lotnisko, W PEŁNI ZAMKNIĘTE, szerokie strefy ===
  // Cała lokacja: x∈[-18,18] (36 szer.), z∈[-44,20] (64 gł.) — STAŁA szerokość.
  //   ENTRY   apron/wjazd     z:[  8, 20] (spawn)
  //   STREFA1 płyta postoju   z:[-10,  8]  etap1 — brama (drzwi 3 j.)
  //   STREFA2 hangar          z:[-28,-10]  etap2 — TUNEL kadłuba (2.2 j.)
  //   STREFA3 wieża kontroli  z:[-44,-28]  etap3 — WYŁOM w ścianie (6 j.)
  const W = 36, H = 7, T = .8, TP = 1;
  const zC = -12, D = 64;
  box(0, .02, zC, W, .04, D, tarmacMat);                 // płyta — dokładnie x∈[-18,18], z∈[-44,20]
  box(0, .03, zC, 8, .04, D-2, roadMat);                 // pas startowy (ciemniejsza smuga — deko)
  for(let i=-6;i<=6;i++) box(0, .05, i*5, 1.4, .05, 1.6, sandFloorMat);  // linie pasa
  enclose(box, W, zC, D, H, TP, hangarMat, .3);

  divider(box, W, 8, 0, 1.5, H, T, hangarMat, .3);       // ENTRY→S1 (brama)
  divider(box, W, -10, 0, 1.1, H, T, hangarMat, .3);     // S1→S2 (tunel kadłuba)
  box(-1.5, 1.7, -13, .5, 3.0, 6, planeMat, true, .3);   // burta kadłuba L (z:-16..-10, prześwit x:[-1.1,1.1])
  box( 1.5, 1.7, -13, .5, 3.0, 6, planeMat, true, .3);   // burta P
  box(0, 3.3, -13, 3.4, .5, 6, planeWingMat);            // sklepienie kadłuba (deko)
  for(let i=-2;i<=2;i++) box(0, 2.5, -13+i*1.4, 3.2, .12, .3, planeWingMat); // wręgi (deko)
  divider(box, W, -28, 0, 3, H, T, hangarMat, .3);       // S2→S3 (wyłom)
  box(-2.4, .6, -27.3, 2.0, 1.2, 1.6, hangarMat, false, 0, .3);  // gruz
  box( 2.0, .35, -26.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.3, -28, 6.2, 1.1, .3, hangarMat, false, 0, .1);     // zerwane nadproże

  // === ENTRY — apron (brak wrogów) ===
  box(-14, 1.0, 15, 2.8, 2.0, 2.0, crateMat, true, .25);
  box(14, .7, 16, 2.8, 1.4, 1.6, hangarMat, true, .25);  // wózek bagażowy
  { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,6,8), hangarMat);
    pole.position.set(ox+16, 3, oz+18); scene.add(pole);
    box(16, 5.4, 18, 1.6, .9, .1, carMat); }              // rękaw wiatrowy (deko)

  // === STREFA1 — płyta postoju (etap1): wrak samolotu (osłona) + beczki + ciągnik ===
  {
    const px=-11, pz=0;
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.2,.9,11,12), planeMat);
    fus.rotation.z=Math.PI/2; fus.position.set(ox+px, 1.9, oz+pz); fus.castShadow=true; scene.add(fus); addCollider(fus,.3);
    box(px, 1.6, pz, 3.0, .3, 11, planeWingMat, true, .25);      // skrzydła (osłona)
    box(px-4.8, 2.9, pz, .25, 2.0, 2.6, planeWingMat, true, .2); // statecznik (ogon)
  }
  for(const [x,z] of [[9,4],[8,-6]]){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,1.7,12), pipeMat);
    b.position.set(ox+x, .85, oz+z); b.castShadow=true; scene.add(b); addCollider(b,.25);
  }
  box(6, .5, 6, 2.8, 1.0, 1.5, carMat, true, .3, .2);    // ciągnik lotniskowy (osłona)

  // === STREFA2 — hangar (etap2): skrzynie, zbiorniki paliwa, wał ochronny ===
  for(const [x,z,s] of [[-12,-16,2],[12,-14,2],[-6,-24,1.8],[6,-22,1.8],[0,-18,1.6]])
    box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.5);
  for(const [tkx,tkz] of [[15,-24],[15,-18]]){
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,3.2,14), hangarMat);
    tank.position.set(ox+tkx, 1.6, oz+tkz); tank.castShadow=true; scene.add(tank); addCollider(tank,.3);
  }
  box(-16, .7, -20, .8, 1.4, 6, hangarMat, true, .25);   // wał ochronny depotu (osłona)

  // === STREFA3 — wieża kontroli (etap3, finał): trzon wieży + osłony ===
  {
    const tx=-12, tz=-38;
    box(tx, 3, tz, 3.2, H, 3.2, hangarMat, true, .3);    // trzon wieży (kolizja)
    box(tx, H+1.4, tz, 5.2, 1.6, 5.2, planeMat);         // kabina kontroli (deko)
    box(tx, H+1.4, tz, 4.6, 1.0, 4.6, windowMat);        // szyby (deko)
    box(tx, H+3, tz, .1, 2.4, .1, pipeMat);              // antena (deko)
  }
  for(const [x,z,s] of [[8,-34,2],[10,-40,1.8],[0,-32,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.5);
  box(-16, 2.4, -40, 1.5, 1.3, .12, windowMat);          // tablica (deko)

  // === OŚWIETLENIE: 11 reflektorów, ciepłe→chłodne ===
  addLamp(ox, oz, 0, H-.3, 16, 0xffe8c0, 16, 34, .2);   // entry (ciepłe)
  addLamp(ox, oz, -12, H-.3, 2, 0xffe0b0, 14, 30, .18); // S1 L
  addLamp(ox, oz, 12, H-.3, -2, 0xffe0b0, 14, 30, .18); // S1 P
  addLamp(ox, oz, 0, 4, -13, 0xffd8a0, 10, 18, .16);    // tunel kadłuba
  addLamp(ox, oz, -12, H-.3, -18, 0xdfe8ff, 14, 30, .2);// S2 L (chłodne hangar)
  addLamp(ox, oz, 12, H-.3, -22, 0xdfe8ff, 14, 30, .2); // S2 P
  addLamp(ox, oz, 0, H-.3, -28, 0xffb070, 10, 18, .16); // wyłom
  addLamp(ox, oz, -12, H-.3, -35, 0xbfd4ff, 14, 30, .2);// S3 wieża (chłodne)
  addLamp(ox, oz, 9, H-.3, -37, 0xbfd4ff, 13, 30, .2);
  addLamp(ox, oz, 0, H-.3, -40, 0xd8e6ff, 12, 28, .2);
  addLamp(ox, oz, 0, H-.3, 8, 0xfff0d0, 11, 20, .18);   // brama

  const spawnPoint = V(ox, oz, 0, 1.7, 16);
  const enemySpawnPoints = [
    [-14,4],[14,4],[-6,-6],[5.9,3.7],[0,-2],               // S1 5
    [-12.8,-13.4],[12.2,-16.6],[-5.5,-21.6],[6.5,-19.6],[-0.4,-20.3], // S2 5
    [-14,-33],[13,-34],[-6,-40],[6,-40],[0,-29.7],[0,-42], // S3 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-11,3],[9,4],[6,6],
    [-12,-16],[12,-14],[0,-18],
    [8,-34],[10,-40],[-12,-35],[0,-32],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   8. STACJA TOWAROWA (train) — równoległe tory, wagony jako
      osłony/korytarze (część z otwartymi drzwiami = przejścia),
      podwyższony peron.
============================================================ */
function buildTrain(){
  const O = ORIGINS.train, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: stacja, W PEŁNI ZAMKNIĘTA, 4 strefy ===
  // Cała lokacja: x∈[-16,16] (32 szer.), z∈[-44,20] (64 gł.) — STAŁA szerokość.
  //   ENTRY   peron           z:[  8, 20] (spawn)
  //   STREFA1 pierwsze wagony z:[ -8,  8]  etap1 — brama (drzwi 3 j.)
  //   STREFA2 środek składu   z:[-26, -8]  etap2 — WAGON-TUNEL (2.2 j.)
  //   STREFA3 dalsze tory     z:[-44,-26]  etap3 — WYŁOM (6 j.)
  const W = 32, H = 6, T = .8, TP = 1;
  const zC = -12, D = 64;
  box(0, .02, zC, W, .04, D, railBedMat);                // podłoże — dokładnie x∈[-16,16], z∈[-44,20]
  enclose(box, W, zC, D, H, TP, indMat, .3);

  // tory wzdłuż z (deko, bez kolizji)
  for(const tx of [-11, 0, 11]){
    for(let i=-9;i<=9;i++) box(tx, .08, i*2.2, 2.6, .16, .5, sleeperMat);
    box(tx-1, .18, zC, .12, .2, D-2, railMat);
    box(tx+1, .18, zC, .12, .2, D-2, railMat);
  }

  divider(box, W, 8, 0, 1.5, H, T, indMat, .3);          // ENTRY→S1 (brama)
  divider(box, W, -8, 0, 1.1, H, T, indMat, .3);         // S1→S2 (wagon-tunel)
  box(-1.5, 2, -11, .5, 4, 6, boxcarMat, true, .3);      // burta wagonu L (z:-14..-8, prześwit x:[-1.1,1.1])
  box( 1.5, 2, -11, .5, 4, 6, boxcarMat, true, .3);      // burta wagonu P
  box(0, 4.1, -11, 3.6, .4, 6.4, boxcarMat);             // dach wagonu (deko)
  divider(box, W, -26, 0, 3, H, T, indMat, .3);          // S2→S3 (wyłom)
  box(-2.4, .5, -25.3, 2.0, 1.0, 1.6, indMat, false, 0, .3);  // gruz
  box( 2.0, .35, -24.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.3, -26, 6.2, 1.1, .3, indMat, false, 0, .1);    // zerwane nadproże

  // wagon towarowy (osłona/bryła kolizji)
  function boxcar(px, pz, mat){
    box(px, 2.2, pz, 4.6, 3.6, 7, mat, true, .3);
    box(px, 4.2, pz, 4.8, .4, 7.2, mat);                 // dach (deko)
    box(px, .35, pz, 5.0, .7, 7.4, boxcarMat2, false, 0, .1); // podwozie (deko)
  }

  // === ENTRY — peron (brak wrogów) ===
  box(13, .6, 14, 5, 1.2, 10, platformMat, true, .3);    // płyta peronu
  box(14, 1.7, 14, 3, .3, 10, platformMat);              // zadaszenie (deko)
  for(const [x,z,s] of [[13,12,1.8],[13,17,1.6]]) box(x, s/2+1.2, z, s, s, s, crateMat, false, 0, .3); // palety na peronie

  // === STREFA1 — pierwsze wagony (etap1): wagon + skrzynie + bęben kabli ===
  boxcar(-11, 2, boxcarMat);
  for(const [x,z,s] of [[10,4,1.8],[4,-4,1.8],[0,3,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  { const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,1.3,14), sleeperMat);
    drum.rotation.z=Math.PI/2; drum.position.set(ox+12, 1.0, oz-4); scene.add(drum); }

  // === STREFA2 — środek składu (etap2): 2 wagony tworzą korytarze ===
  boxcar(-11, -18, boxcarMat2);
  boxcar(11, -16, boxcarMat);
  for(const [x,z,s] of [[0,-14,1.8],[4,-22,1.6],[-4,-24,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  box(6, .7, -12, 2.6, 1.4, 1.8, sleeperMat, false, 0, .3); // hałda węgla (deko)

  // === STREFA3 — dalsze tory (etap3, finał): kozły oporowe, wagon ===
  boxcar(-10, -34, boxcarMat);
  for(const [x,z,s] of [[4,-32,1.8],[6,-40,1.8],[0,-30,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  for(const tx of [-11,0,11]) box(tx, .6, -42, 2.6, 1.2, .8, railMat, true, .25); // kozły oporowe
  box(-15, 2.4, -40, 1.5, 1.3, .12, windowMat);          // tablica rozkładu (deko)

  // >>> PARKOUR (opcjonalny): podwyższony pomost serwisowy przy WSCHODNIEJ ścianie.
  //     Rampa w górę → podest A → PRZERWA (przeskok ~2 j.) → podest B (perć z widokiem
  //     na finał). To trasa BOCZNA (nagroda = wysoka pozycja); główna walka toczy się
  //     na poziomie gruntu, więc brak ryzyka zablokowania misji. Kolizja silnika jest
  //     2D — gracz może też zejść na ziemię; jump (spacja) to intencjonalna droga. <<<
  addRamp(ox, oz, 10, 14, -27, -31, 2.4, 16, rampMat);   // wejście na pomost (16 progów × .15)
  addDeck(ox, oz, 8, 14, -35, -31, 2.4, rampMat);        // podest A
  addDeck(ox, oz, 8, 14, -41, -37, 2.4, rampMat);        // podest B (perć) — PRZERWA z:[-37,-35]
  for(const [lx,lz] of [[8.5,-34.5],[13.5,-34.5],[8.5,-40.5],[13.5,-40.5]])
    box(lx, 1.2, lz, .3, 2.4, .3, railMat);              // nogi pomostu (deko)
  box(8, 2.9, -36, .12, .5, 10, railMat);                // reling zach. (ciągły nad przerwą)
  box(14, 2.9, -36, .12, .5, 10, railMat);               // reling wsch.
  box(11, 2.9, -41, 6, .5, .12, railMat);                // reling tylny perci

  // === OŚWIETLENIE: 11 świateł, ciepłe→chłodne ===
  addLamp(ox, oz, 13, H-.3, 15, 0xffdca0, 14, 28, .16); // peron (ciepłe)
  addLamp(ox, oz, 0, H-.3, 16, 0xffe4b0, 13, 28, .18);  // entry
  addLamp(ox, oz, -11, H-.3, 2, 0xffcaa0, 13, 26, .16); // S1 L
  addLamp(ox, oz, 8, H-.3, -2, 0xffcaa0, 13, 26, .16);  // S1 P
  addLamp(ox, oz, 0, H-1.0, -11, 0xff9868, 8, 14, .12); // wagon-tunel
  addLamp(ox, oz, -11, H-.3, -18, 0xd8e4ff, 13, 26, .18);// S2 L (chłodne)
  addLamp(ox, oz, 11, H-.3, -16, 0xd8e4ff, 13, 26, .18); // S2 P
  addLamp(ox, oz, 0, H-.3, -26, 0xffb070, 10, 18, .16); // wyłom
  addLamp(ox, oz, -10, H-.3, -34, 0xcfe0ff, 13, 26, .18);// S3 (chłodne finał)
  addLamp(ox, oz, 9, H-.3, -36, 0xcfe0ff, 12, 26, .18);
  addLamp(ox, oz, 0, H-.3, -40, 0xd8e4ff, 12, 24, .18);

  const spawnPoint = V(ox, oz, 0, 1.7, 16);
  const enemySpawnPoints = [
    [-7.4,4],[14,4],[-5,-4],[6,4],[0,-2],                  // S1 5
    [-13.8,-13.2],[14.2,-11.3],[-5,-22],[6,-24],[-0.4,-16.1], // S2 5
    [-14,-32],[-6,-34],[-5,-40],[6.4,-37.9],[0.3,-28],[0.3,-40.4], // S3 6 (nie na pomoście)
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [10,4],[4,-4],[0,3],
    [0,-14],[4,-22],[-4,-24],
    [4,-32],[6,-40],[0,-30],[-14,-40],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   9. NABRZEŻE PORTOWE (harbor) — kontenery (sztaplowane 2-3 wys.)
      jako gęsty labirynt/osłony, 1 dźwig portowy, woda jako
      granica po jednej stronie (ciemniejsza podłoga, bez fizyki).
============================================================ */
function buildHarbor(){
  const O = ORIGINS.harbor, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: nabrzeże, W PEŁNI ZAMKNIĘTE, 4 strefy ===
  // Cała lokacja: x∈[-16,16] (32 szer.), z∈[-44,20] (64 gł.) — STAŁA szerokość.
  //   ENTRY   brama portu    z:[  8, 20] (spawn)
  //   STREFA1 skład kontenerów z:[ -8,  8]  etap1 — brama (drzwi 3 j.)
  //   STREFA2 labirynt        z:[-26, -8]  etap2 — KONTENER-TUNEL (2.2 j.) + skład za BRAMĄ
  //   STREFA3 nabrzeże/dźwig  z:[-44,-26]  etap3 — WYŁOM (6 j.)
  const W = 32, H = 6, T = .8, TP = 1;
  const zC = -12, D = 64;
  box(0, .02, zC, W, .04, D, dockMat);                   // nabrzeże — dokładnie x∈[-16,16], z∈[-44,20]
  enclose(box, W, zC, D, H, TP, dockMat, .3);
  // woda za ścianą zachodnią (deko, bez fizyki)
  { const water = new THREE.Mesh(new THREE.PlaneGeometry(26, D), waterMat);
    water.rotation.x=-Math.PI/2; water.position.set(ox-30, .03, oz+zC); scene.add(water); }
  for(const bz of [12,0,-12,-24,-36]){                   // pachołki cumownicze przy ścianie zach. (deko)
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(.35,.4,1.0,10), craneMat);
    bol.position.set(ox-15, .5, oz+bz); scene.add(bol);
  }

  const cMats = [contRed, contBlue, contGreen, contYellow];
  const cm = (i) => cMats[((i%4)+4)%4];

  divider(box, W, 8, 0, 1.5, H, T, dockMat, .3);         // ENTRY→S1 (brama)
  divider(box, W, -8, 0, 1.1, H, T, dockMat, .3);        // S1→S2 (kontener-tunel)
  box(-1.5, 1.6, -11, .5, 3.2, 6, contGreen, true, .3);  // burta kontenera L (z:-14..-8, prześwit x:[-1.1,1.1])
  box( 1.5, 1.6, -11, .5, 3.2, 6, contGreen, true, .3);  // burta P
  box(0, 3.35, -11, 3.4, .5, 6.2, contGreen);            // dach kontenera (deko)
  divider(box, W, -26, 0, 3, H, T, dockMat, .3);         // S2→S3 (wyłom)
  box(-2.4, .6, -25.3, 2.0, 1.2, 1.6, dockMat, false, 0, .3);  // gruz
  box( 2.0, .35, -24.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.3, -26, 6.2, 1.1, .3, dockMat, false, 0, .1);    // zerwane nadproże

  // kontener sztaplowany (kolizja tylko dolny)
  function stack(px, pz, n, rot){
    for(let i=0;i<n;i++) box(px, 1.4+i*2.8, pz, 6, 2.6, 2.6, cm(px+pz+i), i===0, .3, rot);
  }

  // === SKŁAD za BRAMĄ (openGate 'harbor') — OPCJONALNY schowek nadwodny w
  // zachodnim rogu STREFY2 (x:-16..-9, z:-22..-14). Brak spawnów → przechodliwe. ===
  box(-12.5, H/2, -14, 7, H, T, dockMat, true, .3);      // ściana płn składu (x:-16..-9)
  box(-12.5, H/2, -22, 7, H, T, dockMat, true, .3);      // ściana płd składu
  box(-9, H/2, -20.6, T, H, 2.8, dockMat, true, .3);     // ściana wsch.: segment dolny (z:-22..-19.2)
  box(-9, H/2, -15.4, T, H, 2.8, dockMat, true, .3);     // segment górny (z:-16.8..-14); brama z:-19.2..-16.8
  {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(.5, 4, 2.4), craneMat);
    gate.position.set(ox-9, 2, oz-18);
    gate.castShadow = gate.receiveShadow = true; scene.add(gate);
    registerGate('harbor', gate, 4.2);
    box(-9, 4.3, -18, .9, .4, 2.8, dockMat);              // prowadnica bramy (deko)
  }
  box(-13, 1.4, -20, 1.2, 2.6, .8, contBlue, false, 0, .2); // regał w składzie (deko)

  // === ENTRY — brama portu (brak wrogów) ===
  stack(-11, 16, 2, 0);                                  // stos kontenerów (landmark)
  box(11, 1.0, 15, 2.4, 2.0, 2.0, crateMat, true, .25);

  // === STREFA1 — skład kontenerów (etap1): kolorowe stosy = uliczki ===
  stack(-11, 2, 2, 0);
  stack(10, -4, 2, Math.PI/2);
  for(const [x,z,s] of [[2,4,1.8],[-4,-5,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);

  // === STREFA2 — labirynt (etap2): gęste stosy, wózek widłowy ===
  stack(11, -14, 2, 0);
  stack(2, -20, 2, Math.PI/2);
  for(const [x,z,s] of [[6,-12,1.8],[-4,-24,1.6],[0,-16,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);
  box(6, .5, -20, 2.6, 1.0, 1.4, craneMat, true, .3, .2); // wózek widłowy (osłona)

  // === STREFA3 — nabrzeże/dźwig (etap3, finał): dźwig portowy + stosy ===
  {
    const cx=12, cz=-40;
    box(cx, 1.5, cz, 3, 3, 3, craneMat, true, .3);       // podstawa dźwigu (kolizja)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,14,10), craneMat);
    mast.position.set(ox+cx, H+4, oz+cz); mast.castShadow=true; scene.add(mast);
    box(cx-7, H+9, cz, 16, .8, .8, craneMat);            // ramię (deko, wysoko)
  }
  stack(-11, -36, 2, 0);
  for(const [x,z,s] of [[6,-32,1.8],[0,-30,1.6],[-4,-42,1.6]]) box(x, s/2, z, s, s, s, crateMat, true, .25);

  // === OŚWIETLENIE: 11 świateł, ciepłe→chłodne ===
  addLamp(ox, oz, 0, H-.3, 16, 0xffe0b0, 15, 30, .18);  // entry (ciepłe)
  addLamp(ox, oz, -11, H-.3, 2, 0xdce8ff, 13, 26, .18); // S1 L (chłodne)
  addLamp(ox, oz, 10, H-.3, -2, 0xffcaa0, 13, 26, .18); // S1 P
  addLamp(ox, oz, 0, H-1.0, -11, 0xff9868, 8, 14, .12); // kontener-tunel
  addLamp(ox, oz, 6, H-.3, -16, 0xdce8ff, 13, 26, .18); // S2 (chłodne labirynt)
  addLamp(ox, oz, -12.5, H-.3, -18, 0xbfe0ff, 11, 22, .14);// skład za bramą
  addLamp(ox, oz, 11, H-.3, -20, 0xdce8ff, 12, 26, .18);
  addLamp(ox, oz, 0, H-.3, -26, 0xffb070, 10, 18, .16); // wyłom
  addLamp(ox, oz, 12, H-.3, -36, 0xffcf90, 14, 28, .2); // reflektor dźwigu (ciepłe)
  addLamp(ox, oz, -11, H-.3, -36, 0xcfe0ff, 12, 26, .18);// S3 L (chłodne)
  addLamp(ox, oz, 0, H-.3, -40, 0xbfe0ff, 12, 24, .18);

  const spawnPoint = V(ox, oz, 0, 1.7, 16);
  const enemySpawnPoints = [
    [-12.8,4.6],[13,4],[-3.7,-3],[4.2,4],[0,0],            // S1 5
    [13.2,-11.4],[-3.7,-22],[6.4,-9.9],[2.1,-15.7],[8,-22.2], // S2 5 (nie w składzie)
    [-13,-32],[13,-34],[-6.1,-41.7],[5,-40],[0.3,-28],[0,-38], // S3 6
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-11,2],[10,-4],[2,4],
    [11,-14],[2,-20],[6,-12],
    [-11,-36],[6,-32],[0,-30],[12,-36],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   10. TWIERDZA KARTELU (compound) — WIELKI FINAŁ. Mur obwodowy,
       wewnętrzna willa z kilkoma wejściami, centralny dziedziniec
       z basenem, najwięcej spawnów/osłon, najgęstszy układ.
============================================================ */
function buildCompound(){
  const O = ORIGINS.compound, {x:ox, z:oz} = O;
  const box = makePlacer(ox, oz);

  // === REWORK wg wzorca warehouse: twierdza — WIELKI FINAŁ, W PEŁNI ZAMKNIĘTA ===
  // Cała lokacja: x∈[-20,20] (40 szer.), z∈[-48,24] (72 gł.) — STAŁA szerokość.
  //   ENTRY   brama główna    z:[ 12, 24] (spawn)
  //   STREFA1 dziedziniec/basen z:[ -6, 12]  etap1 — drzwi (4 j.)
  //   STREFA2 patio           z:[-28, -6]  etap2 — BRAMOWNIA (openGate + boczne drzwi OTWARTE)
  //   STREFA3 willa (wnętrze) z:[-48,-28]  etap3 — WYŁOM (6 j.)
  const W = 40, H = 6, T = .8, TP = 1;
  const zC = -12, D = 72;
  box(0, .02, zC, W, .04, D, compoundGroundMat);         // grunt — dokładnie x∈[-20,20], z∈[-48,24]
  box(0, .03, -38, W-1.4, .04, 20, villaMat);            // posadzka willi z:[-48,-28]
  enclose(box, W, zC, D, H, TP, compoundWallMat, .3);
  box(0, 6.3, -38, W+1, .4, 21, villaRoofMat);           // dach willi (deko)
  // wieżyczki narożne (deko, kolizja)
  for(const [tx,tz] of [[-18,22],[18,22],[-18,-46],[18,-46]]) box(tx, H/2+1, tz, 3, H+2, 3, compoundWallMat, true, .3);

  divider(box, W, 12, 0, 2, H, T, compoundWallMat, .3);  // ENTRY→S1 (brama główna 4 j.)
  box(-1.6, 3.5, 12, 1.2, 7, 1.2, compoundWallMat, true, .3); // słupy bramy (deko/kolizja)
  box( 1.6, 3.5, 12, 1.2, 7, 1.2, compoundWallMat, true, .3);

  // --- S1→S2: BRAMOWNIA z DWIEMA trasami (życzenie usera: kilka równoległych dróg) ---
  //   trasa boczna OTWARTA x:[-16,-13] (zawsze przejściowa) + centralna BRAMA (openGate)
  box(-18, H/2, -6, 4, H, T, compoundWallMat, true, .3);      // x:-20..-16
  box(-7.5, H/2, -6, 11, H, T, compoundWallMat, true, .3);    // x:-13..-2
  box(11, H/2, -6, 18, H, T, compoundWallMat, true, .3);      // x:2..20
  {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(4, 5, .6), bunkerTrimMat);
    gate.position.set(ox, 2.5, oz-6);                          // centralna brama x:-2..2
    gate.castShadow = gate.receiveShadow = true; scene.add(gate);
    registerGate('compound', gate, 5.4);
    box(0, 5.6, -6, 4.8, .8, 1.0, compoundWallMat);           // łuk/nadproże bramy (deko)
  }

  divider(box, W, -28, 0, 3, H, T, villaMat, .3);        // S2→S3 (WYŁOM w ścianie willi)
  box(-2.4, .6, -27.3, 2.0, 1.2, 1.6, villaMat, false, 0, .3);   // gruz
  box( 2.0, .35, -26.6, 1.4, .7, 1.2, crateMat, false, 0, .7);
  box(0, H-1.4, -28, 6.2, 1.2, .3, villaMat, false, 0, .1);      // zerwane nadproże

  // === ENTRY — brama główna (brak wrogów): wrak pickupa, posągi ===
  box(-14, .6, 18, 4.4, 1.2, 2, carMat, true, .3, .2);   // wrak pickupa (osłona)
  box(-14, 1.6, 17.4, 2.6, 1.0, 1.8, carMat, false, 0, .2);
  for(const sx of [-6, 6]){                              // posągi/pylony (deko)
    box(sx, 1.4, 21, 1.0, 2.8, 1.0, villaMat, true, .25);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.5,10,10), villaRoofMat);
    orb.position.set(ox+sx, 3.1, oz+21); scene.add(orb);
  }

  // === STREFA1 — dziedziniec z basenem (etap1) ===
  { const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), poolMat);
    pool.rotation.x=-Math.PI/2; pool.position.set(ox, .04, oz+4); scene.add(pool); }
  box(-7, .3, 4, .6, .6, 8, villaMat); box(7, .3, 4, .6, .6, 8, villaMat);       // obrzeże basenu
  box(0, .3, 8.5, 14, .6, .6, villaMat); box(0, .3, -.5, 14, .6, .6, villaMat);
  for(const [x,z] of [[-11,6],[11,2]]){                  // palmy (deko)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.25,.35,4,8), bunkerTrimMat);
    trunk.position.set(ox+x, 2, oz+z); scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.4,8,6), hedgeMat);
    crown.position.set(ox+x, 4.2, oz+z); scene.add(crown);
  }
  for(const [x,z,w] of [[-16,8,5],[16,6,5]]) box(x, .9, z, w, 1.8, 1.4, sandbagMat, true, .25); // barykady

  // === STREFA2 — patio (etap2): skrzynie, drugi wrak, murki ===
  for(const [x,z,s] of [[-15,-12,2],[15,-14,2],[-8,-22,1.8],[8,-20,1.8],[0,-16,2]])
    box(x, s/2, z, s, s, s, crateMat, true, .25, Math.random()*.5);
  box(14, .6, -10, 4.2, 1.2, 2, carMat, true, .3, -.15); // drugi wrak (SUV, osłona)
  box(14, 1.6, -10.4, 2.4, 1.0, 1.8, carMat, false, 0, -.15);
  for(const [x,z,w] of [[-18,-18,4],[18,-20,4]]) box(x, .9, z, w, 1.8, 1.2, sandbagMat, true, .25); // murki

  // === STREFA3 — willa (etap3, finał): pokoje-osłony, meble + MEZZANINE ===
  box(-6, 3, -38, .6, H, 14, villaMat, true, .25);       // podział wewn. willi (z:-45..-31)
  box(8, 3, -34, 20, H, .6, villaMat, true, .25);        // podział wewn. willi (x:-2..18)
  box(12, 1, -38, 2, 2, 2, crateMat, true, .25);
  box(0, .8, -32, 2.4, 1.6, 1.2, doorMat);               // kanapa (deko)
  box(-18, 2.4, -44, 1.5, 1.3, .12, windowMat);          // obraz/sejf (deko, ściana za mezzanine)

  // >>> PIĘTRO / MEZZANINE (scene.addPlatform — TYLKO gracz): rampa w narożniku
  //     płn-zach. willi wnosi gracza na balkon z widokiem na finał. Rampa = 20
  //     wąskich progów po .12 (płynne wejście, brak teleportu); balkon = jeden
  //     podest o stałym topY 2.4. Wrogowie zostają na dole (brak pathfindingu). <<<
  addRamp(ox, oz, -19, -14.5, -33, -41, 2.4, 20, rampMat);   // rampa (z-33 dół → z-41 góra, topY 2.4)
  addDeck(ox, oz, -19, -12, -47, -41, 2.4, villaMat);        // podest balkonu
  box(-12, 2.9, -44, .14, .6, 6, villaRoofMat);              // reling wsch. balkonu (z:-47..-41)
  box(-13.25, 2.9, -41, 2.5, .6, .14, villaRoofMat);         // reling płd (poza wejściem rampy)
  box(-18, 1.2, -45.5, .4, 2.4, .4, villaMat);               // filar podparcia balkonu (deko)
  box(-13, 1.2, -45.5, .4, 2.4, .4, villaMat);
  box(-14, 3.4, -43.5, 2.4, 2, 1.2, doorMat, false, 0, .1);  // biurko szefa NA balkonie (deko, wysoko)

  // === OŚWIETLENIE: 12 świateł, ciepłe→chłodne, basen chłodny ===
  addLamp(ox, oz, 0, H-.3, 20, 0xffe0b0, 16, 34, .22);  // brama (ciepłe)
  addLamp(ox, oz, -14, H-.3, 6, 0xbfe4ff, 14, 30, .2);  // basen L (chłodne)
  addLamp(ox, oz, 14, H-.3, 4, 0xbfe4ff, 14, 30, .2);   // basen P
  addLamp(ox, oz, 0, H-.3, 2, 0xdce8ff, 13, 30, .2);    // dziedziniec środek
  addLamp(ox, oz, 0, H-.3, -6, 0xffe4c0, 12, 24, .18);  // bramownia
  addLamp(ox, oz, -15, H-.3, -14, 0xffdca0, 14, 30, .2);// patio L (ciepłe)
  addLamp(ox, oz, 15, H-.3, -16, 0xffdca0, 14, 30, .2); // patio P
  addLamp(ox, oz, 0, H-.3, -22, 0xffcf9a, 12, 26, .18); // patio środek
  addLamp(ox, oz, 0, H-.3, -28, 0xffb070, 10, 18, .16); // wyłom willi
  addLamp(ox, oz, -12, H-.3, -38, 0xff8a5a, 14, 28, .18);// willa L (ciepło-czerwone finał)
  addLamp(ox, oz, 12, H-.3, -38, 0xff8a5a, 14, 28, .18);// willa P
  addLamp(ox, oz, 0, H-.3, -44, 0xcfe0ff, 12, 24, .18); // willa głąb (chłodne)
  addLamp(ox, oz, -15, 5.0, -44, 0xffe0b0, 11, 20, .16);// balkon/mezzanine (ciepłe)

  const spawnPoint = V(ox, oz, 0, 1.7, 20);
  // uszeregowane: dziedziniec/basen → patio → willa (finał)
  const enemySpawnPoints = [
    [-14.7,9.9],[15.3,7.9],[-6,-2],[6,-2],[0,4],[-12,10],  // S1 6
    [-12.4,-12],[17.6,-14],[-7.5,-19.6],[8.5,-17.6],[2.6,-16],[-16,-24],[16,-24], // S2 7
    [-14,-38],[14.3,-38],[-4.4,-44],[6,-44],[0,-32],[-10,-42],[16,-42],[0,-46], // S3 8 (nie pod balkonem)
  ].map(([x,z]) => V(ox, oz, x, 0.0, z));
  const coverPoints = [
    [-15,8],[15,6],[0,4],[-16,8],
    [-15,-12],[15,-14],[0,-16],[-18,-18],[18,-20],
    [-14,-40],[12,-38],[0,-32],[-10,-42],
  ].map(([x,z]) => V(ox, oz, x, 1.0, z));
  return {spawnPoint, enemySpawnPoints, coverPoints};
}

/* ============================================================
   API PUBLICZNE
============================================================ */
const BUILDERS = {
  warehouse:  buildWarehouse,
  outpost:    buildOutpost,
  street:     buildStreet,
  house:      buildHouse,
  industrial: buildIndustrial,
  bunker:     buildBunker,
  airfield:   buildAirfield,
  train:      buildTrain,
  harbor:     buildHarbor,
  compound:   buildCompound,
};

// Buduje lokację leniwie i idempotentnie. Zwraca
// {spawnPoint, enemySpawnPoints, coverPoints}. Dla nieznanego id -> null.
// Przy ponownym wejściu (replay misji) zamyka z powrotem ewentualną bramę
// otwartą w poprzednim podejściu, żeby stan startowy był deterministyczny.
export function loadLocation(id){
  if(built[id]){ resetGate(id); resetLevers(id); return built[id]; }  // już zbudowana — nie duplikuj
  const builder = BUILDERS[id];
  if(!builder) return null;                // nieznane id
  _currentLocationId = id;                 // addLamp() rejestruje światła pod tym obszarem
  let result;
  try { result = builder(); }
  finally { _currentLocationId = null; }   // nigdy nie zostaw błędnego id (nawet gdy builder rzuci)
  built[id] = result;
  return result;
}

// === CZĘŚĆ 2: GENERYCZNE OTWARCIE BRAMY ETAPOWEJ ===
// openGate(id) usuwa collider bramy i unosi ją (animacja w górę, wzorem
// tryBreachDoor). Dla lokacji BEZ zarejestrowanej bramy = bezpieczny no-op
// (return false). Wywołanie po stronie missions.js (przejście między etapami)
// dopina użytkownik — tu przygotowana jest tylko strona locations.js.
// Zarejestrowane bramy: 'bunker' (schowek-arsenał), 'harbor' (nadwodna alejka),
// 'compound' (środkowy przejazd dziedzińca). Wszystkie blokują OPCJONALNE
// przejścia (są trasy alternatywne), więc misja jest przechodliwa nawet gdy
// openGate nie zostanie wywołane.
export function openGate(id){
  const g = gates[id];
  if(!g || g.opened) return false;
  g.opened = true;
  const i = colliders.indexOf(g.colliderBox);
  if(i >= 0) colliders.splice(i, 1);       // brama przestaje blokować
  const li = losOccluders.indexOf(g.mesh); // ...i przestaje być widmowym blokerem LOS
  if(li >= 0) losOccluders.splice(li, 1);
  const mesh = g.mesh;
  const startY = g.baseY;
  const targetY = startY + g.rise;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const dur = 700;
  function slide(now){
    const p = Math.min(1, (now - t0) / dur);
    mesh.position.y = startY + (targetY - startY) * (1 - (1-p)*(1-p));  // easeOutQuad
    if(p < 1 && typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(slide);
  }
  if(typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(slide);
  else mesh.position.y = targetY;
  return true;
}

// Wyważenie drzwi w 'house'. Tanie i bez efektów ubocznych gdy nieaktualne:
// zwraca false jeśli dom nie zbudowany, drzwi już wyważone lub gracz za daleko.
export function tryBreachDoor(playerPos){
  if(!houseDoor || houseDoor.breached || !playerPos) return false;
  const c = houseDoor.center;
  const dx = playerPos.x - c.x, dz = playerPos.z - c.z;
  if(dx*dx + dz*dz > 2.0*2.0) return false;   // poza zasięgiem interakcji (~2 j.)

  houseDoor.breached = true;
  // usuń kolizję drzwi (stają się przejściem)
  const i = colliders.indexOf(houseDoor.colliderBox);
  if(i >= 0) colliders.splice(i, 1);
  const li = losOccluders.indexOf(houseDoor.mesh); // wyważone drzwi przestają blokować LOS
  if(li >= 0) losOccluders.splice(li, 1);
  // animacja: obrót skrzydła wokół zawiasu (kopnięcie do środka)
  const pivot = houseDoor.pivot;
  const target = -Math.PI/2;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const dur = 260;
  function swing(now){
    const p = Math.min(1, (now - t0) / dur);
    // easeOutQuad
    pivot.rotation.y = target * (1 - (1-p)*(1-p));
    if(p < 1) requestAnimationFrame(swing);
  }
  if(typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(swing);
  else pivot.rotation.y = target;
  return true;
}

// Czy drzwi w 'house' zostały już wyważone? (dla misji 4 — trigger mikro-narracji)
export function isDoorBreached(){
  return !!(houseDoor && houseDoor.breached);
}

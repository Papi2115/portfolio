import * as THREE from 'three';

/* ============================================================
   SCENA
============================================================ */
export const canvas = document.getElementById('c');
// Cap gęstości pikseli. 1.0 = renderujemy dokładnie tyle pikseli, ile ma canvas (żadnego
// supersamplingu). Na ekranach high-DPI (devicePixelRatio 2-3) to 4-9× MNIEJ pracy fragment
// shadera niż pełna gęstość — najskuteczniejszy pojedynczy lewar na koszt GPU. Trzymane jako
// łatwo zmienialna stała: podnieś do 1.5, jeśli sprzęt daje zapas i chcesz ostrzejszy obraz.
const MAX_PIXEL_RATIO = 1.0;
// antialias:false — MSAA jest jednym z najdroższych ustawień na słabych/zintegrowanych GPU,
// szczególnie w połączeniu z cieniami i wieloma światłami (wielokrotne próbkowanie każdego
// piksela krawędzi). Wyłączenie zdejmuje ten koszt kosztem lekko poszarpanych krawędzi.
export const renderer = new THREE.WebGLRenderer({canvas, antialias:false});

/* ============================================================
   DIAGNOSTYKA SPRZĘTOWA — jaki silnik WebGL faktycznie renderuje?
   Jeśli string renderera zawiera "SwiftShader"/"llvmpipe"/"Software", przeglądarka
   renderuje PROGRAMOWO (na CPU) zamiast na GPU — to samo w sobie tłumaczy sufit ~20 FPS
   niezależnie od optymalizacji sceny. To ustawienie przeglądarki/sterowników/systemu,
   nie coś do naprawienia w kodzie gry. Wynik ląduje w window.__gpuInfo i konsoli.
============================================================ */
try {
  const gl = renderer.getContext();
  const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererStr = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vendorStr = dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  console.log('[GPU] Renderer:', rendererStr, '| Vendor:', vendorStr);
  window.__gpuInfo = { renderer: rendererStr, vendor: vendorStr };
} catch(e) { console.warn('[GPU] Nie udało się odczytać info o GPU', e); }

renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // tańsze niż PCFSoftShadowMap (mniej próbek na fragment)
renderer.toneMapping = THREE.ReinhardToneMapping; // ACES→Reinhard: tańszy tone-mapping na fragment
renderer.toneMappingExposure = 1.4;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1420);
scene.fog = new THREE.FogExp2(0x0a1420, 0.009);

export const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .05, 400);

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================================================
   REJESTR ŚWIATEŁ WG OBSZARU (culling świateł nieaktywnej lokacji)
   ------------------------------------------------------------
   Forward renderer three.js pakuje uniformy WSZYSTKICH świateł co klatkę i
   liczy oświetlenie per-piksel dla każdego z nich. Lokacje misji nigdy nie
   usuwają swojej geometrii/świateł (celowo — zero ryzyka utraty stanu), więc
   po przejściu kampanii w scenie zbiera się ~124 PointLight naraz. Ten rejestr
   pozwala trzymać widoczne (light.visible=true) TYLKO światła aktywnego obszaru
   (baza albo jedna bieżąca lokacja); reszta dostaje visible=false. Nic nie jest
   usuwane — tylko przełączana widoczność. Rejestr żyje w scene.js (nie w
   locations.js), bo locations.js już importuje ze scene.js — inaczej cykl.
============================================================ */
export const lightsByArea = new Map(); // areaId -> THREE.Light[]
export function registerAreaLight(light, areaId){
  if(!lightsByArea.has(areaId)) lightsByArea.set(areaId, []);
  lightsByArea.get(areaId).push(light);
}
let _activeArea = 'base';
export function setActiveArea(areaId){
  if(areaId === _activeArea) return;        // no-op jeśli już aktywne
  _activeArea = areaId;
  for(const [id, lights] of lightsByArea){
    const vis = (id === areaId);
    for(const l of lights) l.visible = vis;
  }
}
export function getActiveArea(){ return _activeArea; }

/* --- światła --- */
scene.add(new THREE.HemisphereLight(0x8fb8d8, 0x1a2b1f, 0.8));
const moon = new THREE.DirectionalLight(0xbfd8ff, 1.3);
moon.position.set(30, 50, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(512, 512);                         // 1024→512: kolejne 4× mniej texeli mapy cieni (dominujący koszt fill shadow-passu, renderowanego co klatkę)
moon.shadow.camera.left=-50; moon.shadow.camera.right=50;   // ±60→±50: ciaśniej wokół budynku (x∈[-18,18], z∈[-42,8]) — odzyskuje część gęstości utraconej na 1024
moon.shadow.camera.top=50; moon.shadow.camera.bottom=-50;
moon.shadow.camera.far = 150;
scene.add(moon);

/* --- proceduralne tekstury --- */
function makeCanvasTex(size, fn){
  const cv = document.createElement('canvas'); cv.width=cv.height=size;
  fn(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
const groundTex = makeCanvasTex(512,(g,s)=>{
  g.fillStyle='#2b3a2e'; g.fillRect(0,0,s,s);
  for(let i=0;i<4000;i++){
    g.fillStyle = `rgba(${30+Math.random()*40|0},${50+Math.random()*40|0},${30+Math.random()*30|0},.5)`;
    g.fillRect(Math.random()*s, Math.random()*s, 2+Math.random()*3, 2+Math.random()*3);
  }
  g.strokeStyle='rgba(0,0,0,.15)'; g.lineWidth=2;
  for(let i=0;i<12;i++){ g.beginPath(); g.moveTo(Math.random()*s,0); g.lineTo(Math.random()*s,s); g.stroke(); }
});
groundTex.repeat.set(4,6); // dopasowane do zmniejszonej podłogi (36×54, patrz niżej)
const metalTex = makeCanvasTex(256,(g,s)=>{
  g.fillStyle='#4a5158'; g.fillRect(0,0,s,s);
  for(let i=0;i<800;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*.06})`; g.fillRect(Math.random()*s,Math.random()*s,1,8+Math.random()*20); }
  for(let i=0;i<300;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*.2})`; g.fillRect(Math.random()*s,Math.random()*s,2,2); }
});
const crateTex = makeCanvasTex(256,(g,s)=>{
  g.fillStyle='#6b5233'; g.fillRect(0,0,s,s);
  g.strokeStyle='#4a3820'; g.lineWidth=8; g.strokeRect(4,4,s-8,s-8);
  g.beginPath(); g.moveTo(0,0); g.lineTo(s,s); g.moveTo(s,0); g.lineTo(0,s); g.stroke();
  for(let i=0;i<400;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*.15})`; g.fillRect(Math.random()*s,Math.random()*s,3,1); }
});
export function targetTexture(){
  return makeCanvasTex(256,(g,s)=>{
    const c=s/2;
    g.fillStyle='#e8e2d0'; g.beginPath(); g.arc(c,c,c,0,7); g.fill();
    const rings=[[c*.92,'#d8d2c0'],[c*.72,'#c33'],[c*.52,'#e8e2d0'],[c*.34,'#c33'],[c*.16,'#222']];
    for(const [r,col] of rings){ g.fillStyle=col; g.beginPath(); g.arc(c,c,r,0,7); g.fill(); }
    g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=2;
    for(const [r] of rings){ g.beginPath(); g.arc(c,c,r,0,7); g.stroke(); }
  });
}

/* --- podłoże: dopasowane do budynku (x∈[-16,16], z∈[-42,8]) + mały margines,
   nie ogromna płaszczyzna 160×160 rozciągająca się w pustkę poza ścianami --- */
export const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(36,54),
  new THREE.MeshStandardMaterial({map:groundTex, roughness:.95})
);
ground.rotation.x = -Math.PI/2;
ground.position.set(0,0,-17); // środek budynku w Z: (8 + -42)/2 = -17
ground.receiveShadow = true;
scene.add(ground);

// gwiazdy
{
  const g = new THREE.BufferGeometry();
  const pos = [];
  for(let i=0;i<700;i++){
    const th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI*.45;
    const r=300;
    pos.push(r*Math.sin(ph)*Math.cos(th), r*Math.cos(ph)+10, r*Math.sin(ph)*Math.sin(th));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({color:0xcfe0ff,size:1.2,sizeAttenuation:false,fog:false})));
}

export const colliders = []; // AABB {min,max}
// Dedykowana, mała lista przeszkód blokujących LOS wrogów (tylko ściany + skrzynie-osłony).
// enemies.js raycastuje po NIEJ zamiast po scene.children rekurencyjnie — pomija dekoracyjną
// drobnicę (broń na ścianie, narzędzia, makieta miasta, gwiazdy, cele, tracery, inni wrogowie),
// co drastycznie skraca każdy check LOS bez zmiany tego, co realnie zasłania widoczność.
export const losOccluders = [];

// Podesty/piętra: gracz (TYLKO gracz, nie wrogowie — silnik ma kolizję 2D XZ i
// jedną stałą wysokość gruntu; to najmniejsza bezpieczna rozbudowa, żeby dodać
// realną WERTYKALNOŚĆ bez przebudowy AI/kolizji wrogów) może wejść na
// zarejestrowany podest — main.js co klatkę bierze NAJWYŻSZY podest, którego
// odcinek XZ zawiera bieżącą pozycję gracza, jako efektywną wysokość gruntu.
// Rampa/schody = wiele wąskich, sąsiadujących podestów o rosnącym topY (każdy
// próg mały, więc "wejście" wygląda i czuje się jak płynne wchodzenie po
// stopniach, nie teleportacja).
export const platforms = [];
export function addPlatform(minX, maxX, minZ, maxZ, topY){
  platforms.push({minX, maxX, minZ, maxZ, topY});
}
export function groundHeightAt(x, z){
  let h = 0; // bazowy poziom gruntu (świat y=0, oczy gracza +1.7 nad tym)
  for(const p of platforms){
    if(x>=p.minX && x<=p.maxX && z>=p.minZ && z<=p.maxZ && p.topY>h) h = p.topY;
  }
  return h + 1.7;
}
export function addCollider(mesh, pad=0){
  mesh.updateWorldMatrix(true,false);
  const box = new THREE.Box3().setFromObject(mesh);
  box.min.x-=pad; box.min.z-=pad; box.max.x+=pad; box.max.z+=pad;
  colliders.push(box);
}

// mur dookoła
export const wallMat = new THREE.MeshStandardMaterial({map:metalTex, color:0x9aa4ad, roughness:.8});
function wall(x,z,w,d,h=4){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
  m.position.set(x,h/2,z); m.castShadow=m.receiveShadow=true;
  scene.add(m); addCollider(m,.3);
  losOccluders.push(m); // ściana blokuje LOS wrogów
}
export const B=45; // niewidzialny bezpiecznik granicy areny (main.js/enemies.js); budynek jest MNIEJSZY niż B — to OK

// materiał skrzyń — osłony budowane WEWNĄTRZ strzelnicy (patrz sekcja STRZELNICA niżej)
export const crateMat = new THREE.MeshStandardMaterial({map:crateTex, roughness:.9});

// lampy
function lamp(x,z,color=0xffc476){
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,5,8), new THREE.MeshStandardMaterial({color:0x30363c}));
  pole.position.set(x,2.5,z); pole.castShadow=true; scene.add(pole); addCollider(pole,.2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22,12,12), new THREE.MeshBasicMaterial({color}));
  head.position.set(x,5,z); scene.add(head);
  const L = new THREE.PointLight(color, 26, 24, 1.8);
  L.position.set(x,4.7,z); scene.add(L);
  registerAreaLight(L, 'base');
}
// (dawne rozproszone lampy placu usunięte — oświetlenie budowane per-pokój niżej)

/* ============================================================
   STÓŁ RUSZNIKARZA
============================================================ */
export const craftTable = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({color:0x5a4630, roughness:.85, map:crateTex});
  const top = new THREE.Mesh(new THREE.BoxGeometry(3,.18,1.5), wood);
  top.position.y = 1.05; top.castShadow=top.receiveShadow=true; craftTable.add(top);
  for(const [lx,lz] of [[-1.3,-.55],[1.3,-.55],[-1.3,.55],[1.3,.55]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.16,1.0,.16), wood);
    leg.position.set(lx,.5,lz); leg.castShadow=true; craftTable.add(leg);
  }
  // imadło + narzędzia (dekoracja)
  const vice = new THREE.Mesh(new THREE.BoxGeometry(.35,.25,.3), new THREE.MeshStandardMaterial({color:0x384048, metalness:.6, roughness:.4}));
  vice.position.set(-1.05,1.25,0); craftTable.add(vice);
  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(.5,.22,.3), new THREE.MeshStandardMaterial({color:0x8f3030, roughness:.6}));
  toolbox.position.set(1.05,1.25,-.3); toolbox.rotation.y=.4; craftTable.add(toolbox);
  // neon nad stołem
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6,.5,.08), new THREE.MeshBasicMaterial({color:0x0d2018}));
  sign.position.set(0,3.4,-.6); craftTable.add(sign);
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.4,.34), new THREE.MeshBasicMaterial({color:0x4dffa0, transparent:true, opacity:.9}));
  signGlow.position.set(0,3.4,-.55); craftTable.add(signGlow);
  const slat1 = new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.3,6), new THREE.MeshStandardMaterial({color:0x30363c}));
  slat1.position.set(-1.2,2.2,-.6); craftTable.add(slat1);
  const slat2 = slat1.clone(); slat2.position.x=1.2; craftTable.add(slat2);
  const tLight = new THREE.PointLight(0x4dffa0, 18, 12, 1.8);
  tLight.position.set(0,3,0.5); craftTable.add(tLight);
  registerAreaLight(tLight, 'base');
}
craftTable.position.set(-9,0,-2);
scene.add(craftTable);
addCollider(craftTable,.3);
export const TABLE_POS = new THREE.Vector3(-9,0,-2);

// hologram broni nad stołem (widoczny w trybie craftingu)
export const holoGroup = new THREE.Group();
holoGroup.position.set(-9, 2.1, -2);
scene.add(holoGroup);
export const holoLight = new THREE.PointLight(0xffffff, 0, 8, 1.6);
holoLight.position.set(-9,3.2,-2);
scene.add(holoLight);

/* ============================================================
   BAZA AGENTA — ZWARTY BUDYNEK ZBUDOWANY OD ZERA
   Cały układ w x∈[-18,18], z∈[-42,8]. Stary otwarty plac (mur ±45,
   rozrzucone skrzynie/lampy) USUNIĘTY. Rozkład (ściana=.3 gr., h=3.6):
     FOYER      x∈[-4,4],     z∈[2,8]    — przedsionek, spawn gracza (0,1.7,4), front z=8 otwarty
     KORYTARZ   x∈[-2.5,2.5], z∈[-20,2]  — oś budynku, drzwi boczne z∈[-2,0.4], wylot z=-20
     WARSZTAT   x∈[-16,-2.5], z∈[-8,2]   — stół (-9,0,-2) + ściana z bronią (płd. z=-8)
     MISJE      x∈[2.5,16],   z∈[-8,2]   — makieta miasta (9,0,-2)
     STRZELNICA x∈[-16,16],   z∈[-42,-20]— hala; wejście = otwór w płn. ścianie x∈[-2.5,2.5]
   Uwaga: północna krawędź warsztatu/misji = z=2 (nie 4 z planu), aby ściany
   były szczelne ze złączem foyer/korytarza w z=2 (żadna ściana nie wchodzi w foyer).
============================================================ */

/* --- sylwetka broni (czysta dekoracja, prymitywy) --- */
function decoGun(scale=1, bodyCol=0x2a2e33){
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({color:bodyCol, metalness:.55, roughness:.5});
  const wood  = new THREE.MeshStandardMaterial({color:0x4a3520, roughness:.85});
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1,.15,.12), metal); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.75,8), metal);
  barrel.rotation.z=Math.PI/2; barrel.position.x=.88; g.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.38,.2,.1), wood);
  stock.position.x=-.66; g.add(stock);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.1,.3,.09), metal);
  mag.position.set(-.02,-.22,0); mag.rotation.z=.22; g.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.09,.24,.09), metal);
  grip.position.set(-.3,-.17,0); grip.rotation.z=.38; g.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(.14,.06,.06), metal);
  sight.position.set(.15,.11,0); g.add(sight);
  g.scale.setScalar(scale);
  // brak castShadow: 5 broni × 6 prymitywów = 30 mikro-casterów dekoracji wiszącej na ścianie —
  // ich cień jest niewidoczny, a każdy caster to dodatkowy rysunek w shadow-passie CO KLATKĘ
  return g;
}

/* --- FOYER + KORYTARZ: przedsionek gracza i oś budynku --- */
{
  // FOYER (x∈[-4,4], z∈[2,8]) — budynek jest teraz w pełni zamknięty, bez
  // wyjścia w pustą przestrzeń: ściana frontowa (z=8) domyka przedsionek.
  wall(-4,5, .3, 6, 3.6);        // ściana zachodnia foyer (z∈[2,8])
  wall( 4,5, .3, 6, 3.6);        // ściana wschodnia foyer (z∈[2,8])
  wall(0,8, 8.3, .3, 3.6);       // ściana frontowa foyer (domyka budynek na z=8)
  // tylna ściana foyer w z=2 z drzwiami do korytarza (przerwa x∈[-1.2,1.2] ≈2.4 j.);
  // odcinki x∈[-4,-2.5] i [2.5,4] domykają ściany północne warsztatu/misji (poniżej)
  wall(-1.85,2, 1.3, .3, 3.6);   // segment lewy (x∈[-2.5,-1.2])
  wall( 1.85,2, 1.3, .3, 3.6);   // segment prawy (x∈[1.2,2.5])
  const fLight = new THREE.PointLight(0x9fd0ff, 10, 15, 1.8); fLight.position.set(0,3.4,5); scene.add(fLight);
  registerAreaLight(fLight, 'base');

  // KORYTARZ (x∈[-2.5,2.5], z∈[-20,2]) — ściany boczne pełnią też rolę
  // wschodniej/zachodniej ściany warsztatu i pokoju misji. Każda ma drzwi w z∈[-2,0.4].
  wall(-2.5, 1.2, .3, 1.6, 3.6); // lewa: segment górny z∈[0.4,2]
  wall(-2.5,-11, .3, 18, 3.6);   // lewa: segment dolny z∈[-20,-2] (drzwi do warsztatu w przerwie)
  wall( 2.5, 1.2, .3, 1.6, 3.6); // prawa: segment górny
  wall( 2.5,-11, .3, 18, 3.6);   // prawa: segment dolny (drzwi do pokoju misji w przerwie)
  // zimne oświetlenie sufitowe korytarza — 1 światło (było 3) o większym zasięgu,
  // wyśrodkowane na długości korytarza (z∈[-20,2], środek z=-9); mniej świateł
  // w scenie = mniej pracy na piksel w każdej klatce (forward rendering liczy
  // WSZYSTKIE światła dla każdego fragmentu, niezależnie od zasięgu).
  const corridorLight = new THREE.PointLight(0xbfe0ff, 9, 24, 2.0);
  corridorLight.position.set(0,3.3,-9); scene.add(corridorLight);
  registerAreaLight(corridorLight, 'base');
}

/* --- WARSZTAT (x∈[-16,-2.5], z∈[-8,2]): stół (-9,0,-2) + ściana z bronią --- */
{
  wall(-9.25, 2, 13.5, .3, 3.6); // ściana północna (x∈[-16,-2.5]) — domyka też foyer w z=2
  wall(-9.25,-8, 13.5, .3, 3.6); // ściana południowa (nośnik broni)
  wall(-16,-3, .3, 10, 3.6);     // ściana zachodnia (z∈[-8,2])
  // (ściana wschodnia = lewa ściana korytarza x=-2.5, zbudowana wyżej, z drzwiami)
  const wsCeil = new THREE.PointLight(0xffe0c0, 13, 17, 1.9); // ciepłe światło warsztatu
  wsCeil.position.set(-9,3.4,-3); scene.add(wsCeil);
  registerAreaLight(wsCeil, 'base');

  // 5 broni powieszonych na ścianie POŁUDNIOWEJ (z=-8), zwrócone w +Z (do wnętrza)
  const rack = new THREE.Group();
  const gunSpecs = [
    [-11.7, 2.7, 1.05,  .10, 0x2b3038],
    [-10.3, 1.75, .85, -.06, 0x39322a],
    [ -9.0, 2.85, 1.15,  0,  0x2a2e33],
    [ -7.6, 1.65, .9,   .08, 0x33383f],
    [ -6.3, 2.6,  1.0, -.12, 0x24343a],
  ];
  for(const [gx,gy,gs,rz,col] of gunSpecs){
    const gun = decoGun(gs, col);
    gun.position.set(gx, gy, -7.75);
    gun.rotation.z = rz;
    rack.add(gun);
  }
  for(const [gx,gy] of gunSpecs){
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.28,6),
      new THREE.MeshStandardMaterial({color:0x1a1d20}));
    peg.rotation.x=Math.PI/2; peg.position.set(gx, gy-.12, -7.88); rack.add(peg);
  }
  scene.add(rack);

  // oświetlenie ściany broni — 1 wyśrodkowane światło o większym zasięgu (było 2)
  const glWall = new THREE.PointLight(0xffd9a0, 14, 13, 2.0); glWall.position.set(-9,3.1,-7); scene.add(glWall);
  registerAreaLight(glWall, 'base');

  // regał z narzędziami na zachodniej ścianie (dekoracja)
  const rackBoardMat = new THREE.MeshStandardMaterial({color:0x2a2016, roughness:.9});
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(.2,1.4,2.6), rackBoardMat);
  shelf.position.set(-15.7,1.7,-3); shelf.castShadow=true; scene.add(shelf);
  const toolCols=[0x8a8f96,0xb04a2a,0x3a7d5a,0xc7a53a];
  for(let i=0;i<6;i++){
    const t = new THREE.Mesh(new THREE.BoxGeometry(.12,.28+Math.random()*.3,.12),
      new THREE.MeshStandardMaterial({color:toolCols[i%toolCols.length], metalness:.3, roughness:.6}));
    t.position.set(-15.6, 1.3+Math.random()*.9, -4.1 + i*.42); scene.add(t);
  }
}

/* --- B) MAKIETA MIASTA: podest + miniatura, punkt wyboru misji [F] --- */
export const DIORAMA_POS = new THREE.Vector3(9,0,-2);
export const cityDiorama = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({color:0x4a3d2c, roughness:.85, map:crateTex});
  const top = new THREE.Mesh(new THREE.BoxGeometry(3,.18,2), wood);
  top.position.y=1.05; top.castShadow=top.receiveShadow=true; cityDiorama.add(top);
  for(const [lx,lz] of [[-1.35,-.8],[1.35,-.8],[-1.35,.8],[1.35,.8]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.16,1.0,.16), wood);
    leg.position.set(lx,.5,lz); leg.castShadow=true; cityDiorama.add(leg);
  }
  // płyta bazowa miasta
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.7,.05,1.7),
    new THREE.MeshStandardMaterial({color:0x20262b, roughness:.9}));
  plate.position.y=1.17; cityDiorama.add(plate);
  // drogi (cienkie jasne paski w siatce)
  const roadMat = new THREE.MeshStandardMaterial({color:0x3a4147, roughness:.8});
  for(const rx of [-.9,-.05,.85]){
    const r = new THREE.Mesh(new THREE.BoxGeometry(.09,.02,1.6), roadMat);
    r.position.set(rx,1.2,0); cityDiorama.add(r);
  }
  for(const rz of [-.55,.05,.6]){
    const r = new THREE.Mesh(new THREE.BoxGeometry(2.6,.02,.09), roadMat);
    r.position.set(0,1.2,rz); cityDiorama.add(r);
  }
  // budynki (siatka ulic, różne wysokości)
  const bldCols=[0x6b7278,0x565c62,0x7a828a,0x4a5056,0x848b91];
  let bi=0;
  for(let cx=-1.15; cx<=1.15; cx+=0.46){
    for(let cz=-0.7; cz<=0.7; cz+=0.42){
      if(Math.abs(cx)<0.12 && Math.abs(cz)<0.12) continue; // środek: plac
      const h = 0.12 + Math.random()*0.32;
      const w = 0.16 + Math.random()*0.12;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,w),
        new THREE.MeshStandardMaterial({color:bldCols[bi++%bldCols.length], roughness:.7, metalness:.15}));
      b.position.set(cx + (Math.random()-.5)*.06, 1.2+h/2, cz + (Math.random()-.5)*.06);
      cityDiorama.add(b); // bez castShadow: ~15 malutkich budynków-makiety na stole; cień pomijalny, caster w shadow-passie realny
      // punktowe "okna" (emisyjny akcent na wieżowcach)
      if(h>0.28){
        const win = new THREE.Mesh(new THREE.BoxGeometry(w*1.02,h*0.5,w*1.02),
          new THREE.MeshBasicMaterial({color:0x2a6a9a}));
        win.position.set(b.position.x, 1.2+h*0.55, b.position.z); cityDiorama.add(win);
      }
    }
  }
  // holo-znacznik nad makietą (sygnalizuje strefę misji)
  const beacon = new THREE.Mesh(new THREE.ConeGeometry(.12,.3,4),
    new THREE.MeshBasicMaterial({color:0xff5a3c}));
  beacon.position.set(0,1.75,0); beacon.rotation.x=Math.PI; cityDiorama.add(beacon);
  // "neon" nad strefą (beacon jest już samoświecący przez MeshBasicMaterial —
  // nie potrzebuje własnego PointLight; zostaje 1 światło dla całej makiety, było 2)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8,.28),
    new THREE.MeshBasicMaterial({color:0xff7a4a, transparent:true, opacity:.85}));
  sign.position.set(0,3.0,-.9); cityDiorama.add(sign);
  const dLight = new THREE.PointLight(0xffb08a, 11, 11, 1.8); dLight.position.set(0,2.2,0); cityDiorama.add(dLight);
  registerAreaLight(dLight, 'base');
}
cityDiorama.position.copy(DIORAMA_POS);
scene.add(cityDiorama);
addCollider(cityDiorama,.3);

/* --- POKÓJ WYBORU MISJI (x∈[2.5,16], z∈[-8,2]): 3 ściany + makieta @ (9,0,-2) ---
   (ściana zachodnia = prawa ściana korytarza x=2.5 z drzwiami, zbudowana wyżej) */
{
  wall(9.25, 2, 13.5, .3, 3.6);  // ściana północna (x∈[2.5,16]) — domyka też foyer w z=2
  wall(9.25,-8, 13.5, .3, 3.6);  // ściana południowa
  wall(16,-3, .3, 10, 3.6);      // ściana wschodnia (z∈[-8,2])
  const msCeil = new THREE.PointLight(0xffd9c0, 12, 16, 1.9);
  msCeil.position.set(9,3.4,-3); scene.add(msCeil);
  registerAreaLight(msCeil, 'base');
}

/* --- STRZELNICA (x∈[-16,16], z∈[-42,-20]): hala z celami (targets.js) --- */
{
  // ściany hali. Północna (z=-20) z otworem na korytarz x∈[-2.5,2.5] (bez segmentów drzwi
  // — korytarz i tak kończy się tu ścianami szczytowymi na x=±2.5).
  wall(-9.25,-20, 13.5, .3, 3.6); // płn. segment lewy (x∈[-16,-2.5])
  wall( 9.25,-20, 13.5, .3, 3.6); // płn. segment prawy (x∈[2.5,16])
  wall(0,-42, 32, .3, 3.6);       // południowa (za celami statycznymi)
  wall(-16,-31, .3, 22, 3.6);     // zachodnia (z∈[-42,-20])
  wall( 16,-31, .3, 22, 3.6);     // wschodnia (z∈[-42,-20])

  // barierka linii ognia (niska — kamera strzela ponad). Szer. 28 (x∈[-14,14]) — po ~2 j.
  // luzu przy ścianach ±16, żeby gracz mógł obejść ją głębiej w halę.
  wall(0,-23, 28, .4, 1.1);
  for(const px of [-13,-6.5,0,6.5,13]){
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,1.35,8),
      new THREE.MeshStandardMaterial({color:0x30363c, metalness:.4, roughness:.6}));
    p.position.set(px,.67,-23); p.castShadow=true; scene.add(p); addCollider(p,.15);
  }
  // reflektory hali — 2 lampy (było 4), wyśrodkowane na długości hali (z∈[-42,-20]
  // za barierką, z=-31) po obu stronach; mniej świateł = mniej pracy na piksel.
  lamp(-14,-31,0x9fd0ff); lamp(14,-31,0x9fd0ff);
  // tabliczka "RANGE" nad wejściem
  const rSign = new THREE.Mesh(new THREE.PlaneGeometry(4,.6),
    new THREE.MeshBasicMaterial({color:0x2fd6ff, transparent:true, opacity:.8}));
  rSign.position.set(0,3.2,-20.4); scene.add(rSign);

  // 5 skrzyń-osłon WEWNĄTRZ hali (między liniami celów, poza torami ruchu ruchomych celów)
  const coverPos = [[-4,-34,1.8],[4,-34,1.8],[-13,-34,1.5],[13,-34,1.5],[0,-32,1.4]];
  for(const [cx,cz,cs] of coverPos){
    const m = new THREE.Mesh(new THREE.BoxGeometry(cs,cs,cs), crateMat);
    m.position.set(cx, cs/2, cz);
    m.rotation.y = Math.random()*.6;
    m.castShadow=m.receiveShadow=true;
    scene.add(m); addCollider(m,.25);
    losOccluders.push(m); // skrzynia-osłona blokuje LOS wrogów (jak ściana)
  }
}

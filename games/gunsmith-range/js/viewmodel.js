import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { WEAPONS } from './weapons.js';
import { buildWeaponModel, effectiveStats } from './attachments.js';
import { buildHands } from './hands.js';
import { S } from './state.js';
import { updateHUD } from './hud.js';

/* ============================================================
   VIEWMODEL (broń w rękach)
============================================================ */
export const vmRoot = new THREE.Group();   // pozycja bazowa vm
camera.add(vmRoot);
scene.add(camera);
export let vmWeapon = null;
export const muzzleWorld = new THREE.Vector3();
// referencja do dłoni bieżącej broni ({group, dominant, support}) — odświeżana
// przy każdej przebudowie viewmodelu, by animacja przeładowania miała dostęp do
// wspierającej dłoni bez traverse całego drzewa co klatkę.
let currentHands = null;

export function refreshViewmodel(){
  if(vmWeapon) vmRoot.remove(vmWeapon);
  vmWeapon = buildWeaponModel(S.currentWeapon);
  // dłonie jako dziecko vmWeapon → dziedziczą jego transformacje (w tym mocowania Part A)
  // i są usuwane razem z vmWeapon przy każdym vmRoot.remove(vmWeapon) (nie trzeba śledzić osobno).
  currentHands = buildHands(S.currentWeapon);
  vmWeapon.add(currentHands.group);
  vmWeapon.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; } });
  // zapamiętaj pozycję spoczynkową magazynków (do animacji przeładowania) — reset przy każdej świeżej budowie
  vmWeapon.traverse(o=>{ if(o.userData.isMag){ o.userData.magHome = o.position.clone(); } });
  vmRoot.add(vmWeapon);
  const vm = WEAPONS[S.currentWeapon].vm;
  vmRoot.position.set(...vm.pos);
  S.ammo = Math.min(S.ammo, effectiveStats(S.currentWeapon).mag);
  updateHUD();
}

// muzzle flash na viewmodelu
export const flashMat = new THREE.MeshBasicMaterial({color:0xffcc66, transparent:true, opacity:0, depthTest:false});
export const flash = new THREE.Mesh(new THREE.SphereGeometry(.06,8,8), flashMat);
flash.renderOrder = 999;
vmRoot.add(flash);
export const flashLight = new THREE.PointLight(0xffaa44, 0, 10, 2);
camera.add(flashLight);
flashLight.position.set(0,-.1,-1);

export function decayFlash(dt){
  flashMat.opacity = Math.max(0, flashMat.opacity - dt*14);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt*260);
}

/* ============================================================
   ANIMACJA PRZEŁADOWANIA (czysto wizualna — dokładana NA WIERZCH
   transformacji vmRoot z main.js; wołana po ustawieniu pozycji/rotacji).
============================================================ */
function resetMags(){
  if(!vmWeapon) return;
  vmWeapon.traverse(o=>{ if(o.userData.isMag && o.userData.magHome){ o.position.copy(o.userData.magHome); } });
}
// przywróć wspierającą dłoń do pozycji spoczynkowej (mirror resetMags/magHome)
function resetSupportHand(){
  const sup = currentHands && currentHands.support;
  if(sup && sup.userData.restPos) sup.position.copy(sup.userData.restPos);
}
// Zwraca aktualny "dip" (0→1→0 sinus) bez mutowania niczego — main.js
// wlicza go w cel lerpa POZYCJI vmRoot przed .lerp(), inaczej offset
// kumulowałby się klatka po klatce (lerp startowałby z już przesuniętej
// pozycji z poprzedniej klatki) i byłby zależny od FPS.
export function reloadDip(){
  if(!S.reloading) return 0;
  const dur = effectiveStats(S.currentWeapon).reload;
  const now = performance.now()/1000;
  let t = 1 - (S.reloadEnd - now)/dur;          // 0 → 1 przez całe przeładowanie
  t = Math.max(0, Math.min(1, t));
  return Math.sin(Math.PI * t);                 // zerowy na brzegach, szczyt w środku
}

/* Choreografia przeładowania (WYRAŹNA, wieloetapowa — poprzednia .03/.13 była za subtelna).
   Rozłożona na CAŁY czas trwania (dur, ~1.1–3.2s), 5 faz sterowanych smoothstepem:
     0.00–0.15  dłoń wspierająca SIĘGA po magazynek (rest → magHome)
     0.15–0.40  dłoń CHWYTA i WYRYWA magazynek mocno w dół/na zewnątrz/ku graczowi
     0.40–0.55  pauza na dole (wymiana; stary magazynek „znika" — patrz nota niżej)
     0.55–0.80  NOWY magazynek wjeżdża z dołu z powrotem w gniazdo (odwrotność wyrwania)
     0.80–1.00  dłoń PUSZCZA magazynek i wraca na chwyt/łoże (rest); magazynek już w magHome
   Zakres wyrwania: −.40 Y (w dół), −.12 X (do środka ekranu = na zewnątrz od broni),
   +.10 Z (ku graczowi) — kilkukrotnie większy niż stare .13/.03, ma jednoznacznie
   wyglądać jak wyrzucony magazynek, nie drgnięcie. Wszystkie pozycje ustawiane
   BEZWZGLĘDNIE przez .set(...) od zapamiętanego magHome/restPos (nigdy +=/−=), więc
   brak dryfu przy wielokrotnych przeładowaniach i brak zależności od FPS.

   NOTA o zaniku starego magazynka (Part B faza 2): pominięty ŚWIADOMIE. Magazynki używają
   współdzielonych materiałów (M.body2/M.body/M.accent) razem z resztą korpusu broni —
   ustawienie material.opacity/transparent zdejmowałoby też połowę broni. Bezpieczny fade
   wymagałby klonowania materiału per-mag; ryzyko > korzyść, więc magazynek zostaje widoczny
   nisko podczas pauzy (priorytet: duży, czytelny ruch dłoni i magazynka). */
const DROP = { x:-.12, y:-.40, z:.10 };            // wektor wyrwania magazynka

let _reloadResetDone = false; // czy magazynki/dłoń już wróciły na spoczynek po zakończeniu przeładowania

export function updateReloadAnim(){
  if(!vmWeapon){ return; }                        // viewmodel jeszcze niezbudowany
  if(!S.reloading){
    // Reset TYLKO raz po zakończeniu przeładowania. Wcześniej resetMags() (traverse całego
    // drzewa broni) biegł 60×/s bez potrzeby przez cały czas, gdy gracz nie przeładowuje.
    if(!_reloadResetDone){ resetMags(); resetSupportHand(); _reloadResetDone = true; }
    return;
  }
  _reloadResetDone = false;
  const dur = effectiveStats(S.currentWeapon).reload;
  const now = performance.now()/1000;
  let t = 1 - (S.reloadEnd - now)/dur;
  t = Math.max(0, Math.min(1, t));
  const ss = THREE.MathUtils.smoothstep;          // smoothstep(x, min, max) → 0..1 (gładko)

  // out: 0 (w gnieździe) → 1 (wyrwany nisko, plateau w pauzie) → 0 (wsadzony z powrotem).
  const out = ss(t,.15,.40) - ss(t,.55,.80);
  let magCur = null;                              // pierwszy magazynek = cel dla dłoni
  vmWeapon.traverse(o=>{
    if(o.userData.isMag && o.userData.magHome){
      const h = o.userData.magHome;
      o.position.set(h.x + DROP.x*out, h.y + DROP.y*out, h.z + DROP.z*out);
      if(!magCur) magCur = o.position;            // referencja (nie mutowana dalej w tej klatce)
    }
  });

  // dłoń wspierająca: att = sięgnięcie (0→1 w 0–15%), rel = puszczenie (0→1 w 80–100%).
  // k = att*(1−rel): 0 na spoczynku, 1 gdy „na magazynku". Podąża za magCur przez cały
  // środek animacji (chwyt), więc wyrywa i wsadza magazynek razem z nim.
  const sup = currentHands && currentHands.support;
  if(sup && sup.userData.restPos && magCur){
    const r = sup.userData.restPos;
    const k = ss(t,0,.15) * (1 - ss(t,.80,1));
    sup.position.set(
      r.x + (magCur.x - r.x)*k,
      r.y + (magCur.y - r.y)*k,
      r.z + (magCur.z - r.z)*k,
    );
  }
}

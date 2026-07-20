import * as THREE from 'three';
import { AC, sfxEmpty } from './audio.js';
import { canvas, camera, TABLE_POS, DIORAMA_POS } from './scene.js';
import { S } from './state.js';
import { startReload, switchWeapon } from './combat.js';
import { openCraft, closeCraft } from './hud.js';
import { openMissionMap, closeMissionMap, missionState } from './missions.js';
import { WEAPONS } from './weapons.js';
import { tryBreachDoor, tryPullLever } from './locations.js';
import { throwGrenade } from './grenades.js';
import { grenadeInv, useGrenade, isWeaponUnlocked } from './progress.js';
import { sayOnce } from './narrator.js';
import { showWorkshopPrompt, hideWorkshopPrompt, showRangePrompt, hideRangePrompt } from './tutorialprompt.js';
import { currentStep, markDone } from './tutorialprogress.js';
import { openPauseMenu, closePauseMenu } from './menu.js';

/* ============================================================
   GRACZ / STEROWANIE
============================================================ */
export const player = {
  pos: new THREE.Vector3(0, 1.7, 4),
  vel: new THREE.Vector3(),
  yaw: Math.PI, pitch: 0,
  onGround: true,
  speed: 6.2, sprintMul: 1.55,
};
player.yaw = 0; // patrzy w -Z (na stół i strzelnicę)

export const keys = {};

// Stary splash #start jest ukrywany i neutralizowany przez menu.js (gra startuje
// od razu w trybie 'play'), więc dawny handler kliknięcia #start został usunięty
// jako martwy kod. Pierwszy gest gracza obsługuje teraz klik canvasu poniżej.
canvas.addEventListener('click', ()=>{
  // AC.resume() na PIERWSZY gest gracza — nie ma już przycisku START, który
  // dawniej to robił. Na już-działającym kontekście to no-op, więc wołanie przy
  // każdym kliknięciu canvasu jest nieszkodliwe.
  AC.resume();
  // Nie przejmuj pointer locka, gdy wisi panel końca misji — inaczej klik obok
  // przycisku natychmiast chowałby kursor i panel byłby praktycznie nieklikalny.
  if(S.mode==='play' && !S.pointerLocked && !S.missionEndScreenOpen) canvas.requestPointerLock();
});
// Flaga: ignoruj PIERWSZY mousemove po (ponownym) zablokowaniu kursora. Przeglądarki
// czasem dostarczają w tym evencie duży, "zaległy" ruch nagromadzony przed
// zablokowaniem (np. po Alt-Tab/ESC i powrocie) — bez tego gracz dostawał nagły,
// pozorny obrót kamerą "samo z siebie" (zgłoszony bug: "kamerą rzucało o 180 stopni").
let skipNextMouseDelta = false;
document.addEventListener('pointerlockchange', ()=>{
  S.pointerLocked = document.pointerLockElement === canvas;
  if(S.pointerLocked) skipNextMouseDelta = true;
});
document.addEventListener('mousemove', e=>{
  if(!S.pointerLocked || S.mode!=='play') return;
  if(skipNextMouseDelta){ skipNextMouseDelta = false; return; }
  const sens = .0022 * (S.aiming? .55 : 1);
  // Dodatkowe zabezpieczenie: przytnij pojedynczy skok ruchu myszy (nawet szybki,
  // realny ruch przy wysokim DPI/pollingu nie powinien przekraczać tego zakresu;
  // większe wartości to niemal na pewno zaległy/wadliwy delta z przeglądarki).
  const mx = Math.max(-250, Math.min(250, e.movementX));
  const my = Math.max(-250, Math.min(250, e.movementY));
  player.yaw   -= mx * sens;
  player.pitch -= my * sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
});
document.addEventListener('mousedown', e=>{
  if(S.mode!=='play'||!S.pointerLocked) return;
  if(e.button===0) S.firing=true;
  if(e.button===2) S.aiming=true;
});
document.addEventListener('mouseup', e=>{
  if(e.button===0) S.firing=false;
  if(e.button===2) S.aiming=false;
});
document.addEventListener('contextmenu', e=>e.preventDefault());

document.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(S.mode==='play'){
    // Escape → TOGGLE panelu pauzy (S.paused jako jedyne źródło prawdy). W Chrome
    // keydown z code==='Escape' NADAL dociera do document, mimo że przeglądarka
    // w tym samym momencie natywnie zwalnia pointer lock (zweryfikowane w preview).
    if(e.code==='Escape'){ if(S.paused) closePauseMenu(); else openPauseMenu(); return; }
    // Panel pauzy otwarty → zamroź resztę hotkeyów (R/E/G/cyfry). Bez tego G rzucałby
    // granatem, R przeładowywał, 1-9 zmieniały broń „za zasłoną" pauzy.
    if(S.paused) return;
    if(e.code==='KeyR') startReload();
    // KeyF: warsztat / mapa / wyważenie drzwi / pociągnięcie dźwigni. tryBreachDoor
    // i tryPullLever oba "nic nie robią" poza zasięgiem, więc kolejność jest bezpieczna.
    if(e.code==='KeyF'){ if(nearTable()) openCraft(); else if(nearDiorama()) openMissionMap(); else if(!tryBreachDoor(player.pos)) tryPullLever(player.pos); }
    if(e.code==='KeyG') throwSelectedGrenade();
    // generyczne po liczbie broni (Digit1..Digit9) — nie sztywno do 6, żeby nowe bronie miały hotkey
    const digitMatch = /^Digit([1-9])$/.exec(e.code);
    const digit = digitMatch ? Number(digitMatch[1])-1 : undefined;
    const wk = digit!==undefined ? Object.keys(WEAPONS)[digit] : undefined;
    // hotkey nie może obejść bramki odblokowań broni
    if(wk && wk!==S.currentWeapon && isWeaponUnlocked(wk)){ switchWeapon(wk); }
  } else if(S.mode==='craft'){
    // 'craft' obsługuje i warsztat (#craft) i mapę misji (#mission-map) — zamknij ten,
    // który jest aktualnie otwarty (inaczej closeCraft zostawiłby mapę widoczną).
    if(e.code==='KeyF'||e.code==='Escape'){
      const mm = document.getElementById('mission-map');
      if(mm && mm.classList.contains('open')) closeMissionMap();
      else closeCraft();
    }
  }
});
document.addEventListener('keyup', e=>keys[e.code]=false);

export function nearTable(){
  return player.pos.distanceTo(new THREE.Vector3(TABLE_POS.x, player.pos.y, TABLE_POS.z)) < 3.2;
}
// makieta miasta — punkt otwarcia dedykowanej MAPY MISJI (openMissionMap, osobny ekran)
export function nearDiorama(){
  return player.pos.distanceTo(new THREE.Vector3(DIORAMA_POS.x, player.pos.y, DIORAMA_POS.z)) < 3.2;
}
// strzelnica — hala w północnej części bazy (scene.js: STRZELNICA z∈[-42,-20]).
// Prosty próg z: gracz jest w hali gdy przekroczy wejście (z=-20) z małym marginesem.
export function nearRange(){
  return player.pos.z < -21;
}

/* ============================================================
   TUTORIAL — proximity-triggered wskazówki Kpt. Marasa.
   Wołane CO KLATKĘ z main.js tick() (tryb 'play'). sayOnce() sam pilnuje,
   że każda linia pokaże się TYLKO RAZ na przeglądarkę (localStorage), więc
   nie potrzeba tu własnych flag — wystarczy wołać przy spełnionym warunku.
============================================================ */
// Twarde bramkowanie sekwencyjne: narracja/prompt danego kroku odpala się TYLKO gdy
// currentStep() === ten krok (kolejność: warsztat → strzelnica → mapa misji). Dzięki temu
// podejście do strzelnicy PRZED ukończeniem warsztatu nic nie odpala. Prompt wizualny
// ([F] / mysz / podświetlenie dotyku) jest synchronizowany CO KLATKĘ (show gdy krok aktywny
// i gracz w pobliżu, hide w przeciwnym razie) — nie znika już po 2s narracji, tylko trwa
// dopóki gracz faktycznie nie wykona akcji. Ukończenie kroku = REALNA akcja (markDone):
//   - warsztat: openCraft() (hud.js),
//   - strzelnica: S.aiming w hali (wykrywane tutaj, poniżej),
//   - mapa misji: openMissionMap() (missions.js).
export function updateTutorialHints(){
  // W TRAKCIE MISJI: nigdy nie pokazuj/nie zaliczaj kroków tutorialowych. updateTutorialHints
  // żyje w bloku S.mode==='play', który działa też podczas walki, a nearRange() (samo z<-21,
  // bez granic X/bazy) bywa prawdą na lokacjach misji — bez tego guardu prompt/narracja/markDone
  // strzelnicy odpalałyby się w środku strzelaniny. Guard MUSI być pierwszy.
  if(missionState.active){ hideWorkshopPrompt(); hideRangePrompt(); return; }

  const step = currentStep();

  // --- WARSZTAT ---
  if(step==='workshop' && nearTable()){
    showWorkshopPrompt();
    sayOnce('tutorial_workshop', [
      "That's the gunsmith bench. Mod your loadout, buy new hardware.",
      "Press F when you're close to work it.",
    ], {});
  } else {
    hideWorkshopPrompt();
  }

  // --- STRZELNICA --- (ukończenie: gracz celuje ADS/prawy przycisk/touch-aim w hali)
  if(step==='range' && nearRange()){
    showRangePrompt();
    sayOnce('tutorial_range', [
      "The range. Get a feel for your weapon before it counts for real.",
    ], {});
    if(S.aiming) markDone('range');
  } else {
    hideRangePrompt();
  }

  // --- MAPA MISJI --- (ukończenie: openMissionMap() w missions.js)
  if(step==='missionmap' && nearDiorama()){
    sayOnce('tutorial_missionmap', [
      "The ops map. Pick your next job there — press F.",
    ], {});
  }
}

// Chowa wszystkie prompty tutorialowe. Wołane z hud.js/missions.js przy wejściu do
// warsztatu/mapy (S.mode przechodzi na 'craft' → updateTutorialHints przestaje być
// wołane, więc jego gałąź else-hide nie ma szansy zadziałać). Synchroniczne, więc
// prompt znika w tej samej klatce co przełączenie trybu (bez 1-klatkowego mrugnięcia).
export function hideAllTutorialPrompts(){
  hideWorkshopPrompt();
  hideRangePrompt();
}

/* ============================================================
   GRANATY — rzut wybranym typem (KeyG).
   Kierunek/punkt startu jak w combat.js tryFire(): pozycja kamery
   + wektor "w przód" z quaternionu kamery. Zużywa 1 sztukę z ekwipunku;
   przy zerze — suchy klik (sfxEmpty), bez rzutu.
============================================================ */
export function throwSelectedGrenade(){
  const type = grenadeInv.selected;
  if(useGrenade(type)){
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const from = camera.getWorldPosition(new THREE.Vector3());
    throwGrenade(type, from, dir);
  } else {
    sfxEmpty();
  }
}

/* ============================================================
   SPEED BLUR — lekki efekt prędkości (CSS filter na canvasie)
   Bez post-processingu: skalujemy blur poziomą prędkością gracza.
   0px w spoczynku (nie psuje celowania), max ~2px przy pełnym biegu.
   Tylko w trybie 'play'; poza nim czyścimy do 'none'.
============================================================ */
let _lastBlur = null;               // ostatnio ustawiona wartość (unikamy zbędnych zapisów co klatkę)
export function updateSpeedBlur(hv){
  if(!canvas) return;
  const px = S.mode==='play' ? Math.min(2, hv*0.15) : 0;
  const val = px < 0.02 ? 'none' : `blur(${px.toFixed(2)}px)`;
  if(val !== _lastBlur){ canvas.style.filter = val; _lastBlur = val; }
}

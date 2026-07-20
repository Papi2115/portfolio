/* ============================================================
   BAZA + PANEL PAUZY — start od razu w grze, pauza pod Escape.
   ------------------------------------------------------------
   Dawniej: pełnoekranowe menu tytułowe (START/Options/Exit) blokujące
   wejście do gry. Teraz: gra startuje NATYCHMIAST w bazie (S.mode='play'
   ustawiane synchronicznie przy załadowaniu modułu, bez czekania na klik),
   a ten sam DOM służy już tylko jako PANEL PAUZY wywoływany z player.js
   po Escape (openPauseMenu). Panel to overlay z pełnym tłem — gra fizycznie
   działa w tle, ale gracz niczego nie widzi/nie kliknie.
   AC.resume() NIE jest już tutaj — przeniesione do pierwszego gestu gracza
   (klik canvasu w player.js), bo nie ma już przycisku START.
============================================================ */
import { S } from './state.js';
import { canvas } from './scene.js';
import { sayOnce } from './narrator.js';
import { getUserVolume, setUserVolume, setUserMuted, isUserMuted } from './audio.js';

/* ---------- 1) Neutralizacja starego #start ---------- */
const oldStart = document.getElementById('start');
if (oldStart) oldStart.style.display = 'none';

/* ---------- 2) Style (wstrzyknięte raz) ---------- */
const style = document.createElement('style');
style.textContent = `
  /* Overlay pauzy. Domyślnie ukryty (display:none) — nie blokuje canvasu.
     openPauseMenu ustawia display:flex. pointer-events:auto, bo #menu-root
     trafia do #ui-scale-root (pointer-events:none dziedziczone). */
  #menu-root { position:fixed; inset:0; z-index:60; display:none; flex-direction:column;
      align-items:center; justify-content:center; pointer-events:auto;
      background:radial-gradient(ellipse at 50% 40%, rgba(14,36,24,.94) 0%, rgba(5,11,8,.96) 70%);
      font-family:'Segoe UI', Arial, sans-serif; user-select:none; }
  #menu-root .screen { position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; }

  /* Panel pauzy */
  #menu-root .opt-title { color:#e8fff2; font-size:32px; letter-spacing:8px; font-weight:800;
      text-transform:uppercase; text-shadow:0 0 16px rgba(77,255,160,.5); margin-bottom:40px; }
  #menu-root .opt-title span { color:#4dffa0; }
  #menu-root .opt-row { display:flex; flex-direction:column; gap:12px; width:360px; margin-bottom:34px; }
  #menu-root .opt-label { display:flex; justify-content:space-between; align-items:baseline;
      color:#7fdfae; font-size:12px; letter-spacing:3px; text-transform:uppercase; }
  #menu-root .opt-label .val { color:#e8fff2; font-weight:700; }
  #menu-root input[type=range] { -webkit-appearance:none; appearance:none; width:100%; height:7px;
      background:rgba(255,255,255,.07); border-radius:4px; outline:none; cursor:pointer; }
  #menu-root input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none;
      width:18px; height:18px; border-radius:50%; background:#4dffa0; cursor:pointer;
      box-shadow:0 0 10px rgba(77,255,160,.6); border:none; }
  #menu-root input[type=range]::-moz-range-thumb { width:18px; height:18px; border-radius:50%;
      background:#4dffa0; cursor:pointer; box-shadow:0 0 10px rgba(77,255,160,.6); border:none; }

  #menu-root .menu-btns { display:flex; flex-direction:column; gap:14px; width:300px; }
  #menu-root .mbtn { display:block; width:100%; text-align:center;
      background:rgba(8,18,13,.9); color:#cfeee0; border:1px solid rgba(120,160,140,.25);
      border-radius:9px; padding:15px 14px; cursor:pointer; font-size:15px; letter-spacing:4px;
      text-transform:uppercase; font-weight:700; transition:all .15s;
      font-family:'Segoe UI', Arial, sans-serif; }
  #menu-root .mbtn:hover { background:rgba(77,255,160,.1); border-color:rgba(77,255,160,.5); color:#fff; }
  /* stan wyciszenia — przycisk mute podświetlony na czerwonawo, gdy MUTED */
  #menu-root .mbtn.muted { background:rgba(40,12,12,.9); color:#ff9d9d; border-color:rgba(255,120,120,.45); }
`;
document.head.appendChild(style);

/* ---------- 3) Struktura DOM (tylko panel pauzy) ---------- */
const root = document.createElement('div');
root.id = 'menu-root';
root.innerHTML = `
  <div class="screen" id="menu-pause">
    <div class="opt-title">⏸ <span>Paused</span></div>
    <div class="opt-row">
      <div class="opt-label"><span>Volume</span><span class="val" id="vol-val">50%</span></div>
      <input type="range" id="vol-slider" min="0" max="1" step="0.01" value="0.5">
    </div>
    <div class="menu-btns">
      <button class="mbtn" id="mbtn-mute">🔊 Sound On</button>
      <button class="mbtn" id="mbtn-resume">Resume</button>
    </div>
  </div>
`;
// #ui-scale-root, nie body — panel ma być skalowany razem z resztą warstwy 2D UI.
(document.getElementById('ui-scale-root') || document.body).appendChild(root);

/* ---------- Referencje ---------- */
const volSlider = root.querySelector('#vol-slider');
const volVal    = root.querySelector('#vol-val');
const muteBtn   = root.querySelector('#mbtn-mute');

/* ---------- Synchronizacja UI z rzeczywistą preferencją gracza ----------
   Suwak/label czytają getUserVolume() (PRAWDZIWA preferencja), NIE
   master.gain.value — bo master może być wymuszony na 0 przez sdkMuted,
   a suwak nie może wtedy kłamać, że gracz ustawił 0%. */
function syncVolumeUI(){
  const v = getUserVolume();
  volSlider.value = String(v);
  volVal.textContent = Math.round(v * 100) + '%';
  const muted = isUserMuted();
  muteBtn.textContent = muted ? '🔇 Muted' : '🔊 Sound On';
  muteBtn.classList.toggle('muted', muted);
}

volSlider.addEventListener('input', ()=>{
  const v = Math.max(0, Math.min(1, parseFloat(volSlider.value)));
  setUserVolume(v);                                   // persystuje + stosuje (audio.js)
  volVal.textContent = Math.round(v * 100) + '%';
});

muteBtn.addEventListener('click', ()=>{
  setUserMuted(!isUserMuted());                       // toggle sesyjnego mute
  syncVolumeUI();
});

/* ---------- RESUME — zamyka panel, ponawia próbę pointer locka ----------
   Klik RESUME to wciąż gest użytkownika, więc requestPointerLock() jest
   dozwolony. Łapiemy oba tory odrzucenia (sync throw / async reject) jak
   dawny handler startu — mobile bywa poza kontekstem pełnoekranowym. */
root.querySelector('#mbtn-resume').addEventListener('click', ()=>{
  closePauseMenu();
  try { const p = canvas.requestPointerLock(); p?.catch?.(() => {}); } catch (e) { /* pointer lock niedostępny */ }
});

/* ---------- Publiczne API panelu pauzy ---------- */
export function openPauseMenu(){
  syncVolumeUI();
  S.paused = true;                 // zamraża symulację (main.js) + hotkeye (player.js)
  root.style.display = 'flex';
}
export function closePauseMenu(){
  S.paused = false;
  root.style.display = 'none';
}

/* ---------- 4) START GRY OD RAZU — bez menu, bez klikania ----------
   Synchronicznie przy załadowaniu modułu: gracz jest już w bazie.
   Ruch WASD w main.js jest bramkowany tylko S.mode==='play' (nie pointer
   lockiem), więc chodzenie działa natychmiast. Pointer lock i AC.resume()
   pojawią się dopiero przy pierwszym geście (klik canvasu — player.js). */
S.mode = 'play';
try {
  sayOnce('base_tutorial', [
    "Welcome to base, soldier.",
    "Move with WASD. Left mouse fires, right mouse aims down sights, R reloads.",
    "F works the gear in front of you, G cooks a grenade, 1 through 9 swap weapons.",
    "The gunsmith workshop is over there — tune your gear before you head into the field.",
    "When you're ready, pick a job from the mission board.",
  ], {});
} catch (e) { /* narrator opcjonalny — problem po jego stronie nie blokuje gry */ }

/* ============================================================
   STEROWANIE DOTYKIEM (mobile / CrazyGames)
   Moduł samodzielny wzorem menu.js: wstrzykuje własny <style> do
   document.head i buduje własny DOM — NIE edytuje index.html ani player.js.
   Podłączany jako side-effect import w main.js.

   Na desktopie (brak dotyku) moduł nic nie renderuje (early return) —
   zero elementów, zero listenerów, zero wpływu na mysz/klawiaturę.
============================================================ */
import { S } from './state.js';
import { player, keys, nearTable, nearDiorama, throwSelectedGrenade } from './player.js';
import { startReload, switchWeapon } from './combat.js';
import { openCraft } from './hud.js';
import { openMissionMap } from './missions.js';
import { tryBreachDoor, tryPullLever } from './locations.js';
import { isWeaponUnlocked } from './progress.js';
import { WEAPONS } from './weapons.js';

/* ---------- 0) Capability-detect: warunek WSTĘPNY, nie aktywacja ----------
   navigator.maxTouchPoints>0 jest prawdą także na hybrydowych laptopach z
   ekranem dotykowym, gdzie gracz i tak gra myszą. Dlatego samo wykrycie
   zdolności dotyku NIE aktywuje modułu — budujemy DOM ukryty i włączamy całą
   warstwę (S.touchActive, visLoop, pokazanie UI) dopiero przy PIERWSZYM realnym
   touchstart. Bez tego pełnoekranowy #tc-look zasłaniałby canvas (blokując
   re-lock kliknięciem z player.js:35-37), a S.touchActive omijałby bramkę
   pointer-locka przy strzale na urządzeniu, które dotyku nie używa. */
const isTouchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (isTouchCapable) {

  // Czułość patrzenia dla dotyku. Bazowo jak mysz (.0022 w player.js), ale
  // palec pokonuje krótszy dystans niż mysz na biurku, więc lekko podbite.
  const TOUCH_SENS = 0.0048;

  /* ---------- 1) Style (wstrzyknięte raz) ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #tc-root { position:fixed; inset:0; z-index:55; pointer-events:none;
        font-family:'Segoe UI', Arial, sans-serif; -webkit-user-select:none; user-select:none;
        display:none; touch-action:none; overscroll-behavior:none; }
    #tc-root.on { display:block; }

    /* strefa patrzenia — pełny ekran, pod przyciskami */
    #tc-look { position:absolute; inset:0; pointer-events:auto; touch-action:none; z-index:1; }

    /* joystick ruchu (lewy dolny róg) */
    #tc-joy { position:absolute; left:30px; bottom:36px; width:124px; height:124px; border-radius:50%;
        background:radial-gradient(circle, rgba(77,255,160,.07), rgba(10,25,18,.42));
        border:1.5px solid rgba(77,255,160,.35); pointer-events:auto; touch-action:none; z-index:2;
        box-shadow:0 0 16px rgba(0,0,0,.4), inset 0 0 22px rgba(77,255,160,.05); }
    #tc-knob { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px;
        border-radius:50%; background:rgba(77,255,160,.28); border:1.5px solid #4dffa0;
        box-shadow:0 0 16px rgba(77,255,160,.4); transition:transform .04s linear; }

    /* wspólny przycisk (okrągły thumb) */
    .tc-btn { position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center;
        border-radius:50%; background:rgba(10,25,18,.44); border:1.5px solid rgba(77,255,160,.45);
        color:#cfeee0; font-weight:800; letter-spacing:1px; text-transform:uppercase; font-size:13px;
        pointer-events:auto; touch-action:none; z-index:2; -webkit-user-select:none; user-select:none;
        box-shadow:0 0 14px rgba(0,0,0,.4), inset 0 0 18px rgba(77,255,160,.05); backdrop-filter:blur(2px); }
    .tc-btn small { font-size:9px; color:#7fdfae; letter-spacing:1px; margin-top:1px; }
    .tc-btn.big { font-size:16px; }
    .tc-btn.act { background:rgba(77,255,160,.24); border-color:#4dffa0; color:#fff;
        box-shadow:0 0 20px rgba(77,255,160,.45); }
    .tc-btn.on { background:rgba(255,221,85,.2); border-color:#ffdd55; color:#ffeeaa;
        box-shadow:0 0 16px rgba(255,221,85,.35); }

    /* przyciski akcji — bottom-right (nad #ammo, który jest w prawym dolnym rogu) */
    #tc-fire   { right:30px;  bottom:150px; width:92px;  height:92px; }
    #tc-aim    { right:132px; bottom:138px; width:70px;  height:70px; }
    #tc-jump   { right:142px; bottom:228px; width:62px;  height:62px; }
    #tc-reload { right:40px;  bottom:252px; width:62px;  height:62px; }

    /* sprint — nad joystickiem (lewy dolny róg) */
    #tc-sprint { left:44px; bottom:172px; width:66px; height:66px; font-size:11px; }

    /* strefa użytkowa — prawy górny róg, JEDEN kompaktowy rząd (z dala od #score
       top-left i #ammo bottom-right; niski, żeby nie kolidował z przyciskami po prawej).
       Nazwa aktualnej broni jest już pokazywana w HUD (#wname w bloku amunicji). */
    #tc-util { position:absolute; right:14px; top:12px; display:flex; gap:8px; align-items:center; z-index:2; }
    .tc-pill { display:flex; flex-direction:column; align-items:center; justify-content:center;
        min-width:52px; height:46px; padding:0 10px; border-radius:9px;
        background:rgba(10,25,18,.5); border:1.5px solid rgba(77,255,160,.4); color:#cfeee0;
        font-weight:800; letter-spacing:1px; text-transform:uppercase; font-size:14px;
        pointer-events:auto; touch-action:none; -webkit-user-select:none; user-select:none;
        box-shadow:0 0 12px rgba(0,0,0,.35); }
    .tc-pill small { font-size:8px; color:#7fdfae; letter-spacing:1px; }
    .tc-pill.act { background:rgba(77,255,160,.22); border-color:#4dffa0; color:#fff; }

    /* podświetlenie tutorialowe (highlightTouchButton) — pulsująca poświata akcentu */
    .tc-btn.tc-tut, .tc-pill.tc-tut { border-color:#4dffa0; color:#fff; animation:tc-tutpulse 1s ease-in-out infinite; }
    @keyframes tc-tutpulse {
      0%,100% { box-shadow:0 0 14px rgba(0,0,0,.4), 0 0 4px rgba(77,255,160,.5); }
      50%     { box-shadow:0 0 26px rgba(77,255,160,.9), 0 0 40px rgba(77,255,160,.45); }
    }
  `;
  document.head.appendChild(style);

  /* ---------- 2) DOM ---------- */
  const root = document.createElement('div');
  root.id = 'tc-root';
  root.innerHTML = `
    <div id="tc-look"></div>
    <div id="tc-joy"><div id="tc-knob"></div></div>

    <button class="tc-btn big" id="tc-fire">FIRE</button>
    <button class="tc-btn" id="tc-aim">AIM</button>
    <button class="tc-btn" id="tc-jump">JUMP</button>
    <button class="tc-btn" id="tc-reload">⟳<small>RELOAD</small></button>
    <button class="tc-btn" id="tc-sprint">SPRINT</button>

    <div id="tc-util">
      <button class="tc-pill" id="tc-interact">F<small>ACTION</small></button>
      <button class="tc-pill" id="tc-grenade">✦<small>GRENADE</small></button>
      <button class="tc-pill" id="tc-prev">◀<small>WEAPON</small></button>
      <button class="tc-pill" id="tc-next">▶<small>WEAPON</small></button>
    </div>
  `;
  document.body.appendChild(root);

  /* ---------- 3) Referencje ---------- */
  const lookZone = root.querySelector('#tc-look');
  const joyBase  = root.querySelector('#tc-joy');
  const joyKnob  = root.querySelector('#tc-knob');
  const fireBtn  = root.querySelector('#tc-fire');
  const aimBtn   = root.querySelector('#tc-aim');
  const jumpBtn  = root.querySelector('#tc-jump');
  const reloadBtn= root.querySelector('#tc-reload');
  const sprintBtn= root.querySelector('#tc-sprint');
  const prevBtn  = root.querySelector('#tc-prev');
  const nextBtn  = root.querySelector('#tc-next');
  const interactBtn = root.querySelector('#tc-interact');
  const grenadeBtn  = root.querySelector('#tc-grenade');

  /* ---------- 4) TOUCH-LOOK (przeciąganie po obszarze gry) ----------
     Delta touchmove → player.yaw/pitch. TA SAMA matematyka czułości i clamp
     pitch co mysz w player.js (linie 50/56-58), z redukcją ×.55 przy S.aiming. */
  let lookId = null, lookX = 0, lookY = 0;
  lookZone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (lookId === null) {
      const t = e.changedTouches[0];
      lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
    }
  }, { passive: false });
  lookZone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (S.mode !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) {
        const dx = t.clientX - lookX, dy = t.clientY - lookY;
        lookX = t.clientX; lookY = t.clientY;
        const sens = TOUCH_SENS * (S.aiming ? .55 : 1);
        player.yaw   -= dx * sens;
        player.pitch -= dy * sens;
        player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
      }
    }
  }, { passive: false });
  const endLook = e => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  lookZone.addEventListener('touchend', endLook);
  lookZone.addEventListener('touchcancel', endLook);

  /* ---------- 5) JOYSTICK RUCHU → keys.KeyW/A/S/D (cyfrowo jak klawiatura) ---------- */
  let joyId = null, joyCX = 0, joyCY = 0;
  const JOY_R = 46;   // maksymalny zasięg gałki (px) od środka bazy
  const DZ = 0.35;    // martwa strefa (ułamek JOY_R)
  function updateJoy(x, y) {
    let dx = x - joyCX, dy = y - joyCY;
    const dist = Math.hypot(dx, dy) || .0001;
    const cl = Math.min(dist, JOY_R);
    joyKnob.style.transform = `translate(${dx / dist * cl}px, ${dy / dist * cl}px)`;
    // rzut na osie: ekran „w górę" (−dy) = przód (W); „w prawo" (+dx) = D
    const fwd = -dy / JOY_R, strafe = dx / JOY_R;
    keys.KeyW = fwd    >  DZ;
    keys.KeyS = fwd    < -DZ;
    keys.KeyD = strafe >  DZ;
    keys.KeyA = strafe < -DZ;
  }
  function resetJoy() {
    joyKnob.style.transform = 'translate(0,0)';
    keys.KeyW = keys.KeyS = keys.KeyA = keys.KeyD = false;
  }
  joyBase.addEventListener('touchstart', e => {
    e.preventDefault();
    if (joyId === null) {
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const r = joyBase.getBoundingClientRect();
      joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2;
      updateJoy(t.clientX, t.clientY);
    }
  }, { passive: false });
  joyBase.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) updateJoy(t.clientX, t.clientY);
  }, { passive: false });
  const endJoy = e => { for (const t of e.changedTouches) if (t.identifier === joyId) { joyId = null; resetJoy(); } };
  joyBase.addEventListener('touchend', endJoy);
  joyBase.addEventListener('touchcancel', endJoy);

  /* ---------- 6) Pomocnicze: przyciski HOLD i TAP ---------- */
  function hold(el, down, up) {
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); down(); el.classList.add('act'); }, { passive: false });
    const end = e => { e.preventDefault(); up(); el.classList.remove('act'); };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
  function tap(el, fn) {
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); el.classList.add('act'); }, { passive: false });
    const end = e => { e.preventDefault(); el.classList.remove('act'); };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  /* ---------- 7) Przyciski akcji ---------- */
  hold(fireBtn, () => { if (S.mode === 'play') S.firing = true; }, () => { S.firing = false; });
  // CELUJ — toggle (na telefonie hold + jednoczesny fire drugim palcem jest niewygodny):
  // tap włącza celowanie i zostaje, kolejny tap wyłącza.
  aimBtn.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    if (S.mode !== 'play') return;
    S.aiming = !S.aiming;
    aimBtn.classList.toggle('act', S.aiming);
  }, { passive: false });
  hold(jumpBtn, () => { if (S.mode !== 'play') return; keys.Space = true; }, () => { keys.Space = false; });
  tap(reloadBtn, () => { if (S.mode !== 'play') return; startReload(); });
  tap(grenadeBtn, () => { if (S.mode !== 'play') return; throwSelectedGrenade(); });

  // INTERAKCJA [F] — dokładnie logika player.js linia 77
  tap(interactBtn, () => {
    if (S.mode !== 'play') return;
    if (nearTable()) openCraft();
    else if (nearDiorama()) openMissionMap();
    else if (!tryBreachDoor(player.pos)) tryPullLever(player.pos);
  });

  // SPRINT — toggle (keys.ShiftLeft; main.js sprawdza to w linii 71, wyłączony przy ADS)
  let sprintOn = false;
  tap(sprintBtn, () => { if (S.mode !== 'play') return; sprintOn = !sprintOn; keys.ShiftLeft = sprintOn; sprintBtn.classList.toggle('on', sprintOn); });

  // ZMIANA BRONI — cykl tylko po odblokowanych (bramka jak player.js linie 79-84)
  function cycleWeapon(dir) {
    if (S.mode !== 'play') return;
    const ids = Object.keys(WEAPONS).filter(isWeaponUnlocked);
    if (ids.length <= 1) return;
    let i = ids.indexOf(S.currentWeapon);
    if (i < 0) i = 0;
    const next = ids[(i + dir + ids.length) % ids.length];
    if (next && next !== S.currentWeapon) switchWeapon(next);
  }
  tap(prevBtn, () => cycleWeapon(-1));
  tap(nextBtn, () => cycleWeapon(1));

  /* ---------- 8) Aktywacja przy PIERWSZYM realnym dotyku + widoczność ----------
     Do tego momentu DOM istnieje ale jest ukryty (#tc-root bez .on = display:none),
     S.touchActive=false, a visLoop nie chodzi — więc na hybrydowym laptopie granym
     myszą warstwa jest całkowicie bierna (nie zasłania canvasu, nie omija bramek). */
  function releaseAll() {
    S.firing = false; S.aiming = false;
    keys.Space = false; sprintOn = false; keys.ShiftLeft = false;
    sprintBtn.classList.remove('on');
    aimBtn.classList.remove('act');
    lookId = null; joyId = null; resetJoy();
  }
  let shown = false;
  function visLoop() {
    requestAnimationFrame(visLoop);
    const show = S.mode === 'play';
    if (show !== shown) {
      shown = show;
      root.classList.toggle('on', show);
      if (!show) releaseAll();
    }
  }
  // Pierwszy realny touchstart gdziekolwiek na stronie = urządzenie faktycznie
  // używa dotyku → dopiero teraz włączamy bramkę strzału i pętlę widoczności.
  window.addEventListener('touchstart', () => {
    S.touchActive = true;
    visLoop();
  }, { once: true, passive: true, capture: true });
}

/* ---------- Podświetlenie przycisku dotykowego (dla tutoriala) ----------
   Top-level export (POZA blokiem isTouchCapable), więc importowalny zawsze.
   Na desktopie DOM przycisków nie istnieje → getElementById=null → no-op.
   CSS klasy .tc-tut jest wstrzykiwany razem z resztą stylu touch (w bloku wyżej),
   więc istnieje dokładnie wtedy, gdy istnieją przyciski. */
export function highlightTouchButton(id, on){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('tc-tut', !!on);
}

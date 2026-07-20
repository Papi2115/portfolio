import * as THREE from 'three';

/* ============================================================
   WSPÓLNY STAN GRY (dzielony między modułami)
============================================================ */
export const S = {
  mode: 'start',   // start | play | craft
  pointerLocked: false,
  // Dotyk: ustawiane raz przez touch.js po wykryciu urządzenia dotykowego.
  // Pointer Lock API nie działa sensownie na touch (canvas.requestPointerLock()
  // cicho zawodzi), więc bramki zależne od S.pointerLocked (np. strzał w main.js)
  // dodatkowo dopuszczają S.touchActive.
  touchActive: false,
  firing: false,
  aiming: false,
  // Ekran końca misji (panel wygranej/porażki) otwarty — pointer lock świadomie
  // zwolniony, żeby gracz mógł kliknąć przyciski. player.js NIE przejmuje wtedy
  // z powrotem pointer locka przy kliknięciu w canvas. Ustawiane przez missions.js.
  missionEndScreenOpen: false,
  // Panel pauzy (Escape w trybie 'play') otwarty. S.mode zostaje 'play', ale ta
  // flaga zamraża CAŁĄ symulację: main.js tick() bramkuje blok gry przez
  // (S.mode==='play' && !S.paused), a player.js blokuje hotkeye (R/E/G/cyfry).
  // Ustawiane przez openPauseMenu()/closePauseMenu() w menu.js.
  paused: false,
  currentWeapon: 'rifle',
  ammo: 30,
  reloading: false,
  reloadEnd: 0,
  lastShot: 0,
  recoilPitch: 0,
  recoilYaw: 0,
  vmKick: 0,
  vmSway: new THREE.Vector2(),
  bobT: 0,
  score: 0,
  combo: 0,
  comboEnd: 0,
  // Prostokątne granice aktualnie aktywnej areny (min/max na X/Z), używane przez
  // clamp granicy świata w main.js (collide()) i enemies.js (clampArena()).
  // Domyślnie: DOKŁADNE granice budynku bazy (foyer z=8 na północy do tylnej
  // ściany strzelnicy z=-42 na południu; ściany zachodnia/wschodnia x=±16) —
  // brak zapasu na pustą przestrzeń poza budynkiem. Misje nadpisują to na
  // kwadrat wokół swojej lokacji (locations.js ORIGINS) na czas trwania misji,
  // returnToBase() w missions.js przywraca dokładnie te wartości.
  arenaMinX: -16,
  arenaMaxX: 16,
  arenaMinZ: -42,
  arenaMaxZ: 8,
};

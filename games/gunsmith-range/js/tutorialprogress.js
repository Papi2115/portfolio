// tutorialprogress.js — czysty moduł stanu postępu tutoriala (BEZ importów,
// żeby nie tworzyć nowych cykli importów w grafie modułów).
//
// Twarde bramkowanie sekwencyjne: krok N+1 nie jest "aktywny" (currentStep) dopóki
// krok N nie został FAKTYCZNIE ukończony (markDone wołane w chwili realnej akcji:
// openCraft → 'workshop', S.aiming w strzelnicy → 'range', openMissionMap → 'missionmap').
//
// Kolejność kroków: warsztat → strzelnica → mapa misji.
// Ukończenie jest trwałe (localStorage), więc po odświeżeniu przeglądarki tutorial
// nie startuje od zera.

const STEPS = ['workshop', 'range', 'missionmap'];
const DONE_PREFIX = 'tutorial_done_';

function isDone(step){
  try { return localStorage.getItem(DONE_PREFIX + step) !== null; }
  catch (e) { return false; }
}

function markDone(step){
  try { localStorage.setItem(DONE_PREFIX + step, '1'); }
  catch (e) { /* localStorage niedostępny — ignoruj */ }
}

// Pierwszy nieukończony krok w kolejności STEPS; null = wszystko ukończone (brak aktywnego kroku).
function currentStep(){
  for (const s of STEPS){ if (!isDone(s)) return s; }
  return null;
}

export { STEPS, isDone, markDone, currentStep };

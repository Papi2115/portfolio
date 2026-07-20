import * as THREE from 'three';
import { S } from './state.js';
import { player, hideAllTutorialPrompts } from './player.js';
import { canvas, setActiveArea } from './scene.js';
import { onDeath, reset as resetHealth } from './health.js';
import { addCredits } from './economy.js';
import { say, clearQueue } from './narrator.js';
import { LOCATION_LIST, loadLocation, isDoorBreached, ORIGINS, openGate } from './locations.js';
import { enemies, spawnEnemy, clearEnemies } from './enemies.js';
import { rebuildShootables } from './combat.js';
import { unlockWeapon, markMissionDone, isMissionDone } from './progress.js';
import { WEAPONS } from './weapons.js';
import { sfxClick, sfxEmpty } from './audio.js';
import { requestRewardedAd, celebrate } from './crazysdk.js';
import { currentStep, markDone } from './tutorialprogress.js';

/* ============================================================
   MISJE — GUNSMITH RANGE
   ------------------------------------------------------------
   5 misji (po jednej na lokację z locations.js), pełen runtime:
   start → walka → wygrana/porażka → powrót na bazę.

   Tryb: misja działa w S.mode==='play' (ruch/strzał/kolizje już
   są bramkowane tym trybem). "W misji vs na bazie" trzymamy WŁASNĄ
   flagą missionState.active — żeby nie przewlekać nowej wartości
   S.mode przez wszystkie istniejące checki.

   Publiczne API:
     MISSIONS                              (definicje)
     missionState                          (stan runtime, tylko-do-odczytu z zewnątrz)
     startMission(id)                      (start po id lokacji lub misji)
     updateMission(dt)                     (hook per-klatka z main.js)
     returnToBase()                        (powrót na bazę)
     isMissionUnlocked(id)                 (gating listy misji)
============================================================ */

// Domyślny spawn bazy — zgodny z początkową pozycją w player.js (0,1.7,4).
const BASE_SPAWN = new THREE.Vector3(0, 1.7, 4);

/* ============================================================
   DEFINICJE MISJI
   stages: [ { composition:[[typ,ilość],...], narration:[str,...] }, ... ]
   Każda misja ma 2-3 ETAPY (fale). Suma wrogów wszystkich etapów ≈
   dawna całkowita obsada misji — nie zwiększamy drastycznie trudności,
   tylko ROZKŁADAMY ją w czasie (plus nowe misje korzystają z większej
   liczby spawn pointów w nowych lokacjach).

   Runtime spawnuje tylko etap 1 na start; kolejne fale dochodzą, gdy
   poprzednia wybita (patrz updateMission / beginStageTransition).
============================================================ */
export const MISSIONS = [
  {
    id: 'm1',
    locationId: 'warehouse',
    name: LOCATION_LIST.find(l => l.id === 'warehouse').name,
    unlockWeapon: 'smg',
    creditsReward: 60,
    intro: [
      "Listen up, I'm only saying this once.",
      'Port warehouse. Contraband is stacked between the crates, and the guards are paid thugs — gunmen and a few with knives.',
      "Get in, clear the hall to the last man, and don't let them flank you. Move.",
    ],
    stages: [
      { composition: [['shooter', 3], ['tactical', 1]],            // 4
        narration: ['First wave is at the entrance. Ease in and drop them one by one.'] },
      { composition: [['shooter', 2], ['knife', 2]],               // 4
        narration: ['Second group is coming from deep in the hall — knifers up front. Keep your distance.'] },
      { composition: [['shooter', 1], ['tactical', 2]],            // 3
        narration: ["The last ones dug in behind the crates. Flush them out and we're done."] },
    ],
    outro: [
      'Clear. The warehouse is ours.',
      'For that I got you the "Hornet" submachine gun — pick it up in the workshop.',
      "Get some rest, another job is coming up.",
    ],
    fail: [
      'You went down in that hall like a rookie.',
      "We're pulling you out. Patch up and get back — that warehouse is still waiting.",
    ],
  },
  {
    id: 'm2',
    locationId: 'outpost',
    name: LOCATION_LIST.find(l => l.id === 'outpost').name,
    unlockWeapon: 'shotgun',
    creditsReward: 85,
    intro: [
      'Desert outpost. Open ground, poor cover — sandbags and a tower.',
      'They hunker behind cover and lean out to shoot, so read the rhythm and punish every peek.',
      "Break their garrison. Good luck — it's going to get hot.",
    ],
    stages: [
      { composition: [['shooter', 3], ['tactical', 1]],            // 4
        narration: ['Forward guards on the tower and behind the bags. Take them down before they get going.'] },
      { composition: [['shooter', 1], ['tactical', 1], ['knife', 2]], // 4
        narration: ["They're calling in reinforcements — someone's rushing with a knife. Don't let them take your flank."] },
      { composition: [['shooter', 1], ['tactical', 2], ['knife', 1]], // 4
        narration: ['The rest are dug in at the back. Finish them and the outpost is ours.'] },
    ],
    outro: [
      'Outpost wiped out. Nicely done.',
      'Your reward is the "Boar" shotgun — up close it shows no mercy.',
      'Gear up and report in for the next assignment.',
    ],
    fail: [
      'You stayed out on the sand. Too exposed, not enough headwork.',
      "We're taking you back to base. Heal up and try again.",
    ],
  },
  {
    id: 'm3',
    locationId: 'street',
    name: LOCATION_LIST.find(l => l.id === 'street').name,
    unlockWeapon: 'dmr',
    creditsReward: 110,
    intro: [
      'City street. A narrow corridor between the facades, car wrecks for cover.',
      'Knifers will rush you from behind the wrecks, and gunmen will hold their distance from the windows.',
      "Control the line of the street and don't let them surround you. You're going in.",
    ],
    stages: [
      { composition: [['shooter', 2], ['knife', 2]],               // 4
        narration: ['The first ones jump out from the nearest wrecks. Hold the center of the street.'] },
      { composition: [['shooter', 2], ['tactical', 1], ['knife', 1]], // 4
        narration: ["Gunmen are taking the windows above you. Don't stand out in the open."] },
      { composition: [['shooter', 1], ['tactical', 2], ['knife', 1]], // 4
        narration: ['The last ones are blocking the end of the street. Push through and close this out.'] },
    ],
    outro: [
      'Street secured. A solid piece of work.',
      'You have earned the "Raven" marksman rifle — from now on you reach where others cannot even see.',
      'Head back to base, rearm.',
    ],
    fail: [
      'They got you on that street. You let them get too close.',
      'Evac to base. Dress your wounds and come back to finish the job.',
    ],
  },
  {
    id: 'm4',
    locationId: 'house',
    breach: true,
    name: LOCATION_LIST.find(l => l.id === 'house').name,
    unlockWeapon: 'lmg',
    creditsReward: 150,
    intro: [
      'House on the hill. You start outside — the door is barred.',
      'Get to the entrance and breach it [F], then storm in. Tight quarters inside, and knifers love ambushes around the corner.',
      "This one's for steady nerves. Forward.",
    ],
    breachLines: ["Door's down — get in fast and clear it room by room!"],
    stages: [
      { composition: [['shooter', 2], ['knife', 2]],               // 4
        narration: ['First room past the door — clear the corners before you push deeper.'] },
      { composition: [['shooter', 1], ['tactical', 1], ['knife', 2]], // 4
        narration: ['More are waiting in the hallway. Knifers leap from the corners — be ready.'] },
      { composition: [['shooter', 1], ['tactical', 2], ['knife', 1]], // 4
        narration: ['The last ones are barricaded deep in the house. Finish them and the house is yours.'] },
    ],
    outro: [
      'House cleared, room by room. Textbook work.',
      'For that you take the "Wolverine" LMG — now you have firepower for a whole squad.',
      "Get back, the work is only getting started.",
    ],
    fail: [
      'You died in that house. The ambush got the better of you.',
      "We're pulling you back to base. Pull yourself together — that door still needs breaching.",
    ],
  },
  {
    id: 'm5',
    locationId: 'industrial',
    name: LOCATION_LIST.find(l => l.id === 'industrial').name,
    unlockWeapon: null,                 // wszystkie bronie z misji już odblokowane — nagroda w kredytach
    creditsReward: 300,
    intro: [
      'Industrial plant — silos, pipes, dense cover, and plenty of guys eager to leave you here for good.',
      'Big garrison: gunmen, tacticians behind cover, and a pack with knives. They come in waves.',
      "You've got the whole arsenal. Get down there and take that gang apart.",
    ],
    stages: [
      { composition: [['shooter', 3], ['tactical', 1]],            // 4
        narration: ['The first shift is guarding the silos. Start with them, nice and steady.'] },
      { composition: [['shooter', 2], ['tactical', 1], ['knife', 2]], // 5
        narration: ["They've hit the alarm — they're pouring off the pipes and catwalks. Watch for knives from above."] },
      { composition: [['shooter', 1], ['tactical', 2], ['knife', 2]], // 5
        narration: ['The last wave is dug in at the heart of the plant. Finish it, soldier.'] },
    ],
    outro: [
      "Plant's clear. Nice work.",
      "You've got a three-hundred-credit bonus — rearm in the workshop.",
      "Take a breath. But it's not over — the cartel is only just waking up.",
    ],
    fail: [
      'You went down among the silos. Too much bravado.',
      "We're picking you up for base. Heal up — the plant is still waiting for you.",
    ],
  },
  {
    id: 'm6',
    locationId: 'bunker',
    name: LOCATION_LIST.find(l => l.id === 'bunker').name,
    unlockWeapon: null,
    creditsReward: 180,
    intro: [
      'Underground bunker. Tight corridors, concrete cells, not a meter of open space.',
      'The cartel keeps documents and hard men down here — tacticians and knifers in every corner.',
      "Get underground and sweep it corridor by corridor. You're going in.",
    ],
    stages: [
      { composition: [['shooter', 2], ['tactical', 2]],            // 4
        narration: ["Guards at the stairwell. In these corridors there's nowhere to run — be first."] },
      { composition: [['tactical', 2], ['knife', 3]],              // 5
        narration: ['It gets tight deeper in. Knifers charge from the dark cells — fire short and accurate.'] },
      { composition: [['shooter', 1], ['tactical', 1], ['knife', 3]], // 5
        narration: ['Last chamber, last of them. Clear it and climb back to the surface.'] },
    ],
    outro: [
      'Bunker swept down to the concrete. We got their dirty paperwork out of here.',
      "For guts underground I'm adding a hundred and eighty credits.",
      "Come up and catch your breath. There'll be more.",
    ],
    fail: [
      'You stayed in those corridors. The tight space buried you.',
      "We're pulling you back to base. Pull yourself together — the bunker needs finishing.",
    ],
  },
  {
    id: 'm7',
    locationId: 'airfield',
    name: LOCATION_LIST.find(l => l.id === 'airfield').name,
    unlockWeapon: null,
    creditsReward: 220,
    intro: [
      'Abandoned airfield. Open runway, plane wrecks, wind, and long lines of fire.',
      'Their gunmen keep their distance behind the fuselages — out here patience and a sharp eye win.',
      'Take the runway. Stay in cover among the wrecks and push forward.',
    ],
    stages: [
      { composition: [['shooter', 4], ['tactical', 1]],            // 5
        narration: ["First line of gunmen by the hangar. Pick them off from range, don't step into the open."] },
      { composition: [['shooter', 3], ['tactical', 2]],            // 5
        narration: ["They're moving between the plane wrecks. Read their dashes and punish every one."] },
      { composition: [['shooter', 3], ['tactical', 2], ['knife', 1]], // 6
        narration: ['The last ones are defending the control tower. Push the runway to the end and the airfield is ours.'] },
    ],
    outro: [
      'Runway cleared. Not one plane takes off from here for the cartel again.',
      "I'm adding two hundred and twenty credits for clean work at range.",
      "Head back to base. We're closing in on the nest.",
    ],
    fail: [
      'You got hit out on the open runway. Too exposed.',
      "We're taking you to base. Heal up and come back to close out the airfield.",
    ],
  },
  {
    id: 'm8',
    locationId: 'train',
    name: LOCATION_LIST.find(l => l.id === 'train').name,
    unlockWeapon: null,
    creditsReward: 260,
    intro: [
      'Freight station. The cars stand like corridors, with narrow gaps and cover between them.',
      'The cartel is transferring cargo here. They will defend every car — car by car.',
      'Get onto the siding and break their train apart. Careful between the cars.',
    ],
    stages: [
      { composition: [['shooter', 2], ['knife', 2]],               // 4
        narration: ['Guards at the first cars. Check the gaps before you step in among the train.'] },
      { composition: [['shooter', 2], ['tactical', 2], ['knife', 2]], // 6
        narration: ["The middle of the train came alive — gunmen on the roofs, knives from under the wheels. Head on a swivel."] },
      { composition: [['shooter', 2], ['tactical', 2], ['knife', 2]], // 6
        narration: ["The last cars, the rest of the crew. Close out the siding and it's done."] },
    ],
    outro: [
      "Siding's clear, the train's stopped. Their shipment just ended.",
      'For that you have two hundred and sixty credits — solid work between the cars.',
      'Head back. Only two targets left.',
    ],
    fail: [
      'They caught you between the cars. A dead end was your undoing.',
      "We're pulling you back to base. Pull yourself together — the station is still waiting.",
    ],
  },
  {
    id: 'm9',
    locationId: 'harbor',
    name: LOCATION_LIST.find(l => l.id === 'harbor').name,
    unlockWeapon: null,
    creditsReward: 300,
    intro: [
      'Harbor docks. Containers stacked into a maze, dead ends and cover at every step.',
      "Easy to walk into an ambush here — a knife or a muzzle can come from behind any container.",
      'Get into that maze and crack it corner by corner. Keep eyes all around your head.',
    ],
    stages: [
      { composition: [['shooter', 3], ['tactical', 2]],            // 5
        narration: ['Guards at the harbor entrance. Stick to cover and cut them down one at a time.'] },
      { composition: [['shooter', 2], ['tactical', 2], ['knife', 2]], // 6
        narration: ["You're entering the container maze. Ambushes around the corners — don't rush in blind."] },
      { composition: [['shooter', 2], ['tactical', 3], ['knife', 2]], // 7
        narration: ['The heart of the harbor, the thickest garrison. Take it apart and the docks are yours.'] },
    ],
    outro: [
      'Docks cleared. The container maze belongs to us.',
      'Three hundred credits for nerves of steel. You earned it.',
      'Head back and sharpen everything you have. The next target is the cartel itself.',
    ],
    fail: [
      'The ambush in the containers got you. Too fast, too careless.',
      "We're taking you to base. Heal up — the harbor still needs closing out.",
    ],
  },
  {
    id: 'm10',
    locationId: 'compound',
    name: LOCATION_LIST.find(l => l.id === 'compound').name,
    unlockWeapon: null,
    creditsReward: 500,
    intro: [
      'This is it. The cartel stronghold. The biggest, the densest, the best defended — the end of the road.',
      'Everyone still alive has pulled back here. Three waves, each one heavier than the last.',
      "You've come a long way, soldier. Get in there and end this war. Forward.",
    ],
    stages: [
      { composition: [['shooter', 3], ['tactical', 3]],            // 6
        narration: ['The outer wall and the gate. Break the defense at the entrance — calm, one at a time.'] },
      { composition: [['shooter', 3], ['tactical', 3], ['knife', 2]], // 8
        narration: ["The courtyard's filling up — they've thrown everything at you. Hold your nerve and your position."] },
      { composition: [['shooter', 2], ['tactical', 3], ['knife', 3]], // 8
        narration: ["The last defense, the very core of the stronghold. Past this threshold there's no one left. End it."] },
    ],
    outro: [
      "Silence. Hear it? The first silence like this in months. The stronghold has fallen — the cartel has fallen.",
      'You went through the warehouse, the desert, the streets, the house, the plant, the bunker, the airfield, the station, the harbor — and through this hell right here.',
      'None of my men would have made it this far. You were the best I ever had.',
      "Campaign's over. Five hundred credits and something you can't buy — peace. Thank you, soldier.",
    ],
    fail: [
      'At the very gates of the stronghold. So close to the end of the whole war.',
      "We're pulling you back to base. Pull yourself together — we'll finish this. We have to.",
    ],
  },
];

/* ============================================================
   STAN RUNTIME
============================================================ */
export const missionState = {
  active: false,          // czy trwa misja (a nie zwykły pobyt na bazie)
  current: null,          // aktualna definicja misji
  loc: null,              // załadowana lokacja (spawnPoint/enemySpawnPoints/coverPoints) — trzymana, żeby NIE ładować lokacji drugi raz per-etap
  stageIndex: 0,          // indeks bieżącego etapu (0-based)
  stageSpawnedCount: 0,   // ilu wrogów zespawnowano w BIEŻĄCYM etapie (guard + mianownik HUD)
  transitioning: false,   // pauza między etapami (blokuje wykrycie "wyczyszczone" zanim wejdzie kolejna fala)
  ending: false,          // faza debrief/powrót (blokuje podwójne zakończenie)
  breachNarrated: false,  // czy padła kwestia wyważenia drzwi (misja 4)
};

let stageTimer = null;    // timer pauzy między etapami (spawn kolejnej fali)

// (c) reklama-ratunek: zabezpieczenie przed WIELOKROTNYM przyznaniem nagrody.
// Ustawiane true natychmiast po pierwszym kliknięciu (przed odpowiedzią reklamy),
// resetowane w startMission() na początku każdej misji.
let rescueUsed = false;

const STAGE_PAUSE_MS = 2200;   // oddech między falami: narracja przejściowa + chwila spokoju

/* ============================================================
   GATING LISTY MISJI — misja N dostępna, gdy poprzednia ukończona.
============================================================ */
export function isMissionUnlocked(id) {
  const idx = MISSIONS.findIndex(m => m.id === id || m.locationId === id);
  if (idx <= 0) return true;                        // pierwsza zawsze otwarta
  return isMissionDone(MISSIONS[idx - 1].id);       // wymaga ukończenia poprzedniej
}

/* ============================================================
   SPAWN OBSADY — ETAPOWO
   Dzielimy enemySpawnPoints lokacji (uszeregowane wejście→głąb) na
   tyle ciągłych podzbiorów, ile jest etapów: etap 0 dostaje pierwszą
   część indeksów (bliżej wejścia), ostatni etap — najgłębszą. W obrębie
   podzbioru używamy modulo (jak w oryginale), więc nawet gdy wrogów w
   fali więcej niż punktów w wycinku, indeks bezpiecznie się zawija.
============================================================ */
function stageSlice(pts, stageIndex, totalStages) {
  const len = pts.length;
  if (len === 0) return [];
  if (totalStages <= 1) return pts;
  const start = Math.floor((stageIndex * len) / totalStages);
  const end = Math.floor(((stageIndex + 1) * len) / totalStages);
  const sub = pts.slice(start, end);
  // Fallback: gdy lokacja ma mniej punktów niż etapów, wycinek bywa pusty —
  // użyj wtedy całej puli, żeby nie było spawnu w (0,0).
  return sub.length ? sub : pts;
}

function stageEnemyTotal(stage) {
  let n = 0;
  for (const [, count] of stage.composition) n += count;
  return n;
}

// Spawnuje jeden etap misji na wycinku spawn pointów lokacji.
function spawnStage(m, loc, stageIndex) {
  const stage = m.stages[stageIndex];
  const allPts = (loc && loc.enemySpawnPoints) || [];
  const cover = (loc && loc.coverPoints) || [];
  const pts = stageSlice(allPts, stageIndex, m.stages.length);
  let idx = 0;
  for (const [type, count] of stage.composition) {
    for (let k = 0; k < count; k++) {
      const base = pts.length ? pts[idx % pts.length] : new THREE.Vector3();
      const wrap = pts.length ? Math.floor(idx / pts.length) : 0;
      let pos = base;
      if (wrap > 0) {
        // Fala ma więcej wrogów niż punktów w wycinku — indeks się zawija (modulo).
        // Bez korekty kolejne "okrążenia" spawnowałyby się DOKŁADNIE w tym samym
        // punkcie co poprzednie (nakładające się modele wrogów). Rozsuwamy je po
        // małym pierścieniu wokół oryginalnego punktu, promień rośnie z `wrap`.
        const ang = wrap * 2.4 + (idx % pts.length) * 0.6;
        const r = 1.6 * wrap;
        pos = base.clone().add(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
      }
      idx++;
      const opts = type === 'tactical' ? { coverPoints: cover } : {};
      spawnEnemy(type, pos, opts);
    }
  }
  rebuildShootables();   // po każdym spawnie: nowi wrogowie muszą wejść pod raycast broni
}

/* ============================================================
   START MISJI
============================================================ */
export function startMission(id) {
  const m = MISSIONS.find(x => x.id === id || x.locationId === id);
  if (!m) return false;

  const loc = loadLocation(m.locationId);
  if (!loc) return false;

  if (stageTimer !== null) { clearTimeout(stageTimer); stageTimer = null; }

  clearEnemies();

  // Przesuń granice areny na tę lokację — inaczej clamp granicy świata
  // (main.js collide() / enemies.js clampArena()) cofałby gracza i wrogów do (0,0).
  const org = ORIGINS[m.locationId];
  if (org) {
    S.arenaMinX = org.x-55; S.arenaMaxX = org.x+55;
    S.arenaMinZ = org.z-55; S.arenaMaxZ = org.z+55;
  }
  // Culling świateł: widoczne tylko światła tej lokacji (reszta visible=false).
  setActiveArea(m.locationId);

  // teleport gracza na spawn lokacji (reset ruchu)
  player.pos.copy(loc.spawnPoint);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  player.yaw = 0;     // patrzy w -Z, w głąb lokacji (wrogowie są po stronie -z)
  player.pitch = 0;

  resetHealth();
  S.firing = false;
  S.aiming = false;

  // stan etapowy: startujemy od etapu 0
  missionState.active = true;
  missionState.current = m;
  missionState.loc = loc;                 // trzymamy referencję — NIE ładujemy lokacji drugi raz per-etap
  missionState.stageIndex = 0;
  missionState.transitioning = false;
  missionState.ending = false;
  missionState.breachNarrated = false;

  // reset haków reklamowych na start każdej misji
  rescueUsed = false;
  hideAdButton();
  S.missionEndScreenOpen = false;   // defensywnie: żaden ekran końca nie wisi na starcie misji

  // spawnujemy TYLKO etap 1 (drzwi w 'house' i tak blokują wejście do wyważenia)
  spawnStage(m, loc, 0);   // spawnStage wywołuje rebuildShootables() wewnątrz
  missionState.stageSpawnedCount = stageEnemyTotal(m.stages[0]);

  S.mode = 'play';

  // Wywołane z kliknięcia w warsztacie (user-gesture) → pointer lock jest legalny.
  try { canvas.requestPointerLock(); } catch (e) { /* ignoruj */ }

  clearQueue();
  say(m.intro, {});                                   // brief misji
  if (m.stages[0].narration) say(m.stages[0].narration, {});  // + narracja pierwszej fali (queuowana za intro)

  updateMissionHud();
  return true;
}

/* ============================================================
   HOOK PER-KLATKA
============================================================ */
export function updateMission(dt) {
  if (!missionState.active) return;
  const m = missionState.current;
  if (!m) return;

  const alive = countAlive();
  updateMissionHud(alive);

  // mikro-narracja: wyważenie drzwi (misja 4) — niezależne od etapów
  if (m.breach && !missionState.breachNarrated && isDoorBreached()) {
    missionState.breachNarrated = true;
    if (m.breachLines) say(m.breachLines, {});
  }

  // W trakcie debriefu albo pauzy między falami nie badamy warunku "wyczyszczone".
  if (missionState.ending || missionState.transitioning) return;

  // Etap wyczyszczony? (poprzednie etapy są już martwe, więc countAlive() == żywi z BIEŻĄCEJ fali)
  if (missionState.stageSpawnedCount > 0 && alive === 0) {
    const nextIndex = missionState.stageIndex + 1;
    if (nextIndex < m.stages.length) {
      beginStageTransition(m, nextIndex);   // kolejna fala
    } else {
      completeMission();                    // to był ostatni etap
    }
  }
}

/* ============================================================
   PRZEJŚCIE MIĘDZY ETAPAMI
   Krótka pauza (oddech) + narracja przejściowa, potem dospawnowanie
   następnej fali BEZ clearEnemies() (poprzedni etap już nie żyje).
============================================================ */
function beginStageTransition(m, nextIndex) {
  missionState.transitioning = true;

  // Otwórz opcjonalną bramę etapową tej lokacji (locations.js:openGate) — dla
  // lokacji bez zarejestrowanej bramy to bezpieczny no-op (return false).
  // Tematycznie: droga dalej się otwiera w chwili, gdy fala jest wybita.
  openGate(m.locationId);

  const nextStage = m.stages[nextIndex];
  clearQueue();
  if (nextStage.narration) say(nextStage.narration, {});   // Maras zapowiada falę w trakcie pauzy

  if (stageTimer !== null) clearTimeout(stageTimer);
  stageTimer = setTimeout(() => {
    stageTimer = null;
    // Zabezpieczenie: gracz mógł zginąć / wrócić na bazę w trakcie pauzy.
    if (!missionState.active || missionState.ending || missionState.current !== m) return;
    missionState.stageIndex = nextIndex;
    spawnStage(m, missionState.loc, nextIndex);   // reużywa trzymanej lokacji (bez ponownego loadLocation)
    missionState.stageSpawnedCount = stageEnemyTotal(m.stages[nextIndex]);
    missionState.transitioning = false;
    updateMissionHud();
  }, STAGE_PAUSE_MS);
}

function countAlive() {
  let n = 0;
  for (const e of enemies) if (e.alive) n++;
  return n;
}

/* ============================================================
   UKOŃCZENIE / PORAŻKA
============================================================ */
function completeMission() {
  if (missionState.ending) return;
  missionState.ending = true;
  const m = missionState.current;

  markMissionDone(m.id);
  addCredits(m.creditsReward);
  if (m.unlockWeapon) unlockWeapon(m.unlockWeapon);

  // Czytelny panel podsumowania: tytuł + zyski + przycisk główny "RETURN TO BASE".
  const lines = ['<span style="color:#ffdd55;font-weight:800">+₡' + m.creditsReward + ' CREDITS</span>'];
  if (m.unlockWeapon && WEAPONS[m.unlockWeapon]) {
    lines.push('<span style="color:#4dffa0">NEW WEAPON UNLOCKED: ' + WEAPONS[m.unlockWeapon].name + '</span>');
  }
  showEndPanel('MISSION COMPLETE', '#4dffa0', lines, [
    { text: 'RETURN TO BASE', color: '#4dffa0', handler: () => returnToBase() },
  ]);
  celebrate();   // CrazyGames happytime — osiągnięcie gracza

  // Zwolnij pointer lock, żeby kursor się pojawił i gracz mógł kliknąć przycisk.
  // Flaga blokuje player.js przed odbieraniem pointer locka przy kliknięciu obok przycisku.
  S.missionEndScreenOpen = true;
  try { document.exitPointerLock(); } catch (e) { /* ignoruj */ }

  // (b) opcjonalna reklama: PODWOJENIE premii kredytowej. Przycisk (mniejszy,
  // opcjonalny) siedzi pod przyciskiem głównym w panelu. Guard: bonusClaimed +
  // natychmiastowe ukrycie przycisku po kliknięciu → brak podwójnej nagrody.
  let bonusClaimed = false;
  const bonusText = '🎬 WATCH AD: +₡' + m.creditsReward + ' BONUS';
  const showBonusBtn = () => showAdButton(bonusText, '#ffdd55', () => {
    if (bonusClaimed) return;
    bonusClaimed = true;
    hideAdButton();
    requestRewardedAd(
      () => { addCredits(m.creditsReward); },
      // (5) reklama niedostępna/błąd → pokaż przycisk ponownie (jeśli wciąż okno
      // debriefu — returnToBase() już schował go trwale). Pozwól spróbować jeszcze raz.
      () => { if (!missionState.active) return; bonusClaimed = false; showBonusBtn(); }
    );
  });
  // showBonusBtn();   // DISABLED — CrazyGames Basic Launch nie pozwala na reklamy. Odkomentuj przy Full Launch.

  clearQueue();
  say(m.outro, {});
}

// rejestrowane RAZ przy ładowaniu modułu (nie per-misja)
onDeath(() => {
  if (!missionState.active || missionState.ending) return;
  missionState.ending = true;
  const m = missionState.current;
  S.firing = false;
  S.aiming = false;

  // Czytelny panel porażki: "RETRY STAGE" (ten sam etap) + "RETURN TO BASE".
  showEndPanel('MISSION FAILED', '#ff4444', [], [
    { text: 'RETRY STAGE', color: '#ff4444', handler: () => retryStage() },
    { text: 'RETURN TO BASE', color: '#7fdfae', handler: () => returnToBase() },
  ]);

  // Zwolnij pointer lock, żeby kursor się pojawił i gracz mógł kliknąć przycisk.
  // Flaga blokuje player.js przed odbieraniem pointer locka przy kliknięciu obok przycisku.
  S.missionEndScreenOpen = true;
  try { document.exitPointerLock(); } catch (e) { /* ignoruj */ }

  // (c) opcjonalna reklama: RATUNEK misji — ukończenie mimo porażki. Przycisk
  // (mniejszy, opcjonalny) pod przyciskami głównymi w panelu. Guard rescueUsed
  // (per-misja) + natychmiastowe ukrycie po pierwszym kliknięciu → brak podwójnej
  // nagrody. Brak automatycznego timera powrotu = brak wyścigu z reklamą.
  if (m) {
    const showRescueBtn = () => {
      if (rescueUsed) return;
      showAdButton('🎬 WATCH AD & COMPLETE MISSION', '#ff9944', () => {
        if (rescueUsed) return;
        rescueUsed = true;
        hideAdButton();
        requestRewardedAd(
          () => {
            // RACE guard: reklama trwa 15-30s, a przyciski RETRY STAGE / RETURN TO
            // BASE są w tym czasie klikalne. Jeśli gracz opuścił ekran porażki zanim
            // reklama się skończyła — retryStage()/returnToBase() wyzerowały ending
            // (i/lub active/current) — spóźniona nagroda jest ignorowana, żeby nie
            // wstrzyknąć ending=true / panelu COMPLETE w środek żywej walki lub bazy.
            if (!missionState.active || missionState.current !== m || !missionState.ending) return;
            missionState.ending = true;
            markMissionDone(m.id);
            addCredits(m.creditsReward);
            if (m.unlockWeapon) unlockWeapon(m.unlockWeapon);
            const lines = ['<span style="color:#ffdd55;font-weight:800">+₡' + m.creditsReward + ' CREDITS</span>'];
            if (m.unlockWeapon && WEAPONS[m.unlockWeapon]) {
              lines.push('<span style="color:#4dffa0">NEW WEAPON UNLOCKED: ' + WEAPONS[m.unlockWeapon].name + '</span>');
            }
            showEndPanel('MISSION COMPLETE', '#4dffa0', lines, [
              { text: 'RETURN TO BASE', color: '#4dffa0', handler: () => returnToBase() },
            ]);
            celebrate();
          },
          // reklama niedostępna/błąd → pozwól spróbować jeszcze raz (panel z
          // wyborem wciąż wisi, żaden timer nie odsyła gracza na bazę).
          () => { if (!missionState.active) return; rescueUsed = false; showRescueBtn(); }
        );
      });
    };
    // showRescueBtn();   // DISABLED — CrazyGames Basic Launch nie pozwala na reklamy. Odkomentuj przy Full Launch.
  }

  clearQueue();
  if (m && m.fail) say(m.fail, {});
});

/* ============================================================
   POWRÓT NA BAZĘ
============================================================ */
export function returnToBase() {
  if (stageTimer !== null) { clearTimeout(stageTimer); stageTimer = null; }

  clearEnemies();
  resetHealth();

  // wracamy do areny bazy — ciasne granice dopasowane do faktycznego budynku
  // (foyer z=8 na północy, tylna ściana strzelnicy z=-42, ściany x=±16)
  S.arenaMinX = -16; S.arenaMaxX = 16;
  S.arenaMinZ = -42; S.arenaMaxZ = 8;
  // Culling świateł: z powrotem tylko światła bazy.
  setActiveArea('base');

  player.pos.copy(BASE_SPAWN);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  player.yaw = 0;
  player.pitch = 0;

  missionState.active = false;
  missionState.current = null;
  missionState.loc = null;
  missionState.stageIndex = 0;
  missionState.stageSpawnedCount = 0;
  missionState.transitioning = false;
  missionState.ending = false;

  rebuildShootables();
  hideEndPanel();
  hideAdButton();
  updateMissionHud();

  S.mode = 'play';
  S.missionEndScreenOpen = false;   // ekran wyboru zamknięty — player.js znów przejmuje pointer lock

  // Wznów grę: przejmij z powrotem pointer lock (wołane z kliknięcia przycisku
  // panelu = user-gesture, więc żądanie jest legalne).
  try { canvas.requestPointerLock(); } catch (e) { /* ignoruj */ }
}

/* ============================================================
   RETRY ETAPU — restart TYLKO bieżącego etapu (nie całej misji, nie bazy).
   Gracz wraca dokładnie do etapu, w którym zginął. Ta sama lokacja i arena
   (światła już ustawione) — NIE wołamy setActiveArea ani loadLocation.
============================================================ */
function retryStage() {
  const m = missionState.current;
  if (!m || !missionState.loc) return;

  if (stageTimer !== null) { clearTimeout(stageTimer); stageTimer = null; }

  clearEnemies();
  resetHealth();

  player.pos.copy(missionState.loc.spawnPoint);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  player.yaw = 0;
  player.pitch = 0;

  S.firing = false;
  S.aiming = false;
  S.missionEndScreenOpen = false;   // ekran wyboru zamknięty — player.js znów przejmuje pointer lock
  missionState.ending = false;
  missionState.transitioning = false;

  hideEndPanel();
  hideAdButton();

  const stageIdx = missionState.stageIndex;   // ZOSTAJE na tym samym etapie
  spawnStage(m, missionState.loc, stageIdx);   // spawnStage woła rebuildShootables()
  missionState.stageSpawnedCount = stageEnemyTotal(m.stages[stageIdx]);

  // Wznów grę: przejmij z powrotem pointer lock (wołane z kliknięcia = gest).
  try { canvas.requestPointerLock(); } catch (e) { /* ignoruj */ }

  clearQueue();
  if (m.stages[stageIdx].narration) say(m.stages[stageIdx].narration, {});
  updateMissionHud();
}

/* ============================================================
   HUD MISJI — własny, wstrzykiwany DOM (wzorem health.js/economy.js).
============================================================ */
let mhud = null;   // { root, name, count } | banner: { banner }

function buildMissionHud() {
  if (mhud) return mhud;
  if (typeof document === 'undefined') return null;
  const hud = document.getElementById('hud');
  if (!hud) return null;

  if (!document.getElementById('mission-hud-style')) {
    const st = document.createElement('style');
    st.id = 'mission-hud-style';
    st.textContent = `
      #mission-hud {
        position:absolute; left:50%; top:20px; transform:translateX(-50%);
        display:none; padding:8px 20px; text-align:center;
        background:rgba(8,18,13,.85); border:1px solid rgba(77,255,160,.35);
        border-radius:10px; color:#e8fff2; font-family:'Segoe UI', Arial, sans-serif;
        pointer-events:none; backdrop-filter:blur(6px);
      }
      #mission-hud .mh-name {
        font-size:13px; letter-spacing:4px; color:#4dffa0; text-transform:uppercase; font-weight:700;
      }
      #mission-hud .mh-count { font-size:12px; letter-spacing:2px; color:#7fdfae; margin-top:3px; }
      #mission-hud .mh-count b { color:#ffdd55; font-weight:800; }
      #mission-panel {
        position:absolute; left:50%; top:44%; transform:translate(-50%,-50%);
        display:none; flex-direction:column; align-items:center;
        min-width:340px; max-width:min(92%,520px); padding:28px 36px 26px; /* % — panel w skalowanym #hud, nie vw (patrz .mm-frame) */
        background:rgba(8,18,13,.9); border:1px solid rgba(77,255,160,.4);
        border-radius:14px; backdrop-filter:blur(8px); text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,.7), inset 0 0 50px rgba(77,255,160,.04);
        pointer-events:auto; font-family:'Segoe UI', Arial, sans-serif;
      }
      #mission-panel .mp-title {
        font-size:34px; font-weight:900; letter-spacing:6px; text-transform:uppercase;
        text-shadow:0 0 24px rgba(0,0,0,.7);
      }
      #mission-panel .mp-lines { margin-top:14px; color:#e8fff2; font-size:14px; letter-spacing:2px; }
      #mission-panel .mp-line { margin-top:5px; }
      #mission-panel .mp-actions {
        display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:22px;
      }
      #mission-panel .mp-btn {
        pointer-events:auto; padding:13px 26px; cursor:pointer;
        background:rgba(77,255,160,.1); border:2px solid #4dffa0; border-radius:10px;
        color:#4dffa0; font-family:'Segoe UI', Arial, sans-serif; font-size:15px;
        font-weight:800; letter-spacing:2px; text-transform:uppercase;
        transition:filter .15s, background .15s;
      }
      #mission-panel .mp-btn:hover { filter:brightness(1.25); background:rgba(77,255,160,.2); }
      #mission-adbtn {
        display:none; margin-top:14px; padding:10px 22px; cursor:pointer; pointer-events:auto;
        background:rgba(8,18,13,.6); border:2px solid #4dffa0; border-radius:9px;
        color:#4dffa0; font-family:'Segoe UI', Arial, sans-serif; font-size:13px;
        font-weight:800; letter-spacing:1.5px; text-transform:uppercase; transition:filter .15s;
      }
      #mission-adbtn:hover { filter:brightness(1.3); }
      #mission-adbtn:disabled { opacity:.5; cursor:default; }
    `;
    document.head.appendChild(st);
  }

  let root = document.getElementById('mission-hud');
  if (!root) {
    root = document.createElement('div');
    root.id = 'mission-hud';
    root.innerHTML = '<div class="mh-name"></div><div class="mh-count"></div>';
    hud.appendChild(root);
  }
  // Panel końcowy (wygrana/porażka): tytuł + podsumowanie zysków + przyciski
  // wyboru. Zastępuje dawny goły #mission-banner + osobny przycisk reklamy.
  let panel = document.getElementById('mission-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'mission-panel';
    panel.innerHTML = '<div class="mp-title"></div><div class="mp-lines"></div><div class="mp-actions"></div>';
    hud.appendChild(panel);
  }
  // Wspólny przycisk reklamy rewarded (hooki (b) i (c)) — budowany RAZ, siedzi
  // WEWNĄTRZ panelu, pod przyciskami głównymi. (b) i (c) wzajemnie się wykluczają
  // (sukces XOR porażka), więc jeden element wystarcza.
  let adbtn = document.getElementById('mission-adbtn');
  if (!adbtn) {
    adbtn = document.createElement('button');
    adbtn.id = 'mission-adbtn';
  }
  if (adbtn.parentNode !== panel) panel.appendChild(adbtn);

  mhud = {
    root,
    name: root.querySelector('.mh-name'),
    count: root.querySelector('.mh-count'),
    panel,
    panelTitle: panel.querySelector('.mp-title'),
    panelLines: panel.querySelector('.mp-lines'),
    panelActions: panel.querySelector('.mp-actions'),
    adbtn,
  };
  return mhud;
}

function updateMissionHud(aliveMaybe) {
  const u = buildMissionHud();
  if (!u) return;
  if (!missionState.active || !missionState.current) {
    u.root.style.display = 'none';
    return;
  }
  const alive = (typeof aliveMaybe === 'number') ? aliveMaybe : countAlive();
  const m = missionState.current;
  const totalStages = (m.stages && m.stages.length) || 1;
  const stageNum = Math.min(missionState.stageIndex + 1, totalStages);
  u.root.style.display = 'block';
  u.name.textContent = m.name;
  // np. "WROGOWIE: 3 / 5 · ETAP 2/3" — licznik żywych z BIEŻĄCEJ fali + postęp etapów
  u.count.innerHTML = 'ENEMIES: <b>' + alive + '</b> / ' + missionState.stageSpawnedCount +
                      ' &nbsp;·&nbsp; STAGE ' + stageNum + '/' + totalStages;
}

// Pokazuje panel końcowy. lines: tablica stringów (dozwolony prosty HTML dla
// kolorowania). actions: [{ text, color, handler }] → przyciski główne.
function showEndPanel(title, titleColor, lines, actions) {
  const u = buildMissionHud();
  if (!u || !u.panel) return;
  u.panelTitle.textContent = title;
  u.panelTitle.style.color = titleColor;

  u.panelLines.innerHTML = '';
  const ls = lines || [];
  for (const ln of ls) {
    const d = document.createElement('div');
    d.className = 'mp-line';
    d.innerHTML = ln;
    u.panelLines.appendChild(d);
  }
  u.panelLines.style.display = ls.length ? 'block' : 'none';

  u.panelActions.innerHTML = '';
  for (const a of (actions || [])) {
    const b = document.createElement('button');
    b.className = 'mp-btn';
    b.textContent = a.text;
    if (a.color) { b.style.color = a.color; b.style.borderColor = a.color; }
    b.onclick = a.handler;
    u.panelActions.appendChild(b);
  }
  u.panel.style.display = 'flex';
}
function hideEndPanel() {
  const u = buildMissionHud();
  if (!u || !u.panel) return;
  u.panel.style.display = 'none';
}

/* Przycisk reklamy rewarded pod bannerem — wspólny helper dla hooków (b)/(c). */
function showAdButton(text, color, handler) {
  const u = buildMissionHud();
  if (!u || !u.adbtn) return;
  const btn = u.adbtn;
  btn.textContent = text;
  btn.style.color = color;
  btn.style.borderColor = color;
  btn.disabled = false;
  btn.onclick = handler;
  btn.style.display = 'block';
}
function hideAdButton() {
  const u = buildMissionHud();
  if (!u || !u.adbtn) return;
  u.adbtn.style.display = 'none';
  u.adbtn.onclick = null;
  u.adbtn.disabled = false;
}

// Zbuduj HUD misji od razu (no-op i ponowna próba później, jeśli #hud jeszcze nie ma).
buildMissionHud();

/* ============================================================
   MAPA MISJI — dedykowany, pełnoekranowy overlay wyboru zlecenia.
   Osobny od #craft (warsztatu). Wstrzykiwany DOM + <style> (wzorem
   HUD misji / menu.js). Blokuje interakcję: pointer-events:auto,
   wysoki z-index. Skalowalny na więcej węzłów (siatka 5x4 = 20
   slotów; teraz 5 aktywnych, reszta = "WKRÓTCE").

   Publiczne API:
     openMissionMap()   — otwiera mapę (pauza jak openCraft w hud.js)
     closeMissionMap()  — zamyka mapę (powrót jak closeCraft w hud.js)
============================================================ */
const MAP_SLOTS = 20;   // 5 kolumn x 4 rzędy — miejsce na przyszłe misje
let mmap = null;        // { root, grid } | null dopóki DOM nie zbudowany

function buildMissionMap() {
  if (mmap) return mmap;
  if (typeof document === 'undefined' || !document.body) return null;

  if (!document.getElementById('mission-map-style')) {
    const st = document.createElement('style');
    st.id = 'mission-map-style';
    st.textContent = `
      #mission-map {
        position:fixed; inset:0; z-index:80; display:none;
        align-items:center; justify-content:center; pointer-events:auto;
        background:radial-gradient(ellipse at 50% 35%, #0c2318 0%, #040a07 78%);
        font-family:'Segoe UI', Arial, sans-serif; user-select:none;
      }
      #mission-map.open { display:flex; }
      #mission-map .mm-frame {
        /* %, nie vw/vh — #mission-map żyje w skalowanym #ui-scale-root (1280×720).
           vw/vh liczą się wzgl. realnego okna i po scale() były jeszcze raz skalowane:
           ramka wychodziła poza ekran (1920×1080) albo była za mała (wąskie okno). */
        position:relative; width:min(1180px,94%); height:min(820px,92%);
        display:flex; flex-direction:column; padding:26px 30px;
        background:
          repeating-linear-gradient(0deg, rgba(77,255,160,.05) 0 1px, transparent 1px 46px),
          repeating-linear-gradient(90deg, rgba(77,255,160,.05) 0 1px, transparent 1px 46px),
          rgba(8,18,13,.88);
        border:1px solid rgba(77,255,160,.35); border-radius:14px;
        box-shadow:0 20px 70px rgba(0,0,0,.7), inset 0 0 60px rgba(77,255,160,.04);
      }
      #mission-map .mm-header { position:relative; text-align:center; margin-bottom:22px; flex:0 0 auto; }
      #mission-map .mm-title {
        color:#e8fff2; font-size:26px; letter-spacing:9px; font-weight:900;
        text-transform:uppercase; text-shadow:0 0 18px rgba(77,255,160,.5);
      }
      #mission-map .mm-title span { color:#4dffa0; }
      #mission-map .mm-sub { color:#6fae8f; font-size:12px; letter-spacing:4px; margin-top:8px; text-transform:uppercase; }
      #mission-map .mm-close {
        position:absolute; right:0; top:2px; pointer-events:auto;
        background:rgba(77,255,160,.14); color:#4dffa0; border:1px solid #4dffa0; border-radius:9px;
        padding:11px 22px; font-size:13px; letter-spacing:3px; cursor:pointer; font-weight:700;
        transition:all .15s; font-family:'Segoe UI', Arial, sans-serif;
      }
      #mission-map .mm-close:hover { background:rgba(77,255,160,.28); box-shadow:0 0 20px rgba(77,255,160,.35); }
      #mission-map .mm-grid {
        flex:1 1 auto; display:grid; grid-template-columns:repeat(5,1fr); grid-auto-rows:1fr;
        gap:14px; overflow-y:auto; padding:4px; align-content:stretch;
      }
      #mission-map .mm-grid::-webkit-scrollbar { width:7px; }
      #mission-map .mm-grid::-webkit-scrollbar-thumb { background:#2f5a44; border-radius:4px; }
      #mission-map .mm-node {
        position:relative; display:flex; flex-direction:column; text-align:left; min-height:118px;
        background:rgba(255,255,255,.04); color:#cfeee0; border:1px solid rgba(120,160,140,.28);
        border-radius:10px; padding:12px 13px; cursor:pointer; overflow:hidden;
        font-family:'Segoe UI', Arial, sans-serif; letter-spacing:1px; transition:all .15s;
      }
      #mission-map .mm-node-idx { font-size:10px; letter-spacing:3px; color:#4a7862; font-weight:700; }
      #mission-map .mm-node-name { font-size:14px; font-weight:700; color:#e8fff2; margin-top:6px; line-height:1.25; }
      #mission-map .mm-node-reward { font-size:10px; letter-spacing:1px; color:#7fdfae; margin-top:auto; }
      #mission-map .mm-node-credits { font-size:11px; color:#ffdd55; font-weight:700; margin-top:3px; }
      #mission-map .mm-node-state {
        position:absolute; right:10px; top:10px; font-size:9px; letter-spacing:2px;
        padding:3px 7px; border-radius:5px; font-weight:800; text-transform:uppercase;
      }
      #mission-map .mm-node.open { border-color:rgba(77,255,160,.5); }
      #mission-map .mm-node.open:hover {
        background:rgba(77,255,160,.12); border-color:#4dffa0;
        box-shadow:0 0 18px rgba(77,255,160,.3); transform:translateY(-2px);
      }
      #mission-map .mm-node.open .mm-node-state { background:rgba(77,255,160,.16); color:#4dffa0; }
      #mission-map .mm-node.done { border-color:rgba(77,255,160,.35); }
      #mission-map .mm-node.done .mm-node-name { color:#9fe6c2; }
      #mission-map .mm-node.done .mm-node-state { background:rgba(77,255,160,.12); color:#8fe6bd; }
      #mission-map .mm-node.done:hover { background:rgba(77,255,160,.08); }
      #mission-map .mm-node.locked { opacity:.5; cursor:not-allowed; }
      #mission-map .mm-node.locked .mm-node-name { color:#8fa89a; }
      #mission-map .mm-node.locked .mm-node-reward { color:#c0803a; }
      #mission-map .mm-node.locked .mm-node-state { background:rgba(192,128,58,.15); color:#c0803a; }
      #mission-map .mm-node.empty {
        align-items:center; justify-content:center; text-align:center; cursor:default;
        border-style:dashed; border-color:rgba(120,160,140,.18); background:rgba(255,255,255,.015);
      }
      #mission-map .mm-node.empty .mm-node-idx { color:#365044; }
      #mission-map .mm-node-soon { font-size:10px; letter-spacing:3px; color:#3f5f50; margin-top:8px; text-transform:uppercase; }
      #mission-map .mm-foot {
        flex:0 0 auto; margin-top:18px; text-align:center; color:#5f8a76;
        font-size:11px; letter-spacing:3px; text-transform:uppercase;
      }
    `;
    document.head.appendChild(st);
  }

  let root = document.getElementById('mission-map');
  if (!root) {
    root = document.createElement('div');
    root.id = 'mission-map';
    root.innerHTML = `
      <div class="mm-frame">
        <div class="mm-header">
          <div class="mm-title">OPERATIONS <span>MAP</span></div>
          <div class="mm-sub">Select a job · Area of operations</div>
          <button class="mm-close" id="mm-close">✕ BACK</button>
        </div>
        <div class="mm-grid" id="mm-grid"></div>
        <div class="mm-foot">Complete a job to unlock the next · [F] / [ESC] — return to base</div>
      </div>`;
    // #ui-scale-root, nie body — mapa misji skalowana razem z resztą warstwy 2D UI.
    (document.getElementById('ui-scale-root') || document.body).appendChild(root);
    const cb = root.querySelector('#mm-close');
    if (cb) cb.addEventListener('click', closeMissionMap);
  }

  mmap = { root, grid: root.querySelector('#mm-grid') };
  return mmap;
}

function renderMissionMap() {
  const u = buildMissionMap();
  if (!u) return;
  u.grid.innerHTML = '';
  for (let i = 0; i < MAP_SLOTS; i++) {
    const m = MISSIONS[i];

    // slot bez misji — placeholder skalowalności (żadnych fikcyjnych misji)
    if (!m) {
      const empty = document.createElement('div');
      empty.className = 'mm-node empty';
      empty.innerHTML =
        `<div class="mm-node-idx">${String(i + 1).padStart(2, '0')}</div>` +
        `<div class="mm-node-soon">Soon</div>`;
      u.grid.appendChild(empty);
      continue;
    }

    const done = isMissionDone(m.id);
    const open = isMissionUnlocked(m.id);
    const state = done ? 'done' : (open ? 'open' : 'locked');
    const badge = done ? 'Completed' : (open ? 'Available' : 'Locked');
    const mark = done ? '✓ ' : (open ? '' : '🔒 ');
    const reward = m.unlockWeapon
      ? ('WEAPON: ' + (WEAPONS[m.unlockWeapon] ? WEAPONS[m.unlockWeapon].name : m.unlockWeapon))
      : ('BONUS ₡' + m.creditsReward);

    const node = document.createElement('button');
    node.className = 'mm-node ' + state;
    node.innerHTML =
      `<div class="mm-node-idx">ZONE ${String(i + 1).padStart(2, '0')}</div>` +
      `<div class="mm-node-name">${mark}${m.name}</div>` +
      `<div class="mm-node-reward">${reward}</div>` +
      `<div class="mm-node-credits">+₡${m.creditsReward}</div>` +
      `<div class="mm-node-state">${badge}</div>`;

    if (open) {
      node.onclick = () => {
        try { sfxClick(700, .14); } catch (e) { /* audio opcjonalne */ }
        closeMissionMap();
        startMission(m.id);
      };
    } else {
      node.disabled = true;
      node.onclick = () => { try { sfxEmpty(); } catch (e) { /* ignoruj */ } };
    }
    u.grid.appendChild(node);
  }
}

export function openMissionMap() {
  if (missionState.active) return;   // nie otwieraj mapy w trakcie misji
  const u = buildMissionMap();
  if (!u) return;
  // Tutorial: faktyczne otwarcie mapy misji = ukończenie ostatniego kroku 'missionmap'.
  if (currentStep()==='missionmap') markDone('missionmap');
  hideAllTutorialPrompts();   // defensywnie: chowamy ewentualny wiszący prompt przed przejściem w 'craft'
  // Pauza — dokładnie jak openCraft() w hud.js: tryb 'craft' bramkuje ruch/strzał/kamerę.
  S.mode = 'craft';
  S.firing = false;
  S.aiming = false;
  try { document.exitPointerLock(); } catch (e) { /* ignoruj */ }
  renderMissionMap();
  u.root.classList.add('open');
}

export function closeMissionMap() {
  const u = buildMissionMap();
  if (u) u.root.classList.remove('open');
  // Powrót — jak closeCraft() w hud.js: wznów grę i przejmij z powrotem pointer lock.
  S.mode = 'play';
  S.firing = false;
  S.aiming = false;
  try { canvas.requestPointerLock(); } catch (e) { /* ignoruj */ }
}

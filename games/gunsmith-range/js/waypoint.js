// waypoint.js — "szlaczki" na podłodze prowadzące gracza do AKTYWNEGO kroku
// tutorialowego w BAZIE (warsztat → strzelnica → mapa misji).
//
// Źródłem prawdy o postępie jest tutorialprogress.js (currentStep). Ścieżka prowadzi
// do celu odpowiadającego bieżącemu, jeszcze nieukończonemu krokowi — a krok kończy się
// dopiero po REALNEJ akcji (openCraft / ADS w strzelnicy / openMissionMap), więc ścieżka
// NIE przeskakuje do kolejnego celu zanim gracz faktycznie wykona bieżący.
// Gdy wszystkie kroki ukończone (currentStep()===null) — brak ścieżki.
//
// Ścieżka to PROSTA LINIA XZ gracz→cel (brak pathfindingu w grze — świadomy zakres),
// łańcuch współdzielonych mesh'y (jedna geometria + materiał, tylko repozycjonowane).
// Renderowana WYŁĄCZNIE w bazie w trybie 'play' i NIGDY podczas misji (missionState.active).
//
// updateWaypoint(dt) woła main.js co klatkę wewnątrz bloku S.mode==='play'.

import * as THREE from 'three';
import { scene, groundHeightAt, TABLE_POS, DIORAMA_POS } from './scene.js';
import { player } from './player.js';
import { S } from './state.js';
import { missionState } from './missions.js';
import { currentStep } from './tutorialprogress.js';

// Punkt wejścia do strzelnicy (hala z∈[-42,-20]); próg wykrycia w player.js to z<-21.
const RANGE_POS = new THREE.Vector3(0, 0, -21);

// Cele w kolejności kroków; key musi się zgadzać z STEPS w tutorialprogress.js.
const TARGETS = [
  { key: 'workshop',   pos: TABLE_POS },
  { key: 'range',      pos: RANGE_POS },
  { key: 'missionmap', pos: DIORAMA_POS },
];

const N = 10;              // rozmiar puli znaczników (reużywane instancje)
const SPACING = 1.15;      // odstęp między znacznikami wzdłuż linii (j)
const START_OFFSET = 1.6;  // pierwszy znacznik nieco przed graczem (j)
const GROUND_LIFT = 0.05;  // uniesienie nad podłogą, żeby nie z-fightować

let group = null;
let markers = [];
let recomputeT = 0.2;   // start ≥ próg → przelicz od razu w 1. klatce
let animT = 0;
let hasActive = false;

function ensureBuilt(){
  if (group) return;
  group = new THREE.Group();

  // Współdzielona geometria: płaski "grot" leżący na podłodze, wskazujący +Z.
  const geo = new THREE.ConeGeometry(0.17, 0.42, 4);
  geo.rotateX(-Math.PI / 2);   // wierzchołek +Y → +Z (leży płasko, wskazuje w przód)
  geo.rotateY(Math.PI / 4);    // kwadratowa podstawa → romb/strzałka

  // Materiał emisyjny (unlit — świeci niezależnie od oświetlenia sceny).
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4dffa0, transparent: true, opacity: 0.85,
  });

  for (let i = 0; i < N; i++){
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    group.add(m);
    markers.push(m);
  }
  scene.add(group);
}

// Throttled (co ~0.2s): ustal aktywny cel i rozłóż znaczniki wzdłuż linii XZ.
function recompute(){
  const cs = currentStep();                        // aktywny (nieukończony) krok lub null
  const t = cs ? TARGETS.find(t => t.key === cs) : null;
  const target = t ? t.pos : null;
  if (!target){ hasActive = false; return; }   // wszystko ukończone → brak ścieżki
  hasActive = true;

  const px = player.pos.x, pz = player.pos.z;
  const dx = target.x - px, dz = target.z - pz;
  const dist = Math.hypot(dx, dz) || 0.0001;
  const nx = dx / dist, nz = dz / dist;
  const yaw = Math.atan2(nx, nz);   // lokalne +Z znacznika → kierunek do celu

  for (let i = 0; i < N; i++){
    const m = markers[i];
    const d = START_OFFSET + i * SPACING;
    if (d > dist - 0.6){ m.visible = false; continue; }   // nie renderuj za celem
    const x = px + nx * d, z = pz + nz * d;
    m.position.set(x, groundHeightAt(x, z) - 1.7 + GROUND_LIFT, z);
    m.rotation.y = yaw;
    m.visible = true;
  }
}

export function updateWaypoint(dt){
  // Tylko wolna eksploracja bazy: rozgrywka i BRAK aktywnej misji.
  if (S.mode !== 'play' || missionState.active){
    if (group) group.visible = false;
    // Wymuś przeliczenie w PIERWSZEJ aktywnej klatce po powrocie — inaczej throttle
    // (recomputeT zamrożony przez ten early-return) zostawiłby znaczniki w pozycjach
    // sprzed misji na ~0.2s, choć grupa zapala się od razu.
    recomputeT = 0.2;
    return;
  }
  ensureBuilt();

  recomputeT += dt;
  if (recomputeT >= 0.2){ recomputeT = 0; recompute(); }

  if (!hasActive){ group.visible = false; return; }
  group.visible = true;

  // Pulsowanie skali z przesunięciem fazy per-znacznik (efekt "płynięcia" ku celowi).
  // Czas akumulowany z dt — NIE Date.now().
  animT += dt;
  for (let i = 0; i < N; i++){
    const m = markers[i];
    if (!m.visible) continue;
    const s = 1 + 0.18 * Math.sin(animT * 4 - i * 0.6);
    m.scale.set(s, s, s);
  }
}

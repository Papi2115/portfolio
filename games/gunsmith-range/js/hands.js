import * as THREE from 'three';
import { M, bx, WEAPONS } from './weapons.js';

/* ============================================================
   DŁONIE VIEWMODELU (Part B) — proceduralne, low-poly, w stylu
   prymitywów bx/cyl z weapons.js. Dwie ręce: dominująca (spustowa)
   na wbudowanym chwycie pistoletowym + wspierająca.
   Cała grupa jest dzieckiem vmWeapon, więc dziedziczy transformacje
   viewmodelu (w tym mocowania z Part A). Meshe tagowane isHands=true.
============================================================ */

// Jedna dłoń = pięść + grzbiet + 4 palce + kciuk (+ opcjonalnie nadgarstek + przedramię).
// Lokalnie: przedramię cofnięte wzdłuż +Z (ku graczowi), bo lufa idzie w −Z; palce
// zawijają się przez PRZÓD chwytu (−Z), kciuk z boku (+X).
// Wymiary powiększone ~1.4× względem poprzedniej wersji ORAZ dodane palce i grzbiet,
// bo poprzednia (subtelna) wersja została odrzucona jako niewidoczna — teraz masa
// pięści (.12×.14×.155) + jawne palce mają jednoznacznie czytać się jako dłoń na broni.
//
// withArm: gdy TRUE (dłoń dominująca / pistolet) dokładamy nadgarstek + przedramię —
//   naturalnie ciągną się w stronę gracza/w dół ekranu, nie kolidują z bryłą broni.
//   Gdy FALSE (wspierająca dłoń na broni długiej) budujemy SAMĄ DŁOŃ bez przedramienia:
//   przedramię wskazywało w tę samą oś Z co lufa/kolba/szyna i WBIJAŁO się w korpus broni
//   (feedback użytkownika: „ręka jest w broni"). Realnie przedramię ręki wspierającej i tak
//   jest zasłonięte korpusem broni z perspektywy gracza — pomijamy je zamiast ryzykować clipping.
function makeHand(withArm=true){
  const h = new THREE.Group();
  const fist  = bx(.12, .14, .155, M.skin, 0, 0,   -.015);      // główna masa pięści / kłykcie
  const back  = bx(.115,.05, .12,  M.skin, 0, .075, .0);        // grzbiet dłoni (widoczny z góry)
  const thumb = bx(.045,.05, .09,  M.skin, .072,.02,-.02, 0,0,-.5); // kciuk z boku, obrócony
  h.add(fist); h.add(back); h.add(thumb);
  if(withArm){
    const wrist = bx(.10, .112,.126, M.skin, 0,-.007, .10);     // nadgarstek za pięścią
    const arm   = bx(.105,.105,.36,  M.skin, 0,-.011, .28);     // przedramię, cofnięte ku graczowi (+Z)
    h.add(wrist); h.add(arm);
  }
  // 4 palce zawijające się przez przód pięści (−Z), rozłożone wzdłuż X, lekko podwinięte
  for(let i=0;i<4;i++){
    const fx = -.048 + i*.032;
    h.add(bx(.028,.05,.11, M.skin, fx, -.03, -.11, .35,0,0));   // palec
  }
  h.traverse(o=>{ if(o.isMesh) o.userData.isHands = true; });
  return h;
}

export function buildHands(wid){
  const W = WEAPONS[wid];
  const g = new THREE.Group();

  // --- ręka DOMINUJĄCA (spustowa): zawsze na wbudowanym chwycie pistoletowym,
  //     z pozycją i rotacją tego chwytu (obejmuje go). ---
  const dom = makeHand();
  // +.03 Z (ku kamerze) wypycha większą pięść przed sylwetkę broni, żeby nie ginęła
  // "wewnątrz" bryły chwytu z perspektywy gracza.
  dom.position.set(W.triggerGripPos[0], W.triggerGripPos[1], W.triggerGripPos[2] + .03);
  dom.rotation.set(...W.triggerGripRot);
  dom.userData.isDominantHand = true;
  g.add(dom);

  // --- ręka WSPIERAJĄCA ---
  // pistolet (oneHanded) → z przedramieniem (obie dłonie blisko ciała, przedramię ma sens);
  // broń długa → SAMA DŁOŃ bez przedramienia (patrz nota w makeHand: przedramię wbijało się w broń).
  const sup = makeHand(!!W.oneHanded);
  if(W.oneHanded){
    // pistolet: obie dłonie na tym samym chwycie — wspierająca podpiera dominującą
    // (klasyczna dwuręczna postawa). Offset ~pół szerokości pięści (~.03) w dół
    // i do przodu (−Z), lekki obrót, by "obejmowała" dominującą, nie przenikała.
    const [gx,gy,gz] = W.triggerGripPos;
    sup.position.set(gx - .045, gy - .045, gz + .02);   // obok/pod dominującą, lekko ku kamerze
    sup.rotation.set(W.triggerGripRot[0] + .2, .25, .1);
  } else {
    // broń długa: wspierająca (sama dłoń, bez przedramienia) na przednim chwycie / łożu.
    // +.04 Z (ku kamerze) i −.015 Y wysuwają dłoń spod łoża, żeby była jednoznacznie widoczna.
    sup.position.set(W.gripPos[0], W.gripPos[1] - .015, W.gripPos[2] + .04);
    // ROTACJA: silny roll ~78° wokół osi Z (1.35 rad) — dłoń obraca się na BOK, tak że
    // pięść + palce OPLATAJĄ poziome łoże/lufę od boku/spodu (zawinięte wokół osi Z broni),
    // zamiast leżeć płasko wzdłuż osi broni. Reprezentuje chwyt OD BOKU długiej broni lewą
    // ręką (feedback użytkownika: „długą broń od boku trzymać lewą ręką, tylko dłoń na broni").
    // Lekki −.15 X pochyla nadgarstek ku kamerze; Y=0 (bez skrętu w płaszczyźnie poziomej).
    sup.rotation.set(-.15, 0, 1.35);
  }
  // pozycja spoczynkowa wspierającej dłoni — do przywrócenia po przeładowaniu
  // (mirror magHome dla magazynków); animacja reloadu w viewmodel.js nadpisuje
  // sup.position per-klatkę i wraca do restPos gdy !S.reloading.
  sup.userData.isSupportHand = true;
  sup.userData.restPos = sup.position.clone();
  g.add(sup);

  // zwracamy referencje, by kod animacji przeładowania mógł sięgnąć wspierającej dłoni
  return { group: g, dominant: dom, support: sup };
}

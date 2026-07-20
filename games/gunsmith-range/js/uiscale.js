// ============================================================
//  SKALOWANIE WARSTWY 2D UI ("letterbox")
// ------------------------------------------------------------
//  Cała płaska warstwa UI (#hud, #scope-overlay, #craft, a dynamicznie także
//  #menu-root i #mission-map) żyje w kontenerze #ui-scale-root o STAŁYM rozmiarze
//  referencyjnym 1280×720 — rozdzielczości, na której gra była projektowana.
//  Tutaj skalujemy TEN kontener jednolitym transformem scale() tak, żeby zmieścił
//  się z zachowaniem proporcji w faktycznym oknie/iframe (np. wąski iframe
//  CrazyGames ~730×785), wyśrodkowany. Dzięki temu panele warsztatu/HUD nigdy się
//  nie nakładają na małych viewportach — kurczą się proporcjonalnie zamiast
//  zachowywać stałą szerokość w pikselach.
//
//  Canvas WebGL (#c) jest POZA tym kontenerem — renderer 3D reaguje na resize
//  osobno (scene.js), więc świat gry zawsze wypełnia całe okno.
//
//  Moduł importowany jako side-effect w main.js. #ui-scale-root istnieje w
//  statycznym HTML zanim main.js się wykona, więc getElementById go znajdzie.
// ============================================================
const REF_W = 1280, REF_H = 720;
const uiRoot = document.getElementById('ui-scale-root');

export function updateUiScale(){
  if(!uiRoot) return;
  // Zabezpieczenie: jeśli okno raportuje chwilowo zerowy wymiar (bywa przy resize/
  // przed pierwszym layoutem, zwłaszcza w iframe), NIE licz scale — inaczej wyszłoby
  // scale(0) i cała warstwa UI zniknęłaby aż do następnego resize. Zostaw poprzedni
  // (lub domyślny, brak transformu = scale 1) transform do czasu poprawnego wymiaru.
  if(!innerWidth || !innerHeight) return;
  // najmniejszy współczynnik z obu osi → cały kontener mieści się w oknie (contain)
  const scale = Math.min(innerWidth / REF_W, innerHeight / REF_H);
  // wyśrodkowanie: pozostały margines po każdej osi dzielony na pół
  const offX = (innerWidth  - REF_W * scale) / 2;
  const offY = (innerHeight - REF_H * scale) / 2;
  uiRoot.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
}

updateUiScale();
addEventListener('resize', updateUiScale);

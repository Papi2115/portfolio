// tutorialprompt.js — wizualne podpowiedzi sterowania na czas pierwszej narracji
// tutorialowej (warsztat = klawisz F, strzelnica = prawy przycisk myszy / ADS).
//
// Desktop: rysuje "keycap" [F] oraz grafikę myszki (czyste divy+CSS, zero obrazków)
//   wyśrodkowane u dołu ekranu, NAD #narrator-box (narrator siedzi na bottom:180px,
//   te prompty na bottom:300px → wyżej na ekranie).
// Mobile (S.touchActive): zamiast grafik podświetla fizyczny przycisk dotykowy
//   (#tc-interact / #tc-aim) przez highlightTouchButton() z touch.js.
//
// Elementy 2D żyją w #hud (host = getElementById('hud') || body) — dokładnie jak
// #narrator-box — więc trafiają do skalowanego #ui-scale-root i skalują się razem
// z resztą UI. CSS trzyma się jednostek px/% (bez vh/vw) zgodnie z warstwą skalowania.
//
// Cykl życia sterowany z player.js (updateTutorialHints): show* wołane w momencie,
// gdy narracja faktycznie rusza, hide* podpięte jako sayOnce(..., { onDone }).

import { S } from './state.js';
import { highlightTouchButton } from './touch.js';

let mounted = false;
let keycapEl = null;
let mouseEl = null;

function ensureMounted(){
  if (mounted) return;
  if (typeof document === 'undefined') return;
  mounted = true;

  if (!document.getElementById('tut-prompt-style')){
    const style = document.createElement('style');
    style.id = 'tut-prompt-style';
    style.textContent = `
      #tut-keycap, #tut-mouse {
        position: fixed;
        left: 50%;
        bottom: 300px;              /* wyżej niż #narrator-box (bottom:180px) */
        transform: translateX(-50%);
        display: none;              /* .show → flex */
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        font-family: 'Segoe UI', Arial, sans-serif;
        z-index: 51;                /* tuż nad #narrator-box (z-index:50) */
      }
      #tut-keycap.show, #tut-mouse.show { display: flex; }

      .tut-key {
        width: 62px; height: 62px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 12px;
        background: rgba(8,18,13,.9);
        border: 2px solid rgba(77,255,160,.6);
        color: #4dffa0;
        font-weight: 700; font-size: 30px; line-height: 1;
        box-shadow: 0 6px 0 rgba(77,255,160,.22),
                    0 12px 30px rgba(0,0,0,.6),
                    inset 0 0 18px rgba(77,255,160,.12);
        animation: tut-pulse 1.1s ease-in-out infinite;
      }
      .tut-cap {
        color: #4dffa0; font-weight: 700; font-size: 12px;
        letter-spacing: 3px; text-transform: uppercase;
        text-shadow: 0 2px 8px rgba(0,0,0,.7);
      }

      /* ---- myszka z prymitywów (prawy przycisk podświetlony) ---- */
      .tut-mouse-body {
        position: relative;
        width: 52px; height: 82px;
        border: 2px solid rgba(77,255,160,.6);
        border-radius: 26px 26px 22px 22px;
        background: rgba(8,18,13,.9);
        box-shadow: 0 12px 30px rgba(0,0,0,.6),
                    inset 0 0 18px rgba(77,255,160,.1);
        overflow: hidden;
      }
      .tut-mouse-btn { position: absolute; top: 0; height: 42%; width: 50%; }
      .tut-mouse-l { left: 0; border-right: 1px solid rgba(77,255,160,.35); }
      .tut-mouse-r {
        right: 0;
        background: rgba(77,255,160,.85);
        box-shadow: inset 0 0 12px rgba(77,255,160,.6);
        animation: tut-rmb 1s ease-in-out infinite;
      }
      .tut-mouse-div {
        position: absolute; left: 50%; top: 0; width: 2px; height: 42%;
        margin-left: -1px; background: rgba(77,255,160,.35);
      }

      @keyframes tut-pulse {
        0%,100% { transform: scale(1);    box-shadow: 0 6px 0 rgba(77,255,160,.22), 0 12px 30px rgba(0,0,0,.6), inset 0 0 18px rgba(77,255,160,.12); }
        50%     { transform: scale(1.08); box-shadow: 0 6px 0 rgba(77,255,160,.35), 0 14px 34px rgba(0,0,0,.6), inset 0 0 26px rgba(77,255,160,.25); }
      }
      @keyframes tut-rmb {
        0%,100% { background: rgba(77,255,160,.55); }
        50%     { background: rgba(77,255,160,1);   }
      }
    `;
    document.head.appendChild(style);
  }

  const host = document.getElementById('hud') || document.body;

  keycapEl = document.createElement('div');
  keycapEl.id = 'tut-keycap';
  keycapEl.innerHTML = `<div class="tut-key">F</div><div class="tut-cap">Interact</div>`;
  host.appendChild(keycapEl);

  mouseEl = document.createElement('div');
  mouseEl.id = 'tut-mouse';
  mouseEl.innerHTML = `
    <div class="tut-mouse-body">
      <div class="tut-mouse-btn tut-mouse-l"></div>
      <div class="tut-mouse-btn tut-mouse-r"></div>
      <div class="tut-mouse-div"></div>
    </div>
    <div class="tut-cap">Right-click · Aim</div>`;
  host.appendChild(mouseEl);
}

/* ---- WARSZTAT [F] ---- */
export function showWorkshopPrompt(){
  if (S.touchActive){ highlightTouchButton('tc-interact', true); return; }
  ensureMounted();
  if (keycapEl) keycapEl.classList.add('show');
}
export function hideWorkshopPrompt(){
  highlightTouchButton('tc-interact', false);
  if (keycapEl) keycapEl.classList.remove('show');
}

/* ---- STRZELNICA (ADS = prawy przycisk) ---- */
export function showRangePrompt(){
  if (S.touchActive){ highlightTouchButton('tc-aim', true); return; }
  ensureMounted();
  if (mouseEl) mouseEl.classList.add('show');
}
export function hideRangePrompt(){
  highlightTouchButton('tc-aim', false);
  if (mouseEl) mouseEl.classList.remove('show');
}

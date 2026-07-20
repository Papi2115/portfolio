/* ============================================================
   CRAZYGAMES SDK v2 — cienka, defensywna warstwa integracji.
   ------------------------------------------------------------
   Gra jest testowana lokalnie (python -m http.server / plik lokalny),
   gdzie skrypt SDK może się NIE załadować (offline, ad-blocker, inna
   domena). Dlatego KAŻDE wywołanie SDK jest opakowane w optional
   chaining + try/catch — brak SDK nigdy nie wywala ani nie blokuje gry.

   SDK inicjalizuje się samo (skrypt w <head> index.html); brak manual init.

   Publiczne API:
     markLoaded()                         — loadingStop (koniec ładowania)
     tickGameplayState(mode)              — centralny watcher gameplayStart/Stop
     requestRewardedAd(onReward, onUnav)  — opcjonalna reklama rewarded
     celebrate()                          — happytime (osiągnięcie gracza)
============================================================ */

import { setSdkMuted } from './audio.js';

// --- loadingStart: wołane NATYCHMIAST przy załadowaniu modułu ---------------
// (crazysdk.js jest pierwszym importem w main.js → leci najwcześniej jak można)
try { window.CrazyGames?.SDK?.game?.loadingStart?.(); } catch (e) { /* SDK brak — ignoruj */ }

// --- MUTE z zewnątrz (przycisk mute na stronie CrazyGames, poza iframe) ------
// Wymóg dokumentacji CrazyGames: to wyciszenie MA priorytet nad wewnętrznym
// mute/głośnością gry (obsłużone w audio.js — sdkMuted wygrywa). Odczyt stanu
// początkowego + nasłuch zmian. Wszystko guardowane optional-chainingiem —
// brak SDK / starszy build bez addSettingsChangeListener nigdy nie wywala gry.
(function initSdkMute(){
  const game = window.CrazyGames?.SDK?.game;
  if (!game) return;
  try { setSdkMuted(!!game.settings?.muteAudio); } catch (e) { /* ignoruj */ }
  try {
    game.addSettingsChangeListener?.((s) => { try { setSdkMuted(!!s?.muteAudio); } catch (e) {} });
  } catch (e) { /* ignoruj — funkcja może nie istnieć w starszym SDK */ }
})();

// --- wykrycie środowiska ------------------------------------------------------
// 'local' (localhost, bez reklam) | 'crazygames' (pełne) | 'disabled' (inne domeny)
// Rozwiązanie środowiska on-demand (SDK może zainicjalizować się chwilę po
// załadowaniu modułu, więc czytamy przy każdym requestAd, nie jednorazowo).
// Zweryfikowane empirycznie na załadowanym SDK v2: environment jest wystawiane
// przez ASYNC `getEnvironment()` (zwraca 'local' na localhost); property
// `SDK.environment` bywa undefined. Dlatego: najpierw próba sync property (gdyby
// dany build ją wystawiał), a jeśli null → async getEnvironment(). Callback-style,
// bo requestRewardedAd wołany jest z synchronicznych handlerów onclick.
function resolveEnv(cb) {
  // 1) sync property (jeśli build ją wystawia)
  try {
    const envSync = window.CrazyGames?.SDK?.environment;
    if (typeof envSync === 'string') { cb(envSync); return; }
  } catch (e) { /* ignoruj */ }
  // 2) async getEnvironment() — właściwe API v2
  const getEnv = window.CrazyGames?.SDK?.getEnvironment;
  if (typeof getEnv === 'function') {
    let settled = false;
    const done = (env) => { if (settled) return; settled = true; cb(typeof env === 'string' ? env : null); };
    try {
      const p = getEnv.call(window.CrazyGames.SDK);
      if (p && typeof p.then === 'function') { p.then(done, () => done(null)); return; }
      done(p); return;   // gdyby zwróciło string synchronicznie
    } catch (e) { cb(null); return; }
  }
  cb(null);   // brak jakiegokolwiek źródła env
}

/* ------------------------------------------------------------
   KONIEC ŁADOWANIA — wołane raz z main.js po zbudowaniu sceny/menu.
   Cała geometria jest proceduralna (brak assetów async), więc
   loadingStart→loadingStop lecą niemal natychmiast po sobie — to OK
   i zgodne z realnym (bardzo krótkim) czasem ładowania tej gry.
------------------------------------------------------------ */
export function markLoaded() {
  try { window.CrazyGames?.SDK?.game?.loadingStop?.(); } catch (e) { /* ignoruj */ }
}

/* ------------------------------------------------------------
   CENTRALNY WATCHER gameplayStart / gameplayStop.
   Wołany RAZ na klatkę z main.js tick(S.mode). Zamiast rozsiewać
   wywołania po menu.js/hud.js/missions.js (łatwo o pominięcie/duplikat),
   trzymamy lastMode tutaj i reagujemy wyłącznie na PRZEJŚCIA:
     * wejście w 'play'  (menu→play, craft→play, mission start/end) → gameplayStart
     * wyjście z 'play'  (play→craft, play→menu, pauza)             → gameplayStop
------------------------------------------------------------ */
let lastMode = null;
export function tickGameplayState(mode) {
  if (mode === lastMode) return;          // brak przejścia → nic nie rób
  try {
    const game = window.CrazyGames?.SDK?.game;
    if (mode === 'play' && lastMode !== 'play') {
      game?.gameplayStart?.();
    } else if (mode !== 'play' && lastMode === 'play') {
      game?.gameplayStop?.();
    }
  } catch (e) { /* ignoruj */ }
  lastMode = mode;
}

/* ------------------------------------------------------------
   REKLAMA REWARDED (opcjonalna). Nagrodę przyznajemy WYŁĄCZNIE w
   adFinished (wymóg dokumentacji CrazyGames).

   Fallback dla testów lokalnych: jeśli SDK niedostępny (brak sieci /
   ad-blocker) albo środowisko == 'local' (localhost, wg docs bez reklam)
   → przyznajemy nagrodę OD RAZU, żeby dev mógł testować UX nagrody bez
   prawdziwych reklam. Na 'crazygames'/'disabled' zachowujemy się zgodnie
   z realnym wynikiem requestAd.

   onReward()      — przyznanie nagrody (adFinished lub fallback lokalny)
   onUnavailable() — reklama nie doszła do skutku (adError) — opcjonalny
------------------------------------------------------------ */
export function requestRewardedAd(onReward, onUnavailable) {
  const grantLocal = (reason) => {
    console.info('[crazysdk] ' + reason);
    try { if (onReward) onReward(); } catch (e) { console.warn('[crazysdk] onReward wyjątek', e); }
  };

  const ad = window.CrazyGames?.SDK?.ad;

  // SDK niezaładowany / brak sieci → nagroda lokalna dla testów UX.
  if (!ad || typeof ad.requestAd !== 'function') {
    grantLocal('SDK niedostępny — przyznaję nagrodę lokalnie do celów testowych');
    return;
  }

  // Rozstrzygnij środowisko (async), potem zdecyduj: 'local' = nagroda lokalna,
  // pozostałe ('crazygames'/'disabled'/null) = prawdziwa reklama.
  resolveEnv((env) => {
    if (env === 'local') {
      grantLocal('środowisko local — brak reklam, przyznaję nagrodę lokalnie do celów testowych');
      return;
    }
    try {
      ad.requestAd('rewarded', {
        adStarted: () => {},
        adFinished: () => { try { if (onReward) onReward(); } catch (e) { console.warn('[crazysdk] onReward wyjątek', e); } },
        adError: (err, data) => {
          console.warn('CrazyGames ad error', err, data);
          try { if (onUnavailable) onUnavailable(); } catch (e) { /* ignoruj */ }
        },
      });
    } catch (e) {
      console.warn('[crazysdk] requestAd wyjątek', e);
      try { if (onUnavailable) onUnavailable(); } catch (_) { /* ignoruj */ }
    }
  });
}

/* ------------------------------------------------------------
   HAPPYTIME — sygnał osiągnięcia gracza (opcjonalny wg docs).
   Wołany z missions.js przy ukończeniu misji.
------------------------------------------------------------ */
export function celebrate() {
  try { window.CrazyGames?.SDK?.game?.happytime?.(); } catch (e) { /* ignoruj */ }
}

/* ------------------------------------------------------------
   ZGODNOŚĆ TECHNICZNA: blokada domyślnego scrollowania strony (wheel).
   WYJĄTEK: panele warsztatu (#wpanel/#apanel/#spanel w index.html) mają
   overflow-y:auto (przewijalne listy broni/dodatków/statystyk) — nad nimi
   NIE blokujemy scrolla, żeby listy dało się przewijać. Poza nimi blokujemy
   domyślny scroll strony (gra i tak nie używa wheel do niczego).
------------------------------------------------------------ */
try {
  window.addEventListener('wheel', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('#wpanel, #apanel, #spanel')) return; // pozwól przewijać listy warsztatu
    e.preventDefault();
  }, { passive: false });
} catch (e) { /* środowisko bez window — ignoruj */ }

/* ============================================================
   ECONOMY — waluta gry (kredyty)
   Standalone module. Nic go jeszcze nie woła; integracja później:
   - wrogowie wołają addCredits() przy śmierci,
   - warsztat woła spendCredits()/canAfford() przy zakupach.

   Publiczne API:
     economy.credits            aktualny stan (liczba całkowita)
     addCredits(amount)         dolicza, zapisuje, aktualizuje HUD (+popup)
     spendCredits(amount)       true+odejmij jeśli stać; inaczej false, bez zmian
     canAfford(amount)          czysty check, bez efektów ubocznych
   ============================================================ */

const STORAGE_KEY = 'gunsmith_credits';

export const economy = { credits: 0 };

/* ---------- persistencja (odporna na brak/śmieci w localStorage) ---------- */
const STARTING_CREDITS = 150;   // budżet startowy TYLKO dla zupełnie nowego gracza (brak zapisu)
function loadCredits(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return STARTING_CREDITS;   // klucz nie istnieje = pierwsze uruchomienie
    const n = parseInt(raw, 10);
    // zapisany stan (nawet 0) szanujemy; tylko śmieci → 0, żeby nie rozdawać budżetu za korupcję zapisu
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch (e) {
    return STARTING_CREDITS;   // localStorage niedostępny — brak zapisu, traktuj jak nowego gracza
  }
}
function saveCredits(){
  try {
    localStorage.setItem(STORAGE_KEY, String(economy.credits));
  } catch (e) { /* localStorage niedostępny — cicho ignorujemy */ }
}

economy.credits = loadCredits();

/* ---------- HUD: styl wstrzykiwany raz przy załadowaniu modułu ---------- */
let creditsValEl = null;   // element z liczbą
let creditsRootEl = null;  // kontener (kotwica dla popupów)

function injectStyle(){
  if (document.getElementById('economy-style')) return;
  const st = document.createElement('style');
  st.id = 'economy-style';
  st.textContent = `
    #credits {
      position:absolute; right:38px; top:28px; text-align:right;
      color:#e8fff2; font-family:'Segoe UI', Arial, sans-serif;
    }
    #credits .big {
      font-size:34px; font-weight:800; letter-spacing:1px;
      text-shadow:0 0 12px rgba(77,255,160,.45);
    }
    #credits .big .cr { color:#4dffa0; margin-right:4px; }
    #credits .small {
      font-size:12px; color:#7fdfae; letter-spacing:4px; text-transform:uppercase;
    }
    #credits-pops { position:absolute; right:0; top:44px; height:0; }
    #credits .cr-pop {
      position:absolute; right:0; top:0; white-space:nowrap;
      font-size:20px; font-weight:800; color:#4dffa0; letter-spacing:1px;
      text-shadow:0 0 10px rgba(77,255,160,.6); pointer-events:none;
      animation:crfly .9s ease-out forwards;
    }
    @keyframes crfly {
      0%   { opacity:0; transform:translateY(6px) scale(.7); }
      18%  { opacity:1; transform:translateY(0) scale(1.15); }
      32%  { transform:scale(1); }
      100% { opacity:0; transform:translateY(-34px); }
    }
  `;
  document.head.appendChild(st);
}

function buildHud(){
  const hud = document.getElementById('hud');
  if (!hud || document.getElementById('credits')) return;
  const root = document.createElement('div');
  root.id = 'credits';
  root.innerHTML =
    '<div class="big"><span class="cr">₡</span><span id="credits-val">0</span></div>' +
    '<div class="small">Credits</div>' +
    '<div id="credits-pops"></div>';
  hud.appendChild(root);
  creditsRootEl = root;
  creditsValEl = root.querySelector('#credits-val');
  renderCredits();
}

function ensureHud(){
  if (typeof document === 'undefined') return;
  injectStyle();
  if (!creditsValEl) buildHud();
}

function renderCredits(){
  if (creditsValEl) creditsValEl.textContent = economy.credits;
}

function floatPopup(amount){
  const host = document.getElementById('credits-pops');
  if (!host) return;
  const span = document.createElement('span');
  span.className = 'cr-pop';
  span.textContent = '+' + amount;
  host.appendChild(span);
  setTimeout(() => span.remove(), 950);
}

// Bezpieczne wywołanie przy starcie (jeśli #hud już istnieje w DOM).
ensureHud();

/* ---------- API ---------- */

// Dolicza kredyty. Ujemne/zerowe/niepoprawne wartości = no-op (nie crashuje).
export function addCredits(amount){
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return;
  economy.credits += n;
  saveCredits();
  ensureHud();
  renderCredits();
  floatPopup(n);
}

// Kontrakt (na sztywno dla przyszłego UI warsztatu):
//   zwraca true i odejmuje TYLKO jeśli stać (credits >= amount),
//   inaczej zwraca false i NIC nie odejmuje.
// spendCredits(0) → true, no-op. Ujemne/śmieci traktujemy jak brak wydatku (true, no-op).
export function spendCredits(amount){
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return true;   // nic do zapłaty
  if (economy.credits < n) return false;            // nie stać — bez zmian
  economy.credits -= n;
  saveCredits();
  ensureHud();
  renderCredits();
  return true;
}

// Czysty check, bez efektów ubocznych.
export function canAfford(amount){
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return true;
  return economy.credits >= n;
}

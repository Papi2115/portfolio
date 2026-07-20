/* ============================================================
   PROGRESS — trwały stan postępu gracza (localStorage).
   Świadomie BEZ ciężkich importów (tylko localStorage), żeby
   mogły go importować i player.js, i hud.js, i missions.js bez
   ryzyka cykli importu.

   Trzyma trzy rzeczy:
     1) odblokowane bronie   (gunsmith_unlocked_weapons)
     2) ekwipunek granatów   (gunsmith_grenades)  {flash, explosive, selected}
     3) ukończone misje       (gunsmith_missions_done)

   Publiczne API:
     isWeaponUnlocked(wid) / getUnlockedWeapons() / unlockWeapon(wid)
     grenadeInv (obiekt mutowalny), addGrenade(type,n) / useGrenade(type) / selectGrenade(type)
     isMissionDone(id) / markMissionDone(id) / getMissionsDone()
============================================================ */

const WKEY = 'gunsmith_unlocked_weapons';
const GKEY = 'gunsmith_grenades';
const CKEY = 'gunsmith_missions_done';
const AKEY = 'gunsmith_unlocked_attachments';

const DEFAULT_UNLOCKED = ['rifle', 'pistol'];      // startowy arsenał
const GRENADE_TYPES = ['flash', 'explosive'];       // 'flash' = ogłuszający, 'explosive' = wybuchowy

/* ---------- persistencja (odporna na brak/śmieci) ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* cicho */ }
}

/* ============================================================
   1) ODBLOKOWANE BRONIE
============================================================ */
const unlocked = new Set((() => {
  const arr = loadJSON(WKEY, DEFAULT_UNLOCKED);
  return Array.isArray(arr) ? arr : DEFAULT_UNLOCKED;
})());
// startowe bronie zawsze dostępne (nawet gdy zapis był uszkodzony)
for (const w of DEFAULT_UNLOCKED) unlocked.add(w);

export function isWeaponUnlocked(wid) { return unlocked.has(wid); }
export function getUnlockedWeapons() { return [...unlocked]; }
export function unlockWeapon(wid) {
  if (wid && !unlocked.has(wid)) {
    unlocked.add(wid);
    saveJSON(WKEY, [...unlocked]);
    return true;
  }
  return false;
}

/* ============================================================
   2) GRANATY (ekwipunek + wybrany typ)
============================================================ */
export const grenadeInv = (() => {
  const v = loadJSON(GKEY, null);
  const o = { flash: 0, explosive: 0, selected: 'flash' };
  if (v && typeof v === 'object') {
    o.flash = Math.max(0, Math.floor(Number(v.flash)) || 0);
    o.explosive = Math.max(0, Math.floor(Number(v.explosive)) || 0);
    if (v.selected === 'flash' || v.selected === 'explosive') o.selected = v.selected;
  }
  return o;
})();

function saveGrenades() {
  saveJSON(GKEY, { flash: grenadeInv.flash, explosive: grenadeInv.explosive, selected: grenadeInv.selected });
}

export function addGrenade(type, n = 1) {
  if (!GRENADE_TYPES.includes(type)) return;
  grenadeInv[type] = Math.max(0, grenadeInv[type] + n);
  saveGrenades();
}
export function useGrenade(type) {
  if (!GRENADE_TYPES.includes(type)) return false;
  if (grenadeInv[type] > 0) {
    grenadeInv[type]--;
    saveGrenades();
    return true;
  }
  return false;
}
export function selectGrenade(type) {
  if (GRENADE_TYPES.includes(type)) {
    grenadeInv.selected = type;
    saveGrenades();
  }
}

/* ============================================================
   3) UKOŃCZONE MISJE
============================================================ */
const done = new Set((() => {
  const arr = loadJSON(CKEY, []);
  return Array.isArray(arr) ? arr : [];
})());

export function isMissionDone(id) { return done.has(id); }
export function getMissionsDone() { return [...done]; }
export function markMissionDone(id) {
  if (id && !done.has(id)) {
    done.add(id);
    saveJSON(CKEY, [...done]);
    return true;
  }
  return false;
}

/* ============================================================
   4) ODBLOKOWANE DODATKI (globalne, nie per-broń)
   Raz kupiony dodatek działa na WSZYSTKICH broniach z danym slotem.
   Klucz zapisu: "slot:key" np. "scope:reddot", "mag:ext".
============================================================ */
const unlockedAttach = new Set((() => {
  const arr = loadJSON(AKEY, []);
  return Array.isArray(arr) ? arr : [];
})());

function attachKey(slot, key) { return slot + ':' + key; }

export function isAttachmentUnlocked(slot, key) {
  return key === 'none' || unlockedAttach.has(attachKey(slot, key));
}
export function unlockAttachment(slot, key) {
  const k = attachKey(slot, key);
  if (!unlockedAttach.has(k)) {
    unlockedAttach.add(k);
    saveJSON(AKEY, [...unlockedAttach]);
    return true;
  }
  return false;
}

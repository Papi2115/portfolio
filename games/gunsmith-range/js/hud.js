import * as THREE from 'three';
import { canvas, camera, holoGroup, holoLight, TABLE_POS } from './scene.js';
import { player, hideAllTutorialPrompts } from './player.js';
import { vmWeapon, refreshViewmodel } from './viewmodel.js';
import { WEAPONS } from './weapons.js';
import { ATTACH, SLOT_ORDER, loadout, effectiveStats, buildWeaponModel } from './attachments.js';
import { S } from './state.js';
import { rebuildShootables } from './combat.js';
import { sfxClick, sfxAttach, sfxEmpty } from './audio.js';
import { isWeaponUnlocked, unlockWeapon, grenadeInv, addGrenade, selectGrenade, isAttachmentUnlocked, unlockAttachment } from './progress.js';
import { spendCredits, canAfford } from './economy.js';
import { missionState } from './missions.js';
import { requestRewardedAd } from './crazysdk.js';
import { currentStep, markDone } from './tutorialprogress.js';

/* Ceny granatów w warsztacie (₡). */
const GRENADE_SHOP = {
  flash:     { label: 'STUN GRENADE',     cost: 40 },
  explosive: { label: 'FRAG GRENADE',     cost: 60 },
};

export const scopeOverlay = document.getElementById('scope-overlay');

function showHitmarker(){
  const hm = document.getElementById('hitmarker');
  hm.style.opacity = 1;
  clearTimeout(hm._t);
  hm._t = setTimeout(()=>hm.style.opacity=0, 120);
}
function popup(text, bull){
  const p = document.createElement('div');
  p.className = 'pop'+(bull?' bull':'');
  p.textContent = text;
  p.style.left = (48 + Math.random()*6) + '%';
  p.style.top = (38 + Math.random()*8) + '%';
  document.getElementById('popups').appendChild(p);
  setTimeout(()=>p.remove(), 1000);
}
function updateCombo(){
  const c = document.getElementById('combo');
  if(S.combo>1){ c.textContent = `COMBO x${Math.min(S.combo,5)}`; c.style.opacity=1; }
  else c.style.opacity=0;
}
function updateHUD(){
  const st = effectiveStats(S.currentWeapon);
  document.getElementById('score-val').textContent = S.score;
  document.getElementById('ammo-cur').textContent = S.reloading? '––' : S.ammo;
  document.getElementById('ammo-max').textContent = st.mag;
  document.getElementById('fire-mode').textContent = S.reloading? 'RELOADING…' : (WEAPONS[S.currentWeapon].mode + (st.suppressed? ' · SILENCED':''));
  document.getElementById('wname').textContent = WEAPONS[S.currentWeapon].name;
}
export { showHitmarker, popup, updateCombo, updateHUD };

/* ---------- celownik dynamiczny ---------- */
const chEl = document.getElementById('crosshair');
function buildCrosshair(){
  chEl.innerHTML='';
  for(let i=0;i<4;i++){
    const l=document.createElement('div'); l.className='ch-line'; chEl.appendChild(l);
  }
  const dot=document.createElement('div'); dot.className='ch-line';
  dot.style.cssText+='width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%;';
  chEl.appendChild(dot);
}
buildCrosshair();
export function updateCrosshair(gap){
  const ls = chEl.children;
  // top, bottom, left, right
  ls[0].style.cssText += `width:2px;height:9px;left:-1px;top:${-gap-9}px;`;
  ls[1].style.cssText += `width:2px;height:9px;left:-1px;top:${gap}px;`;
  ls[2].style.cssText += `width:9px;height:2px;left:${-gap-9}px;top:-1px;`;
  ls[3].style.cssText += `width:9px;height:2px;left:${gap}px;top:-1px;`;
  chEl.style.opacity = (S.aiming && effectiveStats(S.currentWeapon).scopeOverlay) ? 0 : (S.aiming? .35 : 1);
}

/* ============================================================
   CRAFTING UI
============================================================ */
const hintEl = document.getElementById('hint');
const craftEl = document.getElementById('craft');
let holoModel = null;
let craftReturn = null;

/* ---------- podgląd attachmentu ("przymierz, potem kup") ----------
   Stan TYMCZASOWY, trzymany WYŁĄCZNIE tutaj. previewKey dotyczy S.currentWeapon.
   NIEZMIENNIK: loadout w spoczynku NIGDY nie trzyma niezapłaconego wariantu.
   Podgląd wchodzi do loadout tylko na czas jednego synchronicznego wywołania
   (patrz withPreview) i jest natychmiast przywracany, więc effectiveStats()
   wołane co klatkę w main.js nigdy nie zobaczy niezapłaconej wartości. */
let previewSlot = null, previewKey = null;
function clearPreview(){ previewSlot = null; previewKey = null; }   // loadout już realny — wystarczy wyzerować
// Uruchamia fn z TYMCZASOWO nałożonym podglądem na loadout, po czym synchronicznie przywraca stan.
function withPreview(fn){
  if(previewSlot === null) return fn();
  const wid = S.currentWeapon;
  const real = loadout[wid][previewSlot];
  loadout[wid][previewSlot] = previewKey;
  try { return fn(); }
  finally { loadout[wid][previewSlot] = real; }   // przywrócenie ZAWSZE (nawet przy wyjątku)
}

export function openCraft(){
  if(missionState.active) return; // nie da się wejść do warsztatu w trakcie misji
  // Tutorial: faktyczne wejście do warsztatu = ukończenie kroku 'workshop' (dowolne źródło:
  // klawisz F, przycisk dotykowy, itp.) → odblokowuje krok 'range'.
  if(currentStep()==='workshop') markDone('workshop');
  hideAllTutorialPrompts();   // S.mode→'craft' zatrzyma updateTutorialHints; chowamy prompt [F] tu i teraz
  S.mode='craft';
  S.firing=false; S.aiming=false;
  document.exitPointerLock();
  craftEl.classList.add('open');
  holoLight.intensity = 30;
  craftReturn = { yaw:player.yaw, pitch:player.pitch };
  refreshHolo();
  renderCraftUI();
  sfxClick(600,.15); sfxClick(900,.12);
}
export function closeCraft(){
  clearPreview();   // wyjście z warsztatu kasuje ewentualny podgląd (loadout zostaje realny)
  S.mode='play';
  craftEl.classList.remove('open');
  holoLight.intensity = 0;
  if(holoModel){ holoGroup.remove(holoModel); holoModel=null; }
  S.ammo = effectiveStats(S.currentWeapon).mag;
  refreshViewmodel();
  rebuildShootables();
  canvas.requestPointerLock();
  sfxClick(900,.12);
}
document.getElementById('craft-close').addEventListener('click', closeCraft);

function refreshHolo(){
  if(holoModel) holoGroup.remove(holoModel);
  // buildWeaponModel jest synchroniczny → podgląd nakładany i zdejmowany w obrębie tego wywołania
  holoModel = withPreview(()=> buildWeaponModel(S.currentWeapon));
  holoModel.scale.setScalar(1.9);
  holoGroup.add(holoModel);
}

function renderCraftUI(){
  // lista broni — tylko odblokowane są wybieralne; zablokowane wyszarzone z etykietą misji
  const wl = document.getElementById('wlist');
  wl.innerHTML='';
  for(const wid of Object.keys(WEAPONS)){
    const unlocked = isWeaponUnlocked(wid);
    const b = document.createElement('button');
    b.className = 'wbtn'+(wid===S.currentWeapon?' sel':'')+(unlocked?'':' locked');
    const st = WEAPONS[wid].stats;
    if(unlocked){
      b.innerHTML = `${WEAPONS[wid].name}<small>${WEAPONS[wid].mode} · ${st.rpm} RPM · DMG ${st.damage}</small>`;
      b.onclick = ()=>{ clearPreview(); S.currentWeapon=wid; sfxClick(1000,.12); refreshHolo(); renderCraftUI(); };
    } else if(WEAPONS[wid].purchasable){
      // broń kupowalna wprost w warsztacie (nie przypisana do misji) — wzorzec z renderGrenades()
      b.classList.remove('locked');
      b.innerHTML = `${WEAPONS[wid].name}<small>BUY FOR ₡${WEAPONS[wid].price} · ${WEAPONS[wid].mode} · DMG ${st.damage}</small>`;
      b.disabled = !canAfford(WEAPONS[wid].price);
      b.onclick = ()=>{
        if(spendCredits(WEAPONS[wid].price)){ clearPreview(); unlockWeapon(wid); S.currentWeapon=wid; sfxAttach(); refreshHolo(); renderCraftUI(); }
        else sfxEmpty();
      };
    } else {
      // Broń misyjna: normalnie zdobywana w misji. Odblokowanie reklamą TYMCZASOWO
      // WYŁĄCZONE — CrazyGames Basic Launch (obecny tier zgłoszenia) nie pozwala na
      // reklamy. Kod niżej ZOSTAJE zakomentowany do łatwego przywrócenia przy
      // przejściu na Full Launch — NIE USUWAĆ. `.locked` (z linii wyżej) zostaje na
      // przycisku → wygląd spójny z resztą zablokowanych broni.
      b.innerHTML = `🔒 ${WEAPONS[wid].name}<small>EARN IN A MISSION</small>`;
      b.disabled = true;
      b.onclick = null;
      /*
      b.classList.remove('locked');
      b.innerHTML = `🔒 ${WEAPONS[wid].name}<small>🎬 UNLOCK WITH AD · OR EARN IN A MISSION</small>`;
      b.onclick = ()=>{
        if(b.disabled) return;
        b.disabled = true;   // blokada przed równoległymi żądaniami reklamy podczas oczekiwania
        requestRewardedAd(()=>{
          clearPreview();
          unlockWeapon(wid);
          S.currentWeapon = wid;
          sfxAttach();
          refreshHolo();
          renderCraftUI();   // przebuduje listę (broń już odblokowana → normalny przycisk)
        }, ()=>{ b.disabled = false; sfxEmpty(); });   // reklama niedostępna → odblokuj, można spróbować ponownie
      };
      */
    }
    wl.appendChild(b);
  }
  renderGrenades();
  // sloty dodatków
  const sl = document.getElementById('slots');
  sl.innerHTML='';
  for(const slot of SLOT_ORDER){
    const div = document.createElement('div'); div.className='slot';
    const cur = loadout[S.currentWeapon][slot];
    div.innerHTML = `<div class="slot-name"><span>${ATTACH[slot].label}</span><span class="eq">${ATTACH[slot][cur].label}</span></div>`;
    const btns = document.createElement('div'); btns.className='abtns';
    for(const key of Object.keys(ATTACH[slot])){
      if(key==='label') continue;
      const variant = ATTACH[slot][key];
      const unlocked = isAttachmentUnlocked(slot, key);
      const isPreview = (previewSlot===slot && previewKey===key);
      const a = document.createElement('button');
      if(unlocked){
        // już odblokowany (albo 'none') — klik = darmowy wybór, bez kosztu.
        // Zakłada wariant na trwałe i KASUJE ewentualny aktywny podgląd innego wariantu.
        a.className = 'abtn'+(key===cur?' sel':'');
        a.textContent = variant.label;
        a.onclick = ()=>{
          clearPreview();
          loadout[S.currentWeapon][slot]=key;
          sfxAttach();
          refreshHolo(); renderCraftUI();
        };
      } else {
        // nieodblokowany — klik = PRZYMIARKA (podgląd), NIE zakup. Kredyty nietknięte.
        const price = variant.price;
        a.className = 'abtn locked'+(isPreview?' preview':'');
        a.innerHTML = `${variant.label}<small>₡${price}</small>`;
        a.onclick = ()=>{
          previewSlot = slot; previewKey = key;   // ustaw podgląd (zastępuje poprzedni)
          sfxClick(700,.1);
          refreshHolo(); renderCraftUI();
        };
      }
      btns.appendChild(a);
    }
    div.appendChild(btns);
    // Aktywny podgląd w tym slocie → przycisk BUY, dopiero on robi faktyczny zakup.
    if(previewSlot===slot){
      const price = ATTACH[slot][previewKey].price;
      const key = previewKey;   // kapturowane przy renderze — chroni przed stale-DOM przy powtórnym kliku
      const buy = document.createElement('button');
      buy.className = 'abuy';
      buy.textContent = `BUY ₡${price}`;
      buy.onclick = ()=>{
        if(previewSlot !== slot || previewKey !== key) return;   // podgląd już nieaktualny (stale DOM)
        if(spendCredits(price)){
          unlockAttachment(slot, key);
          loadout[S.currentWeapon][slot]=key;   // TERAZ na trwałe (zapłacone)
          clearPreview();
          sfxAttach();
          refreshHolo(); renderCraftUI();
        } else {
          // za mało kredytów — krótki wizualny feedback (brak wzorca shake w projekcie)
          sfxEmpty();
          buy.classList.add('nofunds');
          setTimeout(()=>buy.classList.remove('nofunds'), 320);
        }
      };
      div.appendChild(buy);
    }
    sl.appendChild(div);
  }
  // statystyki — z nałożonym podglądem (synchronicznie, loadout zaraz przywrócony)
  const st = withPreview(()=> effectiveStats(S.currentWeapon));
  const base = WEAPONS[S.currentWeapon].stats;
  const rows = [
    ['DAMAGE', st.damage, 100, base.damage],
    ['FIRE RATE', st.rpm, 1000, base.rpm],
    ['ACCURACY', 100-(st.spread*3000), 100, 100-(base.spread*3000)],
    ['RECOIL CONTROL', 100-(st.recoil*1000), 100, 100-(base.recoil*1000)],
    ['MAGAZINE', st.mag, 50, base.mag],
    ['RELOAD', Math.max(5,100-(st.reload*30)), 100, Math.max(5,100-(base.reload*30))],
  ];
  const sp = document.getElementById('stats');
  sp.innerHTML='';
  for(const [name,val,max,baseVal] of rows){
    const d=document.createElement('div'); d.className='stat';
    const pct = Math.max(3,Math.min(100, val/max*100));
    const changed = Math.abs(val-baseVal)>.5;
    d.innerHTML = `<div class="stat-row"><span>${name}</span><span class="val">${Math.round(val)}</span></div>
      <div class="bar"><i class="${changed?'delta-up':''}" style="width:${pct}%"></i></div>`;
    sp.appendChild(d);
  }
}

/* ---------- warsztat: sekcja granatów (kup / wybierz aktywny) ---------- */
function renderGrenades(){
  const gl = document.getElementById('glist');
  if(!gl) return;
  gl.innerHTML='';
  for(const type of Object.keys(GRENADE_SHOP)){
    const shop = GRENADE_SHOP[type];
    const owned = grenadeInv[type] || 0;
    const active = grenadeInv.selected===type;

    const row = document.createElement('div');
    row.className = 'grow';

    // przycisk kup
    const buy = document.createElement('button');
    buy.className = 'gbtn';
    buy.innerHTML = `${shop.label}<small>OWNED: ${owned} · COST ₡${shop.cost}</small>`;
    buy.disabled = !canAfford(shop.cost);
    buy.onclick = ()=>{
      if(spendCredits(shop.cost)){ addGrenade(type,1); sfxAttach(); renderCraftUI(); }
      else sfxEmpty();
    };

    // przycisk wybierz aktywny
    const sel = document.createElement('button');
    sel.className = 'gsel'+(active?' sel':'');
    sel.textContent = active? 'ACTIVE' : 'SELECT';
    sel.onclick = ()=>{ selectGrenade(type); sfxClick(1000,.12); renderCraftUI(); };

    row.appendChild(buy);
    row.appendChild(sel);
    gl.appendChild(row);
  }
}

export function updateCraftCamera(dt, now, curFov){
  // Względem TABLE_POS (nie na sztywno wpisane stare współrzędne stołu sprzed
  // przebudowy bazy — to była przyczyna buga: kamera jechała do starej pozycji
  // (0,*,-8), czyli teraz w głąb korytarza, a stół/hologram jest przy (-9,0,-2)).
  const camTarget = new THREE.Vector3(TABLE_POS.x, TABLE_POS.y+2.0, TABLE_POS.z);
  const camPos = new THREE.Vector3(TABLE_POS.x, TABLE_POS.y+2.3, TABLE_POS.z+3.4);
  camera.position.lerp(camPos, Math.min(1,6*dt));
  const m = new THREE.Matrix4().lookAt(camera.position, camTarget, new THREE.Vector3(0,1,0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  camera.quaternion.slerp(q, Math.min(1,6*dt));
  const newFov = THREE.MathUtils.lerp(curFov, 60, Math.min(1,6*dt));
  camera.fov=newFov; camera.updateProjectionMatrix();
  if(vmWeapon) vmWeapon.visible=false;
  if(holoModel){
    holoModel.rotation.y += dt*.7;
    holoModel.position.y = Math.sin(now*1.5)*.07;
  }
  scopeOverlay.style.display='none';
  return newFov;
}

export function updateHint(near, text='Gunsmith Workshop'){
  if(near){
    hintEl.innerHTML = 'Press <b>[F]</b> — ' + text;
    hintEl.style.opacity=1;
  } else hintEl.style.opacity=0;
}

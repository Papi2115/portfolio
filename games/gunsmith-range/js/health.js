// health.js — Player health system for GUNSMITH RANGE.
// Self-contained foundation module: state + public API + injected HUD.
// Other modules call takeDamage()/heal()/reset()/onDeath() directly.
// Public contract (do NOT rename/resignature — other agents depend on it):
//   health (object), takeDamage(amount), heal(amount), reset(), onDeath(cb)

export const health = { hp: 100, max: 100, dead: false };

// Registered death listeners (multiple supported — mission system etc. subscribe here).
const deathListeners = [];

// ---------------------------------------------------------------------------
// DOM injection — built lazily so module import order can't crash us.
// #hud exists in index.html's static markup (pointer-events:none container),
// but we guard anyway in case this module is ever imported before the DOM.
// ---------------------------------------------------------------------------
let ui = null; // { root, fill, num, vignette, deathMsg } once built

function buildUI() {
  if (ui) return ui;
  const hud = (typeof document !== 'undefined') && document.getElementById('hud');
  if (!hud) return null; // DOM/#hud not ready yet — try again on next call.

  // --- health panel (bottom-left, clear of ammo @ bottom-right & score @ top-left corner) ---
  const root = document.createElement('div');
  root.id = 'health-hud';
  root.style.cssText = [
    'position:absolute',
    'left:38px',
    'bottom:32px',
    'width:210px',
    'padding:10px 12px',
    'background:rgba(8,18,13,.88)',
    'border:1px solid rgba(77,255,160,.35)',
    'border-radius:10px',
    'color:#e8fff2',
    'font-family:inherit',
    'pointer-events:none',
    'backdrop-filter:blur(6px)'
  ].join(';');

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;';

  const label = document.createElement('span');
  label.textContent = 'HP';
  label.style.cssText = 'font-size:12px;letter-spacing:3px;color:#7fdfae;text-transform:uppercase;';

  const num = document.createElement('span');
  num.style.cssText = 'font-size:20px;font-weight:800;letter-spacing:1px;text-shadow:0 0 10px rgba(77,255,160,.5);';

  head.appendChild(label);
  head.appendChild(num);

  const bar = document.createElement('div');
  bar.style.cssText = 'height:7px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden;';

  const fill = document.createElement('i');
  fill.style.cssText = 'display:block;height:100%;width:100%;border-radius:4px;transition:width .35s cubic-bezier(.2,.8,.3,1),background .35s,box-shadow .35s;';

  bar.appendChild(fill);
  root.appendChild(head);
  root.appendChild(bar);
  hud.appendChild(root);

  // --- damage vignette: reuse the dormant #damage-vignette CSS rule from index.html
  //     (box-shadow:inset 0 0 180px rgba(255,40,40,.0); transition:box-shadow .3s;)
  //     so it picks up the fade transition for free. ---
  let vignette = document.getElementById('damage-vignette');
  if (!vignette) {
    vignette = document.createElement('div');
    vignette.id = 'damage-vignette';
    // Fallback inline in case the CSS rule is ever missing; matches index.html's rule.
    vignette.style.position = 'absolute';
    vignette.style.inset = '0';
    vignette.style.pointerEvents = 'none';
    vignette.style.boxShadow = 'inset 0 0 180px rgba(255,40,40,.0)';
    vignette.style.transition = 'box-shadow .3s';
    hud.appendChild(vignette);
  }

  // --- death message (our own DOM — do NOT touch #hint/#popups which belong to hud.js) ---
  const deathMsg = document.createElement('div');
  deathMsg.id = 'health-death-msg';
  deathMsg.textContent = 'YOU DIED';
  deathMsg.style.cssText = [
    'position:absolute',
    'top:42%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'font-size:64px',
    'font-weight:800',
    'letter-spacing:10px',
    'color:#ff4444',
    'text-shadow:0 0 24px rgba(255,40,40,.7)',
    'opacity:0',
    'transition:opacity .3s',
    'pointer-events:none'
  ].join(';');
  hud.appendChild(deathMsg);

  ui = { root, fill, num, vignette, deathMsg };
  updateBar();
  return ui;
}

// Clamp helper — coerces to a finite number so no input can throw/NaN the state.
function num(v) {
  v = Number(v);
  return Number.isFinite(v) ? v : 0;
}

// Linear interpolate two hex colors (#rrggbb) by t in [0,1].
function lerpColor(a, b, t) {
  const ax = parseInt(a.slice(1), 16), bx = parseInt(b.slice(1), 16);
  const ar = (ax >> 16) & 255, ag = (ax >> 8) & 255, ab = ax & 255;
  const br = (bx >> 16) & 255, bg = (bx >> 8) & 255, bb = bx & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

function updateBar() {
  const u = buildUI();
  if (!u) return;
  const max = health.max > 0 ? health.max : 1;
  const frac = Math.max(0, Math.min(1, health.hp / max));
  u.num.textContent = Math.round(health.hp) + ' / ' + Math.round(health.max);
  u.fill.style.width = (frac * 100) + '%';

  // Green when healthy, shift toward red below ~30% HP (danger indicator).
  if (frac > 0.30) {
    u.fill.style.background = 'linear-gradient(90deg,#1e8f5a,#4dffa0)';
    u.fill.style.boxShadow = '0 0 8px rgba(77,255,160,.4)';
  } else {
    // t: 0 at 30% HP (green edge) -> 1 at 0% HP (full red).
    const t = 1 - (frac / 0.30);
    const c1 = lerpColor('#1e8f5a', '#8f1e1e', t);
    const c2 = lerpColor('#4dffa0', '#ff4444', t);
    u.fill.style.background = 'linear-gradient(90deg,' + c1 + ',' + c2 + ')';
    u.fill.style.boxShadow = '0 0 8px rgba(255,68,68,' + (0.3 + 0.4 * t).toFixed(2) + ')';
  }
}

// Brief red vignette flash whose intensity scales with hit size relative to max HP.
function flashDamage(amount) {
  const u = buildUI();
  if (!u) return;
  const max = health.max > 0 ? health.max : 1;
  const sev = Math.max(0, Math.min(1, num(amount) / max)); // 0..1
  const alpha = (0.30 + 0.45 * sev).toFixed(2);            // ~.30 small hit .. .75 huge hit
  u.vignette.style.boxShadow = 'inset 0 0 180px rgba(255,40,40,' + alpha + ')';
  setTimeout(() => {
    if (ui) ui.vignette.style.boxShadow = 'inset 0 0 180px rgba(255,40,40,.0)';
  }, 150);
}

function showDeathMessage() {
  const u = buildUI();
  if (!u) return;
  u.deathMsg.style.opacity = '1';
  setTimeout(() => {
    if (ui) ui.deathMsg.style.opacity = '0';
  }, 2200);
}

function fireDeath() {
  showDeathMessage();
  // Copy so a listener that (un)registers during dispatch can't corrupt the walk.
  const listeners = deathListeners.slice();
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i]();
    } catch (e) {
      // A misbehaving listener must not break the death flow or other listeners.
      if (typeof console !== 'undefined') console.error('onDeath listener threw:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reduce HP by amount (floored at 0). Ignored if already dead. Fires death once. */
export function takeDamage(amount) {
  if (health.dead) return;
  const dmg = Math.max(0, num(amount)); // negative "damage" never heals
  if (dmg > 0) {
    health.hp = Math.max(0, health.hp - dmg);
    flashDamage(dmg);
  }
  updateBar();
  if (health.hp <= 0 && !health.dead) {
    health.hp = 0;
    health.dead = true;
    fireDeath();
  }
}

/** Increase HP by amount (capped at max). No effect once dead (respawn via reset()). */
export function heal(amount) {
  if (health.dead) return;
  const amt = Math.max(0, num(amount)); // negative "heal" never damages
  health.hp = Math.min(health.max, health.hp + amt);
  updateBar();
}

/** Restore to full and clear death flag — call on new mission / respawn. */
export function reset() {
  health.hp = health.max;
  health.dead = false;
  const u = buildUI();
  if (u) u.deathMsg.style.opacity = '0';
  updateBar();
}

/** Register a callback fired once when the player dies. Multiple listeners supported. */
export function onDeath(callback) {
  if (typeof callback === 'function') deathListeners.push(callback);
}

// Build the HUD as soon as the module loads (no-op & retried later if #hud absent).
buildUI();

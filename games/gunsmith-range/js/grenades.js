import * as THREE from 'three';
import { scene } from './scene.js';
import { AC, master } from './audio.js';
import { damageEnemiesInRadius, stunEnemiesInRadius } from './enemies.js';

/* ============================================================
   GRANATY — prosto: wybuchajacy zabija, ogluszajacy oglusza.
   Fizyka pocisku (grawitacja + opcjonalny odbicie), zapalnik
   czasowy, detonacja = efekt na wrogach (enemies.js) + wizual
   (sfera + swiatlo) + syntezowany dzwiek (WebAudio, jak audio.js).
   Zero plikow zewnetrznych, tylko prymitywy Three.js.
============================================================ */

// Grawitacja spojna z graczem (main.js: player.vel.y -= 14*dt).
const GRAV = 14;
// Poziom podloza dla granatu (plane sceny jest na y=0).
const GROUND_Y = 0.1;

// Parametry per typ granatu.
const TYPES = {
  explosive: {
    color:      0x3a4025,   // ciemna oliwka
    fuseTime:   1.6,
    radius:     7.5,        // promien fragmentacji
    stunDur:    0,
    lethal:     true,
    lightColor: 0xffa040,   // pomaranczowo-czerwony blysk
    flashPeak:  40,
    flashRange: 22,
    ringColor:  0xff7018,
  },
  flash: {
    color:      0xc8ccd2,   // jasnoszary / srebrny
    fuseTime:   1.5,
    radius:     12,         // szerszy zasieg niz wybuch
    stunDur:    4,          // sekundy ogluszenia
    lethal:     false,
    lightColor: 0xffffff,   // bialy blysk
    flashPeak:  90,
    flashRange: 28,
    ringColor:  0xffffff,
  },
};

// Domyslna predkosc wyrzutu (mnoznik power=1) — daje luk ~8-15 j.
const BASE_THROW_SPEED = 15;
// Wspolczynnik restytucji przy odbiciu od ziemi.
const BOUNCE = 0.45;
// Tarcie poziome przy kontakcie z ziemia (zeby granat nie slizgal sie w nieskonczonosc).
const GROUND_FRICTION = 0.7;

// Aktywne pociski i aktywne efekty detonacji (do sprzatania).
const grenades = [];
const effects = [];

const _dir = new THREE.Vector3();

/* ---------- API: rzut ---------- */
export function throwGrenade(type, fromPos, direction, opts = {}) {
  const cfg = TYPES[type] || TYPES.explosive;
  const power = (opts.power != null && isFinite(opts.power)) ? opts.power : 1;
  const fuseTime = (opts.fuseTime != null && isFinite(opts.fuseTime)) ? opts.fuseTime : cfg.fuseTime;

  // Kierunek — normalizuj defensywnie (moze przyjsc nieznormalizowany lub zerowy).
  _dir.copy(direction);
  if (_dir.lengthSq() < 1e-8) _dir.set(0, 0, -1);
  else _dir.normalize();

  const speed = BASE_THROW_SPEED * power;

  // Predkosc startowa wzdluz celowania.
  const vel = _dir.clone().multiplyScalar(speed);
  // Doloz troche luku, gdy celujemy plasko — inaczej granat tylko slizga sie po ziemi.
  // Im bardziej poziomy rzut (male |dir.y|), tym wieksza wymuszona skladowa +Y.
  const flatness = 1 - Math.min(1, Math.abs(_dir.y) / 0.5); // 1 przy poziomym, 0 przy stromym
  vel.y += speed * 0.2 * flatness;

  // Mesh pocisku — mala sfera, kolor per typ.
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.6, metalness: 0.3 })
  );
  mesh.castShadow = true;
  mesh.position.copy(fromPos);
  scene.add(mesh);

  grenades.push({
    type,
    cfg,
    mesh,
    vel,
    fuse: fuseTime,
    bounces: 0,
    detonated: false,
  });
}

/* ---------- API: aktualizacja co klatke ---------- */
export function updateGrenades(dt) {
  if (dt > 0.1) dt = 0.1; // zabezpieczenie przy zamrozonej klatce

  // --- pociski ---
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    if (g.detonated) continue;

    // grawitacja
    g.vel.y -= GRAV * dt;

    // integracja pozycji
    const p = g.mesh.position;
    p.x += g.vel.x * dt;
    p.y += g.vel.y * dt;
    p.z += g.vel.z * dt;

    // odbicie od ziemi (par razy dla klimatu; potem lezy)
    if (p.y <= GROUND_Y) {
      p.y = GROUND_Y;
      if (g.vel.y < 0) {
        if (g.bounces < 3 && Math.abs(g.vel.y) > 1.2) {
          g.vel.y = -g.vel.y * BOUNCE;
          g.vel.x *= GROUND_FRICTION;
          g.vel.z *= GROUND_FRICTION;
          g.bounces++;
        } else {
          g.vel.set(0, 0, 0); // spoczywa na ziemi do wybuchu
        }
      }
    }

    // lekka rotacja w locie (wizualny detal)
    g.mesh.rotation.x += g.vel.z * dt * 0.5;
    g.mesh.rotation.z += g.vel.x * dt * 0.5;

    // zapalnik czasowy
    g.fuse -= dt;
    if (g.fuse <= 0) {
      detonate(g);
      // usun pocisk ze sceny
      scene.remove(g.mesh);
      disposeMesh(g.mesh);
      grenades.splice(i, 1);
    }
  }

  // --- efekty detonacji (animacja rozszerzajacej sie sfery + zanik swiatla) ---
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += dt;
    const k = fx.t / fx.dur; // 0..1

    if (k >= 1) {
      // sprzataj
      scene.remove(fx.sphere);
      disposeMesh(fx.sphere);
      scene.remove(fx.light);
      effects.splice(i, 1);
      continue;
    }

    // sfera: rosnie i blednie
    const scale = 1 + k * fx.maxScale;
    fx.sphere.scale.setScalar(scale);
    fx.sphere.material.opacity = (1 - k) * 0.85;

    // swiatlo: szybki narost, potem zanik
    fx.light.intensity = k < 0.2
      ? fx.peak * (k / 0.2)
      : fx.peak * (1 - (k - 0.2) / 0.8);
  }
}

/* ---------- detonacja ---------- */
function detonate(g) {
  if (g.detonated) return;
  g.detonated = true;
  const cfg = g.cfg;
  const pos = g.mesh.position.clone();

  // Efekt na wrogach (enemies.js — kontrakt).
  if (g.type === 'explosive') {
    damageEnemiesInRadius(pos, cfg.radius, 999, { lethal: true });
    boom(pos, cfg);
  } else {
    stunEnemiesInRadius(pos, cfg.radius, cfg.stunDur);
    bang(pos, cfg);
  }

  spawnFlashEffect(pos, cfg);
}

/* ---------- wizual: rozszerzajaca sie sfera + PointLight ---------- */
function spawnFlashEffect(pos, cfg) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.35, 16, 12),
    new THREE.MeshBasicMaterial({
      color: cfg.ringColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    })
  );
  sphere.position.copy(pos);
  scene.add(sphere);

  const light = new THREE.PointLight(cfg.lightColor, 0, cfg.flashRange, 1.8);
  light.position.copy(pos);
  scene.add(light);

  effects.push({
    sphere,
    light,
    t: 0,
    dur: 0.42,
    maxScale: 1.6,
    peak: cfg.flashPeak,
  });
}

/* ============================================================
   DZWIEK — syntezowany lokalnie (AC/master z audio.js).
   Nie dotykamy audio.js; mirror wzorca (szum + sinus-thump).
============================================================ */
const _noise = (() => {
  const b = AC.createBuffer(1, AC.sampleRate * 1, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();

// Wybuch: mocny, niski — filtrowany burst szumu + gleboki sinus-thump.
function boom(pos, cfg) {
  const t = AC.currentTime;

  // 1) BODY: szeroki szum przez lowpass opadajacy — huk fragmentacji
  const body = AC.createBufferSource(); body.buffer = _noise;
  body.playbackRate.value = 0.85 + Math.random() * 0.1;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
  lp.Q.value = 0.8;
  const bg = AC.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  body.connect(lp); lp.connect(bg); bg.connect(master);
  body.start(t); body.stop(t + 0.8);

  // 2) THUMP: gleboki opadajacy sinus — podmuch
  const thump = AC.createOscillator(); thump.type = 'sine';
  thump.frequency.setValueAtTime(120, t);
  thump.frequency.exponentialRampToValueAtTime(28, t + 0.4);
  const tg = AC.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.95, t + 0.012);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
  thump.connect(tg); tg.connect(master);
  thump.start(t); thump.stop(t + 0.6);

  // 3) CRACK: ostry transient na start (highpass)
  const crack = AC.createBufferSource(); crack.buffer = _noise;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const cg = AC.createGain();
  cg.gain.setValueAtTime(0.0001, t);
  cg.gain.exponentialRampToValueAtTime(0.6, t + 0.002);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  crack.connect(hp); hp.connect(cg); cg.connect(master);
  crack.start(t); crack.stop(t + 0.12);
}

// Flashbang: ostry, wysoki „bang" — jasny transient + krotki dzwon.
function bang(pos, cfg) {
  const t = AC.currentTime;

  // 1) TRANSIENT: bardzo ostry szeroki szum, blyskawiczny zanik
  const tr = AC.createBufferSource(); tr.buffer = _noise;
  tr.playbackRate.value = 1.4;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 0.6;
  const trg = AC.createGain();
  trg.gain.setValueAtTime(0.0001, t);
  trg.gain.exponentialRampToValueAtTime(1.0, t + 0.001);
  trg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  tr.connect(bp); bp.connect(trg); trg.connect(master);
  tr.start(t); tr.stop(t + 0.25);

  // 2) RING: wysoki opadajacy sinus — dzwoniacy „piiing" w uszach
  const ring = AC.createOscillator(); ring.type = 'sine';
  ring.frequency.setValueAtTime(4200, t);
  ring.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
  const rg = AC.createGain();
  rg.gain.setValueAtTime(0.0001, t);
  rg.gain.exponentialRampToValueAtTime(0.35, t + 0.004);
  rg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  ring.connect(rg); rg.connect(master);
  ring.start(t); ring.stop(t + 0.4);
}

/* ---------- pomocnicze ---------- */
function disposeMesh(mesh) {
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
    else mesh.material.dispose();
  }
}

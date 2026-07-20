/* ============================================================
   AUDIO — wszystko syntezowane w WebAudio, zero plików
============================================================ */
export const AC = new (window.AudioContext || window.webkitAudioContext)();
export const master = AC.createGain(); master.connect(AC.destination);

/* ------------------------------------------------------------
   GŁOŚNOŚĆ — trzy niezależne warstwy o jasnym priorytecie:
     userVolume  – preferencja gracza (suwak), 0..1, PERSYSTOWANA (localStorage)
     userMuted   – toggle „mute" w panelu pauzy, SESYJNY (nie persystowany)
     sdkMuted    – wymuszone z CrazyGames SDK, ZAWSZE NADRZĘDNE nad powyższymi
   master.gain = (sdkMuted || userMuted) ? 0 : userVolume.
   Wymóg dokumentacji CrazyGames: zewnętrzne wyciszenie MA priorytet nad
   wewnętrznym ustawieniem gry — dlatego sdkMuted wygrywa bez wyjątków.
------------------------------------------------------------ */
const VOL_KEY = 'gunsmith_volume';
let userVolume = 0.5;
try {
  const raw = localStorage.getItem(VOL_KEY);
  if (raw !== null) { const v = parseFloat(raw); if (!Number.isNaN(v)) userVolume = Math.max(0, Math.min(1, v)); }
} catch (e) { /* localStorage może być niedostępny — ignoruj */ }

let userMuted = false;   // toggle „mute" w panelu pauzy — NIE persystowany (sesyjny)
let sdkMuted = false;    // wymuszone z CrazyGames SDK — ZAWSZE nadrzędne

function applyVolume(){ master.gain.value = (sdkMuted || userMuted) ? 0 : userVolume; }
applyVolume();

export function setUserVolume(v){
  userVolume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(VOL_KEY, String(userVolume)); } catch (e) { /* ignoruj */ }
  applyVolume();
}
export function getUserVolume(){ return userVolume; }
export function setUserMuted(v){ userMuted = !!v; applyVolume(); }
export function isUserMuted(){ return userMuted; }
export function setSdkMuted(v){ sdkMuted = !!v; applyVolume(); }

function noiseBuffer(dur=0.5){
  const b = AC.createBuffer(1, AC.sampleRate*dur, AC.sampleRate);
  const d = b.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
  return b;
}
const NOISE = noiseBuffer(1);

/* ------------------------------------------------------------
   PROFILE WYSTRZAŁU per typ broni.
   Klucz = id broni z WEAPONS (rifle/pistol/smg/dmr/shotgun/lmg/bullpup/revolver).
   Każdy profil steruje 4 warstwami syntezy (crack / body / thump / mechanizm)
   + opcjonalnym „tail" (echo dużego kalibru) i „crisp" (drugi ostry transient).
   Gdy profil nieznany/undefined → parametry wyliczane z `heavy` (WSTECZNA ZGODNOŚĆ).
     crackHz  – highpass transientu (im wyżej, tym ostrzejszy „trzask")
     crackPk  – szczyt transientu
     crackDec – czas zaniku transientu (dłuższy = grubszy strzał)
     bodyHz   – startowy lowpass korpusu (im wyżej, tym jaśniejszy)
     bodyPk   – szczyt korpusu
     bodyDec  – zanik korpusu (dłuższy = dłuższy „ogon")
     thStart/thEnd – opadający oscylator basu (masa/kaliber)
     thPk/thDec    – szczyt/zanik basu
     mech     – głośność metalicznego klaku zamka
     tail     – 0 lub siła echa (rezonansowy szum lowpass o długim zaniku)
     crisp    – 0..1: ile drugiego, bardzo ostrego pod-transientu (sniper/pistolet)
------------------------------------------------------------ */
const SHOT_PROFILES = {
  // SEMI, wysoki damage, niski rpm → ostry, trzaskający, krótki tail
  pistol:   { crackHz:3400, crackPk:.60, crackDec:.034, bodyHz:4400, bodyPk:.52, bodyDec:.10, thStart:170, thEnd:44, thPk:.58, thDec:.12, mech:.06, tail:0,   crisp:1  },
  // magnum: bardzo głośny, mocny bas + wyraźne echo
  revolver: { crackHz:3100, crackPk:.74, crackDec:.05,  bodyHz:5200, bodyPk:.82, bodyDec:.20, thStart:215, thEnd:36, thPk:1.05,thDec:.24, mech:.05, tail:.30, crisp:1  },
  // AUTO: chrupiący/mechaniczny, spójny rytm, umiarkowany bas
  rifle:    { crackHz:3200, crackPk:.56, crackDec:.044, bodyHz:6000, bodyPk:.68, bodyDec:.16, thStart:160, thEnd:46, thPk:.75, thDec:.16, mech:.11, tail:.08, crisp:.5 },
  // AUTO szybki: lżejszy, wyższy, snappy
  smg:      { crackHz:3900, crackPk:.46, crackDec:.030, bodyHz:6600, bodyPk:.52, bodyDec:.10, thStart:138, thEnd:52, thPk:.48, thDec:.10, mech:.10, tail:0,   crisp:.4 },
  // BURST: krispi jak rifle, lekko ostrzejszy transient
  bullpup:  { crackHz:3600, crackPk:.56, crackDec:.040, bodyHz:6200, bodyPk:.62, bodyDec:.14, thStart:150, thEnd:48, thPk:.62, thDec:.14, mech:.11, tail:.05, crisp:.5 },
  // SEMI, najwyższy damage/range → najostrzejszy crack + długie echo
  dmr:      { crackHz:4300, crackPk:.80, crackDec:.056, bodyHz:5600, bodyPk:.72, bodyDec:.20, thStart:195, thEnd:40, thPk:.95, thDec:.22, mech:.07, tail:.42, crisp:1  },
  // PUMP: najgrubszy/najniższy „boom", szeroki, najdłuższy tail
  shotgun:  { crackHz:2100, crackPk:.50, crackDec:.06,  bodyHz:3300, bodyPk:.92, bodyDec:.30, thStart:150, thEnd:29, thPk:1.10,thDec:.32, mech:.08, tail:.36, crisp:.2 },
  // AUTO ciężki: jak rifle, ale cięższy/bardziej basowy (masa)
  lmg:      { crackHz:2800, crackPk:.62, crackDec:.05,  bodyHz:5200, bodyPk:.84, bodyDec:.20, thStart:178, thEnd:35, thPk:1.0, thDec:.22, mech:.12, tail:.24, crisp:.4 },
};

export function sfxShot(suppressed=false, heavy=0.5, profile){
  const t = AC.currentTime;
  const rnd = (a,b)=> a + Math.random()*(b-a);
  // per-shot randomizacja (rozbija robotyczne rapid-fire)
  const jit = rnd(0.94, 1.06);          // ~±6% na częstotliwości
  const dly = rnd(0, 0.004);            // mikro-opóźnienie startu warstw
  heavy = Math.max(0, Math.min(1, heavy));

  // Wybór parametrów: profil broni lub fallback wyliczony z `heavy` (jak dawniej).
  const P = (profile && SHOT_PROFILES[profile]) ? SHOT_PROFILES[profile] : {
    crackHz:3200, crackPk:.55, crackDec:.045,
    bodyHz:5200 + heavy*1800, bodyPk:.6 + heavy*0.2, bodyDec:.16 + heavy*0.08,
    thStart:150 + heavy*90, thEnd:34 + heavy*22, thPk:.62 + heavy*0.35, thDec:.16 + heavy*0.10,
    mech:.07, tail:0, crisp:.5,
  };

  // --- 1) TRANSIENT / CRACK: krótki high-passowany szum, bardzo szybki atak+zanik ---
  const crack = AC.createBufferSource(); crack.buffer = NOISE;
  crack.playbackRate.value = rnd(0.9, 1.1);
  const hp = AC.createBiquadFilter();
  hp.type='highpass';
  hp.frequency.setValueAtTime((suppressed? 1400 : P.crackHz)*jit, t);
  const crackG = AC.createGain();
  const crackPk = suppressed? .16 : P.crackPk;
  const crackDec = suppressed? .03 : P.crackDec;
  crackG.gain.setValueAtTime(0.0001, t);
  crackG.gain.exponentialRampToValueAtTime(crackPk, t+0.001);   // ostry atak
  crackG.gain.exponentialRampToValueAtTime(.0008, t+crackDec);  // szybki zanik
  crack.connect(hp); hp.connect(crackG); crackG.connect(master);
  crack.start(t); crack.stop(t+0.12);

  // --- 1b) DRUGI OSTRY POD-TRANSIENT: dla „trzaskających" broni (pistolet/dmr/rewolwer) ---
  // Bardzo krótki, wyżej odfiltrowany klik z mikroskopijnym opóźnieniem — „podwójny slap"
  // pogrubiający atak. Pomijany dla tłumika i broni o niskim crisp.
  if(!suppressed && P.crisp > 0.35){
    const ct = t + rnd(0.0012, 0.0035);
    const c2 = AC.createBufferSource(); c2.buffer = NOISE;
    c2.playbackRate.value = rnd(1.0, 1.25);
    const hp2 = AC.createBiquadFilter(); hp2.type='highpass';
    hp2.frequency.setValueAtTime((P.crackHz*1.35)*jit, ct);
    const c2g = AC.createGain();
    c2g.gain.setValueAtTime(0.0001, ct);
    c2g.gain.exponentialRampToValueAtTime(P.crackPk*0.5*P.crisp, ct+0.0008);
    c2g.gain.exponentialRampToValueAtTime(.0006, ct+0.016);
    c2.connect(hp2); hp2.connect(c2g); c2g.connect(master);
    c2.start(ct); c2.stop(ct+0.05);
  }

  // --- 2) BODY: szeroki szum (lowpass opadający) — mięsny korpus wystrzału ---
  const body = AC.createBufferSource(); body.buffer = NOISE;
  const bf = AC.createBiquadFilter();
  bf.type='lowpass';
  bf.frequency.setValueAtTime((suppressed? 900 : P.bodyHz)*jit, t+dly);
  bf.frequency.exponentialRampToValueAtTime(suppressed? 260 : 420, t+dly+Math.max(0.06, P.bodyDec*0.9));
  bf.Q.value = 0.7;
  const bodyG = AC.createGain();
  const bodyPk = suppressed? .18 : P.bodyPk;
  const bodyDec = suppressed? .10 : P.bodyDec;
  bodyG.gain.setValueAtTime(bodyPk, t+dly);
  bodyG.gain.exponentialRampToValueAtTime(.001, t+dly+bodyDec);
  body.connect(bf); bf.connect(bodyG); bodyG.connect(master);
  body.start(t+dly); body.stop(t+dly+bodyDec+0.2);

  // --- 2b) DRUGA WARSTWA KORPUSU: bandpass w środku pasma — dodaje „chrupu"/gęstości ---
  // Inna częstotliwość niż lowpass body → brzmienie mniej „plastikowe", bardziej złożone.
  if(!suppressed){
    const body2 = AC.createBufferSource(); body2.buffer = NOISE;
    body2.playbackRate.value = rnd(0.9, 1.1);
    const bpf = AC.createBiquadFilter();
    bpf.type='bandpass';
    bpf.frequency.setValueAtTime((P.bodyHz*0.42)*jit, t+dly);
    bpf.frequency.exponentialRampToValueAtTime(600, t+dly+P.bodyDec*0.8);
    bpf.Q.value = 1.1;
    const b2g = AC.createGain();
    b2g.gain.setValueAtTime(bodyPk*0.45, t+dly);
    b2g.gain.exponentialRampToValueAtTime(.001, t+dly+P.bodyDec*0.85);
    body2.connect(bpf); bpf.connect(b2g); b2g.connect(master);
    body2.start(t+dly); body2.stop(t+dly+P.bodyDec+0.15);
  }

  // --- 3) LOW-END THUMP: opadający oscylator, głębszy dla ciężkich broni ---
  const thump = AC.createOscillator(); thump.type='sine';
  const startHz = (suppressed? P.thStart*0.8 : P.thStart) * jit;
  const endHz   = P.thEnd;
  thump.frequency.setValueAtTime(startHz, t);
  thump.frequency.exponentialRampToValueAtTime(endHz, t+P.thDec*0.85);
  const thumpG = AC.createGain();
  const thumpPk = suppressed? (P.thPk*0.4) : P.thPk;
  thumpG.gain.setValueAtTime(.0001, t);
  thumpG.gain.exponentialRampToValueAtTime(thumpPk, t+0.006);
  thumpG.gain.exponentialRampToValueAtTime(.001, t+P.thDec);
  thump.connect(thumpG); thumpG.connect(master);
  thump.start(t); thump.stop(t+P.thDec+0.15);

  // --- 3b) TAIL / ECHO: rezonansowy szum lowpass o długim zaniku — echo dużego kalibru ---
  // Tylko dla broni z tail>0 (dmr/shotgun/lmg/revolver). Lekki predelay = odbicie od otoczenia.
  if(!suppressed && P.tail > 0){
    const tt = t + rnd(0.02, 0.045);
    const tail = AC.createBufferSource(); tail.buffer = NOISE;
    tail.playbackRate.value = rnd(0.55, 0.8);
    const tf = AC.createBiquadFilter(); tf.type='lowpass';
    tf.frequency.setValueAtTime(900*jit, tt);
    tf.frequency.exponentialRampToValueAtTime(180, tt+0.4);
    tf.Q.value = 1.3;
    const tg = AC.createGain();
    tg.gain.setValueAtTime(.0001, tt);
    tg.gain.exponentialRampToValueAtTime(0.32*P.tail, tt+0.03);
    tg.gain.exponentialRampToValueAtTime(.001, tt+0.35 + P.tail*0.25);
    tail.connect(tf); tf.connect(tg); tg.connect(master);
    tail.start(tt); tail.stop(tt+0.75);
  }

  // --- 4) MECHANIZM: metaliczny klik zamka (square), lekko zrandomizowany ---
  const clackT = t + rnd(0.006, 0.014);
  const c = AC.createOscillator(); c.type='square';
  c.frequency.setValueAtTime(2100*jit, clackT);
  c.frequency.exponentialRampToValueAtTime(1500*jit, clackT+0.03);
  const cg = AC.createGain();
  cg.gain.setValueAtTime(suppressed? P.mech*0.6 : P.mech, clackT);
  cg.gain.exponentialRampToValueAtTime(.001, clackT+0.03);
  c.connect(cg); cg.connect(master); c.start(clackT); c.stop(clackT+0.05);
}

export function sfxHit(bull=false){
  const t=AC.currentTime;
  const jit = 0.97 + Math.random()*0.06;
  // ton potwierdzenia trafienia
  const o=AC.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime((bull? 1300: 880)*jit, t);
  o.frequency.exponentialRampToValueAtTime((bull? 1800:1100)*jit, t+.07);
  const g=AC.createGain(); g.gain.setValueAtTime(.3,t); g.gain.exponentialRampToValueAtTime(.001,t+.22);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+.25);
  // drugi ton (kwinta wyżej) — bogatszy, mniej „piezo"/plastikowy tembr
  const o2=AC.createOscillator(); o2.type='triangle';
  o2.frequency.setValueAtTime((bull? 1950:1320)*jit, t);
  const g2=AC.createGain(); g2.gain.setValueAtTime(.12,t); g2.gain.exponentialRampToValueAtTime(.001,t+.14);
  o2.connect(g2); g2.connect(master); o2.start(t); o2.stop(t+.16);
  // krótki transient szumu dla „ciała" uderzenia
  const n=AC.createBufferSource(); n.buffer=NOISE;
  const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=(bull?2600:1800)*jit; nf.Q.value=1.2;
  const ng=AC.createGain(); ng.gain.setValueAtTime(bull?.22:.16,t); ng.gain.exponentialRampToValueAtTime(.001,t+.05);
  n.connect(nf); nf.connect(ng); ng.connect(master); n.start(t); n.stop(t+.08);
}
export function sfxClick(freq=1400, vol=.12){
  const t=AC.currentTime;
  const o=AC.createOscillator(); o.type='triangle'; o.frequency.value=freq;
  const g=AC.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+.06);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+.08);
}

/* Metaliczny „clack" (część mechaniczna) — ton square z opadem + wysoki szum zazębienia.
   Używane w przeładowaniu (przeciąganie zamka). */
function metalClack(freq=1150, vol=.16, bright=2200){
  const t=AC.currentTime;
  const o=AC.createOscillator(); o.type='square';
  o.frequency.setValueAtTime(freq,t);
  o.frequency.exponentialRampToValueAtTime(freq*0.7,t+.04);
  const g=AC.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+.05);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+.07);
  const n=AC.createBufferSource(); n.buffer=NOISE;
  const nf=AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=bright;
  const ng=AC.createGain(); ng.gain.setValueAtTime(vol*0.6,t); ng.gain.exponentialRampToValueAtTime(.001,t+.03);
  n.connect(nf); nf.connect(ng); ng.connect(master); n.start(t); n.stop(t+.05);
}

/* Ruch magazynka: `out=true` → wysunięcie (niski, opadający „clunk");
   `out=false` → wsunięcie nowego (pełniejszy, narastający „clack" + osadzenie/thunk). */
function magSlide(out){
  const t=AC.currentTime;
  const o=AC.createOscillator(); o.type='triangle';
  const f0 = out? 340 : 300, f1 = out? 200 : 480;
  o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(f1,t+.10);
  const g=AC.createGain();
  g.gain.setValueAtTime(out?.10:.14,t);
  g.gain.exponentialRampToValueAtTime(.001,t+(out?.11:.14));
  o.connect(g); g.connect(master); o.start(t); o.stop(t+.18);
  // szum tarcia/prowadnicy magazynka
  const n=AC.createBufferSource(); n.buffer=NOISE;
  const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value= out?900:1500; nf.Q.value=.8;
  const ng=AC.createGain(); ng.gain.setValueAtTime(out?.08:.12,t); ng.gain.exponentialRampToValueAtTime(.001,t+(out?.09:.07));
  n.connect(nf); nf.connect(ng); ng.connect(master); n.start(t); n.stop(t+.14);
  // wsunięcie: krótki niski „thunk" osadzenia magazynka na końcu
  if(!out){
    const th=AC.createOscillator(); th.type='sine';
    th.frequency.setValueAtTime(160,t+.09);
    th.frequency.exponentialRampToValueAtTime(70,t+.17);
    const tg=AC.createGain();
    tg.gain.setValueAtTime(.0001,t+.09);
    tg.gain.exponentialRampToValueAtTime(.18,t+.10);
    tg.gain.exponentialRampToValueAtTime(.001,t+.19);
    th.connect(tg); tg.connect(master); th.start(t+.09); th.stop(t+.24);
  }
}

export function sfxReload(){
  const j=()=> 0.95 + Math.random()*0.1;   // lekka randomizacja timingu/tonu
  // 1) wysunięcie zużytego magazynka — niski, krótki „clunk"
  magSlide(true);
  // 2) wsunięcie nowego magazynka — pełniejszy „clack" z osadzeniem
  setTimeout(()=>magSlide(false), 300 + Math.random()*40);
  // 3) przeładowanie zamka — jasny, podwójny metaliczny klik
  setTimeout(()=>metalClack(1150*j(), .18, 2200), 560 + Math.random()*50);
  setTimeout(()=>metalClack(1350*j(), .13, 2600), 660 + Math.random()*40);
}
export function sfxAttach(){
  const t=AC.currentTime;
  const o=AC.createOscillator(); o.type='square'; o.frequency.setValueAtTime(300,t);
  o.frequency.exponentialRampToValueAtTime(900,t+.09);
  const g=AC.createGain(); g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+.14);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+.15);
  setTimeout(()=>sfxClick(1600,.1),90);
}
export function sfxEmpty(){
  // głuchy podwójny klik „pustego" spustu
  sfxClick(300,.15);
  setTimeout(()=>sfxClick(230,.10), 55);
}

/* ------------------------------------------------------------
   AMBIENCE (opcjonalne, opt-in): bardzo cichy, zapętlony szum wentylacji.
   NIE startuje samo — moduł, który zechce tła, woła startAmbience() po geście
   użytkownika i dostaje uchwyt ze stop(). Izolowane, nie dotyka reszty audio.
------------------------------------------------------------ */
export function startAmbience(level=0.05){
  const src = AC.createBufferSource(); src.buffer = NOISE; src.loop = true;
  // niski szum + delikatne „bicie" filtra imitujące wentylację
  const lp = AC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
  const hum = AC.createOscillator(); hum.type='sine'; hum.frequency.value = 60; // przydźwięk sieci
  const humG = AC.createGain(); humG.gain.value = level*0.25;
  const g = AC.createGain(); g.gain.value = 0; // fade-in
  // wolna modulacja jasności (LFO na częstotliwości filtra)
  const lfo = AC.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.08;
  const lfoG = AC.createGain(); lfoG.gain.value = 80;
  lfo.connect(lfoG); lfoG.connect(lp.frequency);
  src.connect(lp); lp.connect(g);
  hum.connect(humG); humG.connect(g);
  g.connect(master);
  const t = AC.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t+1.5);   // łagodne wejście
  src.start(t); hum.start(t); lfo.start(t);
  return { stop(){
    const n = AC.currentTime;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(g.gain.value, n);
    g.gain.exponentialRampToValueAtTime(0.0001, n+0.8);
    src.stop(n+0.9); hum.stop(n+0.9); lfo.stop(n+0.9);
  }};
}

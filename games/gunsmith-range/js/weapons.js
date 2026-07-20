import * as THREE from 'three';

/* ============================================================
   BRONIE + DODATKI (definicje i budowa modeli z prymitywów)
============================================================ */
export const M = {
  body:   new THREE.MeshStandardMaterial({color:0x2e3338, roughness:.45, metalness:.65}),
  body2:  new THREE.MeshStandardMaterial({color:0x22262a, roughness:.5, metalness:.6}),
  accent: new THREE.MeshStandardMaterial({color:0x4a5560, roughness:.35, metalness:.8}),
  wood:   new THREE.MeshStandardMaterial({color:0x5a4028, roughness:.7}),
  gold:   new THREE.MeshStandardMaterial({color:0xb8923a, roughness:.3, metalness:.9}),
  glass:  new THREE.MeshStandardMaterial({color:0x3399ff, roughness:.1, metalness:.3, emissive:0x1155aa, emissiveIntensity:.7}),
  redlens:new THREE.MeshStandardMaterial({color:0xff3333, emissive:0xaa0000, emissiveIntensity:1}),
  rubber: new THREE.MeshStandardMaterial({color:0x1a1c1e, roughness:.95}),
  // ton skóry dłoni (Part B): rozjaśniony (0xe6a06a) + lekki emissive, by dłonie NIE
  // ginęły wizualnie na tle ciemnej broni (0x2e3338) w cieniu — nigdy nie schodzą do czerni.
  skin:   new THREE.MeshStandardMaterial({color:0xe6a06a, roughness:.6, emissive:0x4a2e1a, emissiveIntensity:.35}),
};
export function bx(w,h,d,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz); m.castShadow=true;
  return m;
}
export function cyl(r1,r2,h,mat,x=0,y=0,z=0,rx=Math.PI/2){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,14), mat);
  m.position.set(x,y,z); m.rotation.x=rx; m.castShadow=true;
  return m;
}

/* Broń buduje się wzdłuż -Z (lufa w -Z). muzzle = z końcówki lufy.
   ── PRZYBLIŻENIE "GÓRNEJ ŚCIANY" DLA OBRÓCONYCH BOXÓW (Part A, użyte wszędzie) ──
   Box obrócony o kąt θ wokół osi X ma środek GÓRNEJ ściany na
   y = position.y + cos(θ)*height/2  (obrót wokół środka boxa: lokalny punkt
   (0,h/2,0) → world Δy = cos(θ)*h/2).  Aby górna ściana dotknęła kotwicy Ay:
   position.y = Ay − cos(θ)*height/2.  Dla θ=0 upraszcza się do  Ay − height/2.
   Analogicznie DOLNA ściana boxa jest na y = position.y − cos(θ)*height/2.
   magPos  = punkt, w którym GÓRNA ściana magazynka ma dotknąć SPODU korpusu.
   gripPos = punkt, w którym GÓRNA ściana chwytu przedniego ma dotknąć SPODU łoża. */
export const WEAPONS = {
  rifle: {
    name:'RIFLE "WOLF"', mode:'AUTO',
    stats:{ damage:34, rpm:600, mag:30, spread:.012, recoil:.028, adsZoom:1.35, reload:1.7, range:80 },
    build(g){
      g.add(bx(.09,.11,.62,M.body,0,0,-.1));                 // korpus
      g.add(bx(.07,.07,.34,M.body2,0,.005,-.55));            // przód / łoże
      g.add(cyl(.021,.021,.3,M.accent,0,.01,-.82));          // lufa
      g.add(bx(.06,.16,.1,M.body2,0,-.13,.02,.12));          // chwyt pistoletowy
      g.add(bx(.05,.2,.3,M.body,0,-.05,.32,-.06));           // kolba
      g.add(bx(.02,.05,.4,M.accent,0,.075,-.25));            // szyna górna
      // korpus bx(.09,.11,...,y=0): spód = 0−.11/2 = −.055 → magPos.y. mag h=.14, θ=.22: y=−.055−cos(.22)*.07=−.1233
      const mag=bx(.035,.14,.07,M.body2,0,-.1233,-.14,.22); mag.userData.isMag=true; g.add(mag); // magazynek bazowy (górna ściana styka −.055)
      g.add(bx(.015,.03,.03,M.accent,0,.1,-.68));            // muszka
    },
    // gripPos.y: przód/łoże bx(.07,.07,...,y=.005) spód = .005−.035 = −.03 przy z=−.5
    muzzleZ:-.97, magPos:[0,-.055,-.14], scopePos:[0,.13,-.2], gripPos:[0,-.03,-.5],
    triggerGripPos:[0,-.13,.02], triggerGripRot:[.12,0,0],   // z chwytu bx(.06,.16,.1,...,0,-.13,.02,.12)
    vm:{ pos:[.26,-.24,-.5], rot:[0,0,0] },
  },
  pistol: {
    name:'PISTOL "VIPER"', mode:'SEMI',
    stats:{ damage:45, rpm:320, mag:12, spread:.008, recoil:.045, adsZoom:1.2, reload:1.2, range:45 },
    build(g){
      g.add(bx(.07,.09,.34,M.body,0,.02,-.06));              // zamek
      g.add(bx(.065,.05,.3,M.accent,0,-.035,-.05));          // szkielet
      g.add(cyl(.016,.016,.1,M.accent,0,.03,-.27));
      g.add(bx(.06,.17,.09,M.body2,0,-.12,.06,.18));         // chwyt
      // chwyt bx(.06,.17,...,y=-.12,θ=.18): spód = −.12−cos(.18)*.085 = −.2036 → magPos.y. stopka h=.03: y=−.2036−cos(.18)*.015=−.2184
      const mag=bx(.055,.03,.075,M.accent,0,-.2184,.05,.18); mag.userData.isMag=true; g.add(mag); // magazynek (stopka) bazowy (górna ściana styka −.2036)
      g.add(bx(.012,.025,.02,M.accent,0,.08,-.2));           // muszka
      g.add(bx(.03,.04,.05,M.gold,0,.02,.1));                // kurek ozdobny
    },
    // gripPos.y: szkielet bx(.065,.05,...,y=-.035) spód = −.035−.025 = −.06 przy z=−.16
    muzzleZ:-.33, magPos:[0,-.2036,.05], scopePos:[0,.09,-.02], gripPos:[0,-.06,-.16], oneHanded:true,
    triggerGripPos:[0,-.12,.06], triggerGripRot:[.18,0,0],   // z chwytu bx(.06,.17,.09,...,0,-.12,.06,.18)
    vm:{ pos:[.24,-.26,-.45], rot:[0,0,0] },
  },
  smg: {
    name:'SMG "HORNET"', mode:'AUTO',
    stats:{ damage:22, rpm:900, mag:25, spread:.022, recoil:.02, adsZoom:1.25, reload:1.4, range:40 },
    build(g){
      g.add(bx(.08,.1,.44,M.body2,0,0,-.05));
      g.add(cyl(.028,.028,.26,M.body,0,.01,-.38));           // gruba osłona lufy
      g.add(cyl(.016,.016,.1,M.accent,0,.01,-.55));
      g.add(bx(.055,.15,.09,M.rubber,0,-.12,.05,.15));
      g.add(bx(.04,.04,.22,M.accent,0,-.02,.28));            // kolba druciak
      // korpus bx(.08,.1,...,y=0): spód = 0−.05 = −.05 → magPos.y. mag h=.1, θ=.1: y=−.05−cos(.1)*.05=−.09975
      const mag=bx(.04,.1,.05,M.body,0,-.09975,-.1,.1); mag.userData.isMag=true; g.add(mag); // mag bazowy (górna ściana styka −.05)
      g.add(bx(.02,.04,.3,M.accent,0,.07,-.15));             // szyna
    },
    // gripPos.y: osłona lufy cyl(r=.028,y=.01) spód = .01−.028 = −.018 przy z=−.32
    muzzleZ:-.6, magPos:[0,-.05,-.1], scopePos:[0,.11,-.1], gripPos:[0,-.018,-.32],
    triggerGripPos:[0,-.12,.05], triggerGripRot:[.15,0,0],   // z chwytu bx(.055,.15,.09,...,0,-.12,.05,.15)
    vm:{ pos:[.25,-.25,-.42], rot:[0,0,0] },
  },
  dmr: {
    name:'DMR "RAVEN"', mode:'SEMI',
    stats:{ damage:85, rpm:110, mag:6, spread:.004, recoil:.07, adsZoom:1.5, reload:2.2, range:200 },
    build(g){
      g.add(bx(.08,.1,.6,M.wood,0,0,.05));                   // łoże drewniane
      g.add(bx(.075,.095,.35,M.body,0,.02,-.3));
      g.add(cyl(.019,.019,.55,M.accent,0,.02,-.72));         // długa lufa
      g.add(bx(.05,.19,.28,M.wood,0,-.06,.34,-.08));         // kolba
      g.add(bx(.06,.14,.09,M.wood,0,-.13,.08,.15));
      g.add(cyl(.025,.025,.06,M.body2,0,.02,-.99));          // korona lufy
      g.add(bx(.02,.04,.3,M.accent,0,.085,-.25));            // szyna
      // łoże drewniane bx(.08,.1,...,y=0) pokrywa z=−.08: spód = 0−.05 = −.05 → magPos.y. mag h=.1, θ=.2: y=−.05−cos(.2)*.05=−.099
      const mag=bx(.03,.1,.06,M.body2,0,-.099,-.08,.2); mag.userData.isMag=true; g.add(mag); // mag bazowy (górna ściana styka −.05)
    },
    // gripPos: przeniesiony z gołej lufy (r=.019) na SPÓD receivera bx(.075,.095,...,y=.02,z=−.3):
    // spód = .02−.095/2 = −.0275; z=−.3 leży w bryle receivera (z∈[−.475,−.125]). Solidna
    // powierzchnia do chwytu wspierającej dłoni zamiast cienkiego cylindra lufy.
    muzzleZ:-1.02, magPos:[0,-.05,-.08], scopePos:[0,.14,-.2], gripPos:[0,-.0275,-.3],
    triggerGripPos:[0,-.13,.08], triggerGripRot:[.15,0,0],   // z chwytu bx(.06,.14,.09,...,0,-.13,.08,.15)
    vm:{ pos:[.26,-.25,-.55], rot:[0,0,0] },
  },
  shotgun: {
    name:'SHOTGUN "BOAR"', mode:'PUMP',
    stats:{ damage:108, rpm:70, mag:6, spread:.06, recoil:.08, adsZoom:1.1, reload:2.4, range:18 },
    build(g){
      g.add(bx(.11,.12,.5,M.body,0,0,-.05));                 // szeroki korpus
      g.add(cyl(.03,.03,.34,M.body2,0,.03,-.5));             // krótka gruba lufa
      g.add(cyl(.024,.024,.4,M.accent,0,-.045,-.44));        // rura magazynka pod lufą
      g.add(bx(.085,.09,.17,M.wood,0,-.055,-.32));           // pompka (przedni chwyt)
      g.add(bx(.06,.16,.1,M.body2,0,-.13,.06,.14));          // chwyt pistoletowy
      g.add(bx(.05,.18,.26,M.wood,0,-.03,.29,-.05));         // kolba drewniana
      // korpus bx(.11,.12,...,y=0): spód = 0−.06 = −.06 → magPos.y. mag h=.11, θ=.18: y=−.06−cos(.18)*.055=−.1141
      const mag=bx(.05,.11,.09,M.body2,0,-.1141,-.12,.18); mag.userData.isMag=true; g.add(mag); // magazynek bazowy (kotwica, górna ściana styka −.06)
      g.add(bx(.015,.03,.03,M.accent,0,.09,-.6));            // muszka
    },
    // gripPos: przeniesiony z cienkiej rury magazynka (r=.024) na SPÓD drewnianej pompki
    // bx(.085,.09,.17,M.wood,0,-.055,-.32) — to WŁAŚNIWY przedni chwyt strzelby. Spód = −.055−.09/2
    // = −.10; z=−.32 = środek pompki (z∈[−.405,−.235]). Solidne łoże zamiast cienkiego cylindra.
    muzzleZ:-.7, magPos:[0,-.06,-.12], scopePos:[0,.11,-.15], gripPos:[0,-.10,-.32],
    triggerGripPos:[0,-.13,.06], triggerGripRot:[.14,0,0],   // z chwytu bx(.06,.16,.1,...,0,-.13,.06,.14)
    vm:{ pos:[.26,-.26,-.48], rot:[0,0,0] },
  },
  lmg: {
    name:'LMG "WOLVERINE"', mode:'AUTO',
    stats:{ damage:26, rpm:750, mag:75, spread:.03, recoil:.045, adsZoom:1.3, reload:3.2, range:70 },
    build(g){
      g.add(bx(.1,.12,.66,M.body,0,0,-.05));                 // masywny korpus
      g.add(cyl(.035,.035,.4,M.body2,0,.01,-.5));            // gruby kożuch lufy
      g.add(cyl(.02,.02,.3,M.accent,0,.01,-.78));            // lufa
      g.add(bx(.06,.17,.11,M.body2,0,-.13,.06,.15));         // chwyt pistoletowy
      g.add(bx(.05,.2,.3,M.body,0,-.04,.34,-.06));           // kolba
      g.add(bx(.02,.05,.44,M.accent,0,.085,-.2));            // długa szyna górna
      // korpus bx(.1,.12,...,y=0): spód = 0−.06 = −.06 → magPos.y. skrzynka h=.16, θ=0: y=−.06−.16/2=−.14
      const mag=bx(.13,.16,.16,M.body2,0,-.14,-.02); mag.userData.isMag=true; g.add(mag); // skrzynka amunicyjna (kotwica mag, górna ściana styka −.06)
      g.add(cyl(.008,.008,.22,M.accent,-.055,-.16,-.6,0));   // noga bipodu L
      g.add(cyl(.008,.008,.22,M.accent,.055,-.16,-.6,0));    // noga bipodu R
      g.add(bx(.015,.03,.03,M.accent,0,.115,-.66));          // muszka
    },
    // gripPos.y: przy z=−.5 najniższym elementem jest kożuch lufy cyl(r=.035,y=.01) spód = .01−.035 = −.025
    muzzleZ:-.95, magPos:[0,-.06,-.02], scopePos:[0,.12,-.2], gripPos:[0,-.025,-.5],
    triggerGripPos:[0,-.13,.06], triggerGripRot:[.15,0,0],   // z chwytu bx(.06,.17,.11,...,0,-.13,.06,.15)
    vm:{ pos:[.27,-.26,-.52], rot:[0,0,0] },
  },
  bullpup: {
    name:'CARBINE "WASP"', mode:'BURST', purchasable:true, price:200,
    stats:{ damage:30, rpm:780, mag:21, spread:.01, recoil:.03, adsZoom:1.4, reload:1.6, range:75 },
    build(g){
      g.add(bx(.09,.11,.56,M.body,0,0,-.05));                // korpus (bullpup: długi receiver)
      g.add(bx(.07,.07,.3,M.body2,0,.005,-.5));              // przód / łoże
      g.add(cyl(.02,.02,.28,M.accent,0,.01,-.78));           // lufa
      g.add(bx(.06,.16,.1,M.body2,0,-.13,.06,.12));          // chwyt pistoletowy (przed magazynkiem)
      g.add(bx(.05,.11,.2,M.body,0,-.01,.28));               // stopka / trzewik (bullpup: receiver do tyłu)
      g.add(bx(.02,.05,.36,M.accent,0,.075,-.2));            // szyna górna z uchwytem do przenoszenia
      // korpus bx(.09,.11,...,y=0): spód = 0−.055 = −.055 → magPos.y. mag h=.14, θ=.18, z=.12 (za chwytem):
      // y = −.055 − cos(.18)*.07 = −.055 − .06887 = −.1239
      const mag=bx(.035,.14,.07,M.body2,0,-.1239,.12,.18); mag.userData.isMag=true; g.add(mag); // magazynek bazowy (górna ściana styka −.055)
      g.add(bx(.015,.03,.03,M.accent,0,.1,-.62));            // muszka
    },
    // gripPos.y: przód/łoże bx(.07,.07,...,y=.005) spód = .005−.035 = −.03 przy z=−.5
    muzzleZ:-.92, magPos:[0,-.055,.12], scopePos:[0,.11,-.15], gripPos:[0,-.03,-.5],
    triggerGripPos:[0,-.13,.06], triggerGripRot:[.12,0,0],   // z chwytu bx(.06,.16,.1,...,0,-.13,.06,.12)
    vm:{ pos:[.26,-.24,-.5], rot:[0,0,0] },
  },
  revolver: {
    name:'REVOLVER "THUNDER"', mode:'SEMI', purchasable:true, price:350,
    stats:{ damage:100, rpm:150, mag:6, spread:.005, recoil:.075, adsZoom:1.25, reload:2.6, range:60 },
    build(g){
      g.add(bx(.05,.06,.28,M.body,0,.02,-.05));              // szkielet górny
      g.add(cyl(.018,.018,.24,M.accent,0,.03,-.24));         // długa lufa
      g.add(bx(.03,.03,.2,M.body2,0,.005,-.22));             // podlufie
      g.add(cyl(.045,.045,.09,M.gold,0,-.005,-.02));         // bęben (bez isMag — reload czysto wizualny)
      g.add(bx(.055,.15,.08,M.wood,0,-.11,.06,.22));         // chwyt drewniany
      g.add(bx(.025,.04,.03,M.accent,0,.06,.07));            // kurek
      g.add(bx(.01,.025,.02,M.accent,0,.06,-.34));           // muszka
    },
    // gripPos.y: podlufie bx(.03,.03,...,y=.005) spód = .005−.015 = −.01 przy z=−.22
    // magPos zdefiniowany dla bezpieczeństwa (gdyby wybrano mag z build) — pod bębnem: spód .-.005−.045=−.05
    muzzleZ:-.36, magPos:[0,-.05,-.02], scopePos:[0,.06,-.1], gripPos:[0,-.01,-.22], oneHanded:true,
    triggerGripPos:[0,-.11,.06], triggerGripRot:[.22,0,0],   // z chwytu bx(.055,.15,.08,...,0,-.11,.06,.22)
    vm:{ pos:[.24,-.26,-.44], rot:[0,0,0] },
  },
};

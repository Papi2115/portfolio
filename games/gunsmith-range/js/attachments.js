import * as THREE from 'three';
import { M, bx, cyl, WEAPONS } from './weapons.js';

export const ATTACH = {
  scope: {
    label:'SIGHT',
    none:  { label:'Iron Sights', mod:{} },
    reddot:{ label:'Red Dot', price:40, mod:{ spread:-.15, adsZoom:.25 },
      build(g,p){
        g.add(bx(.05,.02,.1,M.body2,p[0],p[1],p[2]));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.035,.008,8,20), M.body);
        ring.position.set(p[0],p[1]+.05,p[2]); g.add(ring);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.007,8,8), M.redlens);
        dot.position.set(p[0],p[1]+.05,p[2]); g.add(dot);
      }},
    sniper:{ label:'4x Scope', price:140, mod:{ spread:-.4, adsZoom:2.2, scopeOverlay:true },
      build(g,p){
        g.add(bx(.04,.03,.08,M.body2,p[0],p[1],p[2]+.08));
        g.add(bx(.04,.03,.08,M.body2,p[0],p[1],p[2]-.08));
        g.add(cyl(.03,.03,.22,M.body,p[0],p[1]+.05,p[2]));
        g.add(cyl(.038,.03,.04,M.body,p[0],p[1]+.05,p[2]-.12));
        const lens = new THREE.Mesh(new THREE.CircleGeometry(.026,16), M.glass);
        lens.position.set(p[0],p[1]+.05,p[2]-.141); lens.rotation.y=Math.PI; g.add(lens);
      }},
    holo:  { label:'Holographic', price:60, mod:{ spread:-.22, adsZoom:.6 },
      build(g,p){
        g.add(bx(.055,.02,.09,M.body2,p[0],p[1],p[2]));            // podstawa
        g.add(bx(.06,.05,.015,M.body,p[0],p[1]+.04,p[2]+.045));    // tylna ścianka (wyświetlacz)
        g.add(bx(.06,.05,.012,M.accent,p[0],p[1]+.04,p[2]-.045));  // przednia ramka
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(.05,.045), M.glass);
        glass.position.set(p[0],p[1]+.04,p[2]-.043); glass.rotation.y=Math.PI; g.add(glass);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.006,8,8), M.redlens);
        dot.position.set(p[0],p[1]+.04,p[2]-.04); g.add(dot);
      }},
    acog:  { label:'2x Sight', price:90, mod:{ spread:-.3, adsZoom:1.0, scopeOverlay:true },
      build(g,p){
        g.add(bx(.04,.03,.07,M.body2,p[0],p[1],p[2]+.06));
        g.add(bx(.04,.03,.07,M.body2,p[0],p[1],p[2]-.06));
        g.add(cyl(.028,.028,.16,M.body,p[0],p[1]+.045,p[2]));
        g.add(cyl(.034,.028,.03,M.body,p[0],p[1]+.045,p[2]-.09));
        const lens = new THREE.Mesh(new THREE.CircleGeometry(.024,16), M.glass);
        lens.position.set(p[0],p[1]+.045,p[2]-.106); lens.rotation.y=Math.PI; g.add(lens);
      }},
  },
  mag: {
    label:'MAGAZINE',
    none: { label:'Standard', mod:{} },
    ext:  { label:'Extended', price:80, mod:{ mag:.6, reload:.15 },
      // p[1]=magPos.y = punkt styku GÓRNEJ ściany. a: h=.2,θ=.25 → a.y=p[1]−cos(.25)*.1=p[1]−.0969.
      // b (stopka) flush pod a: b.y=a.y−cos(.25)*(.1+.015)=p[1]−.2083.
      build(g,p){ const a=bx(.04,.2,.08,M.body2,p[0],p[1]-.0969,p[2],.25); a.userData.isMag=true; g.add(a); const b=bx(.045,.03,.085,M.gold,p[0],p[1]-.2083,p[2],.25); b.userData.isMag=true; g.add(b); }},
    fast: { label:'Fast', price:50, mod:{ reload:-.35 },
      // a: h=.12,θ=.22 → a.y=p[1]−cos(.22)*.06=p[1]−.0586. b (stopka) flush: b.y=a.y−cos(.22)*(.06+.01)=p[1]−.1269.
      build(g,p){ const a=bx(.05,.12,.07,M.accent,p[0],p[1]-.0586,p[2],.22); a.userData.isMag=true; g.add(a); const b=bx(.055,.02,.075,M.redlens,p[0],p[1]-.1269,p[2],.22); b.userData.isMag=true; g.add(b); }},
    drum: { label:'Drum', price:110, mod:{ mag:1.4, reload:.25, spread:.12, recoil:.1 },
      // p[1]=magPos.y = styk GÓRNEJ ściany. Szyjka (θ=0, h=.06): a.y=p[1]−.03, górna ściana=p[1]. Spód szyjki=p[1]−.06.
      // Bęben cyl(r=.09, oś wzdłuż Z): pion. zasięg ±.09 → środek d.y=p[1]−.06−.09=p[1]−.15, góra bębna=p[1]−.06 (styk ze spodem szyjki).
      build(g,p){ const a=bx(.045,.06,.08,M.body2,p[0],p[1]-.03,p[2]); a.userData.isMag=true; g.add(a); const d=cyl(.09,.09,.05,M.body,p[0],p[1]-.15,p[2]); d.userData.isMag=true; g.add(d); }},
  },
  grip: {
    label:'GRIP',
    none:  { label:'None', mod:{} },
    vert:  { label:'Vertical', price:55, mod:{ recoil:-.3 },
      // p[1]=gripPos.y = styk GÓRNEJ ściany chwytu. h=.12,θ=.1 → y=p[1]−cos(.1)*.06=p[1]−.0597.
      build(g,p){ g.add(bx(.035,.12,.05,M.rubber,p[0],p[1]-.0597,p[2],.1)); }},
    angled:{ label:'Angled', price:45, mod:{ recoil:-.15, spread:-.12 },
      // h=.09,θ=.6 → y=p[1]−cos(.6)*.045=p[1]−.0371.
      build(g,p){ g.add(bx(.035,.09,.09,M.rubber,p[0],p[1]-.0371,p[2],.6)); }},
    stubby:{ label:'Stubby', price:30, mod:{ spread:-.1, recoil:-.05 },
      // h=.07,θ=.1 → y=p[1]−cos(.1)*.035=p[1]−.0348.
      build(g,p){ g.add(bx(.035,.07,.05,M.rubber,p[0],p[1]-.0348,p[2],.1)); }},
    bipod: { label:'Bipod', price:70, mod:{ recoil:-.4, adsZoom:-.05 },
      // mocowanie θ=0,h=.03 → y=p[1]−.015. Nogi (cyl oś Y, rx=0) rozłożone ±.05, h=.16, środek p[1]−.10.
      build(g,p){ g.add(bx(.04,.03,.05,M.body2,p[0],p[1]-.015,p[2])); g.add(cyl(.006,.006,.16,M.accent,p[0]-.05,p[1]-.10,p[2],0)); g.add(cyl(.006,.006,.16,M.accent,p[0]+.05,p[1]-.10,p[2],0)); }},
  },
  muzzle: {
    label:'MUZZLE',
    none:   { label:'None', mod:{} },
    supp:   { label:'Suppressor', price:90, mod:{ suppressed:true, damage:-.06, spread:-.08 },
      build(g,p,w){ g.add(cyl(.032,.032,.2,M.rubber,0,w==='pistol'?.03:(w==='dmr'?.02:.01),WEAPONS[w].muzzleZ-.08)); }},
    brake:  { label:'Muzzle Brake', price:55, mod:{ recoil:-.25 },
      build(g,p,w){
        const y = w==='pistol'?.03:(w==='dmr'?.02:.01);
        g.add(cyl(.026,.026,.09,M.accent,0,y,WEAPONS[w].muzzleZ-.03));
        g.add(bx(.07,.02,.03,M.accent,0,y,WEAPONS[w].muzzleZ-.03));
      }},
    flash:  { label:'Flash Hider', price:35, mod:{ spread:-.05, recoil:-.05 },
      build(g,p,w){ const y = w==='pistol'||w==='revolver'?.03:(w==='dmr'?.02:.01);
        g.add(cyl(.024,.028,.08,M.body,0,y,WEAPONS[w].muzzleZ-.03)); }},
    heavy:  { label:'Compensator', price:75, mod:{ recoil:-.35, adsZoom:-.08 },
      build(g,p,w){ const y = w==='pistol'||w==='revolver'?.03:(w==='dmr'?.02:.01); const z = WEAPONS[w].muzzleZ-.04;
        g.add(cyl(.03,.03,.12,M.body2,0,y,z));
        g.add(bx(.09,.025,.04,M.accent,0,y+.02,z));
        g.add(bx(.09,.025,.04,M.accent,0,y-.02,z)); }},
  },
};
export const SLOT_ORDER = ['scope','mag','grip','muzzle'];

// stan gracza: per broń wybrane dodatki
export const loadout = {
  rifle:  { scope:'none', mag:'none', grip:'none', muzzle:'none' },
  pistol: { scope:'none', mag:'none', grip:'none', muzzle:'none' },
  smg:    { scope:'none', mag:'none', grip:'none', muzzle:'none' },
  dmr:    { scope:'none', mag:'none', grip:'none', muzzle:'none' },
  shotgun:{ scope:'none', mag:'none', grip:'none', muzzle:'none' },
  lmg:    { scope:'none', mag:'none', grip:'none', muzzle:'none' },
  bullpup:{ scope:'none', mag:'none', grip:'none', muzzle:'none' },
  revolver:{ scope:'none', mag:'none', grip:'none', muzzle:'none' },
};

export function effectiveStats(wid){
  const base = {...WEAPONS[wid].stats, suppressed:false, scopeOverlay:false};
  for(const slot of SLOT_ORDER){
    const mod = ATTACH[slot][loadout[wid][slot]].mod;
    for(const k in mod){
      if(k==='suppressed'||k==='scopeOverlay') base[k]=mod[k];
      else if(k==='adsZoom') base.adsZoom += mod[k];
      else base[k] = base[k] * (1+mod[k]);
    }
  }
  base.mag = Math.round(base.mag);
  return base;
}

export function buildWeaponModel(wid){
  const g = new THREE.Group();
  const W = WEAPONS[wid];
  W.build(g);
  const lo = loadout[wid];
  for(const slot of SLOT_ORDER){
    const a = ATTACH[slot][lo[slot]];
    if(a.build){
      const p = slot==='scope' ? W.scopePos : slot==='mag' ? W.magPos : slot==='grip' ? W.gripPos : [0,0,W.muzzleZ];
      a.build(g, p, wid);
    }
  }
  g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
  return g;
}

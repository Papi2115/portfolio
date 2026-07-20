import * as THREE from 'three';
import { scene, targetTexture } from './scene.js';

/* ============================================================
   CELE
============================================================ */
export const targets = [];
const targetTex = targetTexture();
export function makeTarget(x,z,{moving=false, axis='x', range=4, speed=1, ry=0}={}){
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,1.1,8), new THREE.MeshStandardMaterial({color:0x3a4046}));
  pole.position.y=.55; pole.castShadow=true; grp.add(pole);
  const board = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.05,28), new THREE.MeshStandardMaterial({map:targetTex, roughness:.8}));
  face.rotation.x = Math.PI/2; face.castShadow=true;
  board.add(face);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.03,28), new THREE.MeshStandardMaterial({color:0x333}));
  back.rotation.x=Math.PI/2; back.position.z=-.045; board.add(back);
  board.position.y = 1.65;
  grp.add(board);
  grp.position.set(x,0,z);
  grp.rotation.y = ry;
  scene.add(grp);
  const t = { grp, board, face, x0:x, z0:z, moving, axis, range, speed,
              phase:Math.random()*6, alive:true, fallT:0, respawnAt:0 };
  targets.push(t);
  return t;
}
// === HALA STRZELNICY: x∈[-16,16], z∈[-42,-20] (ściany w scene.js) ===
// Wszystkie cele patrzą w +Z (na wejście od korytarza), więc ry=0 dla wszystkich.
// statyczne — 5 celów przy tylnej ścianie (z=-42), margines ≥2 j. od ściany
makeTarget(-12, -38); makeTarget(-6, -39); makeTarget(0, -40); makeTarget(6, -39); makeTarget(12, -38);
// ruchome — bliżej wejścia; zasada: |x0| + range ≤ 15 (margines do ścian ±16)
makeTarget(-10, -26, {moving:true, axis:'x', range:4, speed:1.2}); // x∈[-14,-6]
makeTarget( 10, -26, {moving:true, axis:'x', range:4, speed:1.6}); // x∈[6,14]
makeTarget( -6, -30, {moving:true, axis:'x', range:5, speed:1.4}); // x∈[-11,-1]
makeTarget(  6, -30, {moving:true, axis:'x', range:5, speed:1.8}); // x∈[1,11]
makeTarget(  0, -28, {moving:true, axis:'x', range:8, speed:2.0}); // x∈[-8,8]

export function updateTargets(now, dt){
  for(const t of targets){
    if(t.moving && t.alive){
      const off = Math.sin(now*t.speed + t.phase)*t.range;
      if(t.axis==='x') t.grp.position.x = t.x0 + off;
      else t.grp.position.z = t.z0 + off;
    }
    if(!t.alive){
      t.fallT += dt;
      t.board.rotation.x = Math.min(Math.PI/2, t.fallT*6);
      if(now >= t.respawnAt){
        t.alive = true;
        t.board.rotation.x = 0;
      }
    } else if(t.board.rotation.x>0){
      t.board.rotation.x = Math.max(0, t.board.rotation.x - dt*5);
    }
  }
}

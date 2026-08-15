// P3: tiny procedural villagers + critters for the living world.
// Zero assets — boxes/spheres/cones, colored per NPC.
import * as THREE from "three";

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 });
}

/** A compact humanoid villager (shorter + softer than the hero). */
export function makeVillager(body: string, accent: string, hat: boolean): THREE.Group {
  const g = new THREE.Group();
  const skin = mat("#e8c39a");
  const robe = mat(body);

  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), robe);
    leg.position.set(s * 0.08, 0.15, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.2), robe);
  torso.position.y = 0.46;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), skin);
  head.position.y = 0.72;
  g.add(head);

  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 8), mat(accent));
    brim.position.y = 0.82;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 8), mat(accent));
    top.position.y = 0.9;
    g.add(brim, top);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent));
    hair.position.y = 0.75;
    g.add(hair);
  }

  g.scale.setScalar(0.85);
  return g;
}

/** A small hopping critter (rabbit-ish) for ambient wildlife. */
export function makeCritter(color: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(color));
  body.scale.y = 0.8;
  body.position.y = 0.1;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(color));
  head.position.set(0.06, 0.17, 0);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 5), mat(color));
    ear.position.set(0.07 + s * 0.02, 0.27, 0);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), mat("#f3ede0"));
  tail.position.set(-0.09, 0.12, 0);
  g.add(tail);
  g.scale.setScalar(0.8);
  return g;
}

// P1 targeting: an in-world ground ring that marks the tapped tile, node or
// monster. Zero assets — a flat ring that pulses gently to read as "aimed at".
import * as THREE from "three";

export interface SelectionRing {
  group: THREE.Group;
  update(timeMs: number): void;
}

export function makeSelectionRing(): SelectionRing {
  const g = new THREE.Group();
  g.renderOrder = 5;

  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.62, 28),
    new THREE.MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.95, depthWrite: false })
  );
  outer.rotation.x = -Math.PI / 2;
  g.add(outer);

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.4, 20),
    new THREE.MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.4, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);

  g.visible = false;

  return {
    group: g,
    update(tMs: number) {
      const t = tMs / 1000;
      // Gentle breathing pulse so the marker reads as "current target".
      const s = 1 + Math.sin(t * 5) * 0.05;
      outer.scale.setScalar(s);
      glow.scale.setScalar(1 + Math.sin(t * 5 + Math.PI) * 0.05);
    },
  };
}

/** P4b: boss slam telegraph — a shrinking red ring over the threatened tile. */
export function makeBossRing(): THREE.Group {
  const g = new THREE.Group();
  g.renderOrder = 6;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.6, 28),
    new THREE.MeshBasicMaterial({ color: "#ff4030", transparent: true, opacity: 0.95, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.44, 24),
    new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.22, depthWrite: false })
  );
  fill.rotation.x = -Math.PI / 2;
  g.add(fill);
  g.visible = false;
  return g;
}

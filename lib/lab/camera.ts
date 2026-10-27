import * as THREE from "three";
import { discNormalOf } from "./topology";
import type { GraphData, ViewMode } from "./types";

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Tilted spin axis gives the reveal its diagonal, 720° corkscrew feel. */
const SPIN_AXIS = new THREE.Vector3(0.22, 0.95, 0.12).normalize();

export const INTRO_DURATION_MS = 9000;
export const ORBIT_IDLE_MS = 3000;
export const ORBIT_RAD_PER_SEC = 0.05;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function satelliteHeads(graph: GraphData) {
  return graph.nodes.filter((n) => n.zone === "memory" && n.hub);
}

export function presetPose(
  view: ViewMode,
  aspect: number,
  graph: GraphData,
  satellite = 0,
): Pose {
  const target = new THREE.Vector3();
  const position = new THREE.Vector3();

  if (view === "lattice") {
    const d = aspect < 0.7 ? 1180 : aspect < 1.05 ? 1000 : 880;
    position.set(0, d * 0.14, d);
  } else if (view === "core") {
    const d = aspect < 0.8 ? 330 : 262;
    position.set(0, d * 0.16, d);
  } else if (view === "memory") {
    const heads = satelliteHeads(graph);
    const head = heads[((satellite % heads.length) + heads.length) % heads.length];
    target.set(head.x, head.y, head.z);
    const d = aspect < 0.8 ? 210 : 175;
    // Look down the disc normal (flipped outward) so the spiral is face-on.
    const normal = new THREE.Vector3(...discNormalOf(head));
    if (normal.dot(target) < 0) normal.negate();
    position.copy(target).addScaledVector(normal, d);
    position.y += d * 0.08;
  } else {
    // Immersion: float inside the reasoning core, looking out through the lattice.
    position.set(0, 5, 46);
    target.set(-30, 8, -260);
  }
  return { position, target };
}

/**
 * 720° reveal. Distance eases in from far away while the camera corkscrews two
 * full turns around a tilted axis. Because 4π is the identity rotation, the
 * final frame lands exactly on `final` with a level horizon.
 */
export function applyIntro(
  progress: number,
  final: Pose,
  camera: THREE.PerspectiveCamera,
): void {
  const p = Math.min(1, Math.max(0, progress));
  const offset = final.position.clone().sub(final.target);
  const finalDistance = offset.length();
  const distance = THREE.MathUtils.lerp(finalDistance * 2.1, finalDistance, easeOutCubic(p));
  offset.setLength(distance);

  const q = new THREE.Quaternion().setFromAxisAngle(SPIN_AXIS, Math.PI * 4 * easeInOutCubic(p));
  offset.applyQuaternion(q);
  camera.up.set(0, 1, 0).applyQuaternion(q);
  camera.position.copy(final.target).add(offset);
  camera.lookAt(final.target);
}

/** Slow diagonal drift around the current look-at target. */
export function applyOrbit(dt: number, camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
  const q = new THREE.Quaternion().setFromAxisAngle(SPIN_AXIS, ORBIT_RAD_PER_SEC * dt);
  const offset = camera.position.clone().sub(target).applyQuaternion(q);
  camera.up.applyQuaternion(q);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

import * as THREE from "three";
import { discNormalOf } from "./topology";
import type { GraphData, ViewMode } from "./types";

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export const INTRO_DURATION_MS = 4800;
export const ORBIT_IDLE_MS = 1800;
export const ORBIT_RAD_PER_SEC = 0.085;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

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
    const d = aspect < 0.7 ? 1120 : aspect < 1.05 ? 940 : 810;
    position.set(0, d * 0.18, d);
  } else if (view === "core") {
    const d = aspect < 0.8 ? 310 : 240;
    position.set(0, d * 0.15, d);
  } else if (view === "memory") {
    const heads = satelliteHeads(graph);
    const head = heads[((satellite % heads.length) + heads.length) % heads.length];
    target.set(head.x, head.y, head.z);
    const d = aspect < 0.8 ? 205 : 168;
    const normal = new THREE.Vector3(...discNormalOf(head));
    if (normal.dot(target) < 0) normal.negate();
    position.copy(target).addScaledVector(normal, d);
    position.y += d * 0.08;
  } else {
    // Immersion: inside the attention tensor core looking out toward the NVLink ring & shards.
    position.set(0, 8, 42);
    target.set(-34, 10, -260);
  }
  return { position, target };
}

/**
 * Cinematic swoop reveal: starts close to the glowing Tensor Core at a dramatic low
 * angle, then sweeps smoothly outward along a 240° orbital arc while keeping the horizon
 * stable (no nauseating upside-down roll).
 */
export function applyIntro(
  progress: number,
  final: Pose,
  camera: THREE.PerspectiveCamera,
): void {
  const p = Math.min(1, Math.max(0, progress));
  const eDist = easeOutExpo(p);
  const eAngle = easeInOutCubic(p);

  const finalOffset = final.position.clone().sub(final.target);
  const finalRadius = Math.hypot(finalOffset.x, finalOffset.z);
  const finalAngle = Math.atan2(finalOffset.x, finalOffset.z);

  const startRadius = 135;
  const radius = THREE.MathUtils.lerp(startRadius, finalRadius, eDist);
  const angle = finalAngle - (1 - eAngle) * Math.PI * 1.35;
  const height = THREE.MathUtils.lerp(-55, finalOffset.y, eAngle);

  camera.position.set(
    final.target.x + Math.sin(angle) * radius,
    final.target.y + height,
    final.target.z + Math.cos(angle) * radius,
  );
  // Subtle banking roll that levels out completely at p = 1
  const bank = Math.sin(p * Math.PI) * 0.14 * (1 - p);
  camera.up.set(Math.sin(bank), Math.cos(bank), 0).normalize();
  camera.lookAt(final.target);
}

/**
 * Smooth orbital drift around the current target with subtle vertical figure-8 breathing
 * and cursor-driven parallax offset.
 */
export function applyOrbit(
  dt: number,
  time: number,
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  pointer: { x: number; y: number },
): void {
  const offset = camera.position.clone().sub(target);
  const q = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, ORBIT_RAD_PER_SEC * dt);
  offset.applyQuaternion(q);

  // Gentle vertical wave + pointer parallax response
  const targetYDelta = Math.sin(time * 0.45) * 12 * dt + pointer.y * 18 * dt;
  offset.y = THREE.MathUtils.clamp(offset.y + targetYDelta, -360, 420);

  camera.up.lerp(WORLD_UP, 1 - Math.exp(-dt * 6)).normalize();
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
}

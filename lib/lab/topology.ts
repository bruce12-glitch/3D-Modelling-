import { CLUSTER_NAMES } from "./palette";
import { gaussian, mulberry32 } from "./random";
import type { GraphData, LabLink, LabNode, LinkKind } from "./types";

export const TOPOLOGY_SEED = 42;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CORE_SHELLS: ReadonlyArray<readonly [radius: number, count: number]> = [
  [14, 4],
  [28, 16],
  [42, 36],
  [56, 64],
  [70, 100],
];
const SATELLITES = 7;
const SATELLITE_MEMBERS = 47;
const RELAYS = 42;
const GATEWAYS = 3;

export const BELT_RADIUS = 170;
export const GATEWAY_RADIUS = 238;
export const CORE_RADIUS = 76;

type Vec = readonly [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec): Vec => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const pos = (n: LabNode): Vec => [n.x, n.y, n.z];

function fibonacciSphere(i: number, n: number, phase: number): Vec {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE + phase;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

/** Indices of the k nearest neighbours of `from` inside `pool` (excluding itself). */
function nearest(pool: LabNode[], from: LabNode, k: number): LabNode[] {
  const a = pos(from);
  return pool
    .filter((n) => n !== from)
    .map((n) => ({ n, d: len(sub(pos(n), a)) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, k)
    .map((e) => e.n);
}

export function generateLabTopology(seed: number = TOPOLOGY_SEED): GraphData {
  const rng = mulberry32(seed);
  const nodes: LabNode[] = [];
  const links: LabLink[] = [];
  const seen = new Set<string>();

  const connect = (
    a: LabNode,
    b: LabNode,
    kind: LinkKind,
    width: number,
    curvature: number,
    particles = 0,
  ) => {
    if (a === b) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      source: a.id,
      target: b.id,
      kind,
      width,
      curvature,
      rotation: (links.length * GOLDEN_ANGLE) % (Math.PI * 2),
      particles,
    });
  };

  // ── Reasoning core: concentric Fibonacci shells -> a dense, brain-like lattice ──
  const core: LabNode[] = [];
  CORE_SHELLS.forEach(([shellRadius, count]) => {
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const [ux, uy, uz] = fibonacciSphere(i, count, phase);
      const r = shellRadius + gaussian(rng) * 1.8;
      const node: LabNode = {
        id: `core-${core.length}`,
        zone: "core",
        clusterId: 0,
        radius: 1.1 + rng() * 0.6,
        label: `Core ${core.length}`,
        hub: false,
        x: ux * r,
        y: uy * r * 0.82,
        z: uz * r,
        degree: 0,
      };
      core.push(node);
    }
  });
  // Promote a spread of mid/outer-shell nodes to hubs.
  const hubCandidates = core.slice(CORE_SHELLS[0][1] + CORE_SHELLS[1][1]);
  for (let h = 0; h < 14; h++) {
    const node = hubCandidates[Math.floor(rng() * hubCandidates.length)];
    node.hub = true;
    node.radius = 2.5 + rng() * 0.6;
  }
  nodes.push(...core);

  // ── Memory satellites: two-armed spiral discs on a Fibonacci sphere ──
  const heads: LabNode[] = [];
  const clusters: LabNode[][] = [];
  for (let s = 0; s < SATELLITES; s++) {
    const dir = fibonacciSphere(s, SATELLITES, 0.6);
    const anchorR = 305 + rng() * 45;
    const anchor: Vec = [dir[0] * anchorR, dir[1] * anchorR * 0.8, dir[2] * anchorR];
    const normal = norm(anchor);
    const helper: Vec = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(normal, helper));
    const v = cross(normal, u);
    const clusterId = s + 1;
    const members: LabNode[] = [];

    const head: LabNode = {
      id: `mem-${s}-head`,
      zone: "memory",
      clusterId,
      radius: 3.4,
      label: `${CLUSTER_NAMES[s]} head`,
      hub: true,
      x: anchor[0],
      y: anchor[1],
      z: anchor[2],
      degree: 0,
    };
    members.push(head);
    heads.push(head);

    for (let i = 0; i < SATELLITE_MEMBERS; i++) {
      const t = (i + 1) / SATELLITE_MEMBERS;
      const arm = i % 2;
      const r = 8 + 30 * Math.sqrt(t) + gaussian(rng) * 1.6;
      const theta = t * 5.2 + arm * Math.PI + gaussian(rng) * 0.16;
      const lift = gaussian(rng) * 2.6;
      members.push({
        id: `mem-${s}-${i}`,
        zone: "memory",
        clusterId,
        radius: 0.8 + (1 - t) * 0.5 + rng() * 0.3,
        label: `${CLUSTER_NAMES[s]} ${i}`,
        hub: false,
        x: anchor[0] + u[0] * r * Math.cos(theta) + v[0] * r * Math.sin(theta) + normal[0] * lift,
        y: anchor[1] + u[1] * r * Math.cos(theta) + v[1] * r * Math.sin(theta) + normal[1] * lift,
        z: anchor[2] + u[2] * r * Math.cos(theta) + v[2] * r * Math.sin(theta) + normal[2] * lift,
        degree: 0,
      });
    }
    clusters.push(members);
    nodes.push(...members);
  }

  // ── Relay belt: a tilted, gently undulating ring between core and satellites ──
  const relays: LabNode[] = [];
  const tilt = 0.18;
  for (let i = 0; i < RELAYS; i++) {
    const theta = (i / RELAYS) * Math.PI * 2;
    const r = BELT_RADIUS + 12 * Math.sin(3 * theta) + gaussian(rng) * 1.5;
    const y0 = 26 * Math.sin(2 * theta + 0.6) + gaussian(rng) * 1.5;
    const x0 = Math.cos(theta) * r;
    const z0 = Math.sin(theta) * r;
    relays.push({
      id: `relay-${i}`,
      zone: "relay",
      clusterId: 8,
      radius: 1.5 + rng() * 0.4,
      label: `Relay ${i}`,
      hub: false,
      x: x0,
      y: y0 * Math.cos(tilt) - z0 * Math.sin(tilt),
      z: y0 * Math.sin(tilt) + z0 * Math.cos(tilt),
      degree: 0,
    });
  }
  nodes.push(...relays);

  // ── Gateways: three beacons just outside the belt ──
  const gateways: LabNode[] = [];
  for (let i = 0; i < GATEWAYS; i++) {
    const theta = (i / GATEWAYS) * Math.PI * 2 + Math.PI / 2;
    gateways.push({
      id: `gateway-${i}`,
      zone: "gateway",
      clusterId: 9,
      radius: 4.2,
      label: `Gateway ${i}`,
      hub: true,
      x: Math.cos(theta) * GATEWAY_RADIUS,
      y: Math.sin(theta * 2) * 14,
      z: Math.sin(theta) * GATEWAY_RADIUS,
      degree: 0,
    });
  }
  nodes.push(...gateways);

  // ── Links ──
  // Core: local k-nearest lattice + long-range small-world shortcuts from hubs.
  for (const n of core) {
    for (const m of nearest(core, n, 3)) connect(n, m, "core", 0, 0.1 + rng() * 0.12);
  }
  for (const hub of core.filter((n) => n.hub)) {
    const far = core.filter((n) => len(sub(pos(n), pos(hub))) > 60);
    for (let k = 0; k < 3; k++) {
      connect(hub, far[Math.floor(rng() * far.length)], "core", 0, 0.28 + rng() * 0.1);
    }
  }

  // Memory: radial spokes from each head plus a local k-nearest mesh.
  clusters.forEach((members) => {
    const head = members[0];
    for (const m of nearest(members, head, 9)) connect(head, m, "memory", 0, 0.12, 1);
    for (const n of members) {
      for (const m of nearest(members, n, 2)) connect(n, m, "memory", 0, 0.2 + rng() * 0.15);
    }
  });

  // Relay belt: closed ring with periodic cross-links.
  relays.forEach((r, i) => {
    connect(r, relays[(i + 1) % RELAYS], "relay", 0, 0.06, 2);
    if (i % 7 === 0) connect(r, relays[(i + 14) % RELAYS], "relay", 0, 0.3);
  });

  // Highways: core hubs -> belt, belt -> satellites, gateways -> everything they bridge.
  const coreHubs = core.filter((n) => n.hub);
  for (const hub of coreHubs.slice(0, 9)) {
    connect(hub, nearest(relays, hub, 1)[0], "highway", 1, 0.08, 3);
  }
  for (const head of heads) {
    for (const r of nearest(relays, head, 2)) connect(head, r, "highway", 1, 0.06, 3);
  }
  for (const g of gateways) {
    for (const r of nearest(relays, g, 2)) connect(g, r, "highway", 1.6, 0.04, 4);
    for (const h of nearest(heads, g, 2)) connect(g, h, "highway", 1.6, 0.05, 4);
  }

  // Degrees (drives inspector + hub emphasis).
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const l of links) {
    byId.get(l.source)!.degree++;
    byId.get(l.target)!.degree++;
  }

  return { nodes, links };
}

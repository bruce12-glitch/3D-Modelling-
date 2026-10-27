export const ZONES = ["core", "memory", "relay", "gateway"] as const;
export type Zone = (typeof ZONES)[number];

export type LinkKind = "core" | "memory" | "relay" | "highway";

export interface LabNode {
  id: string;
  zone: Zone;
  /** 0 = core, 1..7 = memory satellites, 8 = relay belt, 9 = gateways */
  clusterId: number;
  radius: number;
  label: string;
  /** Hubs are the high-degree "anchor" nodes of a region. */
  hub: boolean;
  x: number;
  y: number;
  z: number;
  /** Filled in after link generation. */
  degree: number;
}

export interface LabLink {
  source: string;
  target: string;
  kind: LinkKind;
  width: number;
  curvature: number;
  /** Radians; varies the plane each curved link bends in. */
  rotation: number;
  /** Directional particles that visualise inference traffic. */
  particles: number;
}

export interface GraphData {
  nodes: LabNode[];
  links: LabLink[];
}

export const VIEW_MODES = ["lattice", "core", "memory", "immersion"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

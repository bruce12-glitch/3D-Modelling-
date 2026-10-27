import type { Zone } from "./types";

export const CLUSTER_NAMES = [
  "EPISODIC",
  "SEMANTIC",
  "PROCEDURAL",
  "WORKING",
  "REFERENCE",
  "ASSOCIATIVE",
  "TEMPORAL",
] as const;

/** Warm amber -> violet sweep, one colour per memory satellite. */
export const CLUSTER_COLORS = [
  "#fbbf24",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#8b5cf6",
] as const;

export const ZONE_COLORS: Record<Zone, string> = {
  core: "#fcd34d",
  memory: "#fbbf24",
  relay: "#67e8f9",
  gateway: "#fff7d6",
};

export const ZONE_LABELS: Record<Zone, string> = {
  core: "Reasoning core",
  memory: "Agentic memory",
  relay: "Relay belt",
  gateway: "Gateway",
};

export function nodeColorHex(zone: Zone, clusterId: number): string {
  if (zone === "memory") return CLUSTER_COLORS[(clusterId - 1) % CLUSTER_COLORS.length];
  return ZONE_COLORS[zone];
}

/** Link colours are quantised per kind so the renderer only needs a handful of materials. */
export const LINK_COLORS = {
  core: { base: "rgba(34, 211, 238, 0.34)", dim: "rgba(34, 211, 238, 0.05)", lit: "rgba(165, 243, 252, 0.95)" },
  memory: { base: "rgba(251, 191, 36, 0.30)", dim: "rgba(251, 191, 36, 0.05)", lit: "rgba(254, 240, 138, 0.95)" },
  relay: { base: "rgba(103, 232, 249, 0.55)", dim: "rgba(103, 232, 249, 0.07)", lit: "rgba(207, 250, 254, 1)" },
  highway: { base: "rgba(253, 224, 71, 0.85)", dim: "rgba(253, 224, 71, 0.10)", lit: "rgba(255, 251, 220, 1)" },
} as const;

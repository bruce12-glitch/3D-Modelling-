import type { Zone } from "./types";

export const CLUSTER_NAMES = [
  "ATTN-QKV",
  "MOE-FFN",
  "KV-CACHE",
  "ROPE-EMB",
  "SPEC-DEC",
  "ALL-REDUCE",
  "LOGIT-HEAD",
] as const;

/** High-contrast electric cybernetic palette for ML compute shards. */
export const CLUSTER_COLORS = [
  "#38bdf8", // Sky Cyan - Attention QKV
  "#818cf8", // Indigo - MoE FFN
  "#c084fc", // Purple - KV-Cache
  "#f472b6", // Pink - RoPE Embeddings
  "#fb923c", // Orange - Speculative Decoding
  "#34d399", // Emerald - All-Reduce Collective
  "#facc15", // Amber Gold - Logit Head
] as const;

export const ZONE_COLORS: Record<Zone, string> = {
  core: "#22d3ee",
  memory: "#818cf8",
  relay: "#34d399",
  gateway: "#fbbf24",
};

export const ZONE_LABELS: Record<Zone, string> = {
  core: "Attention Tensor Core",
  memory: "MoE & KV-Cache Shards",
  relay: "NVLink All-Reduce Ring",
  gateway: "Token Speculative Router",
};

export function nodeColorHex(zone: Zone, clusterId: number): string {
  if (zone === "memory") return CLUSTER_COLORS[(clusterId - 1) % CLUSTER_COLORS.length];
  return ZONE_COLORS[zone];
}

/** Quantised link colours with stronger lit states for active tensor paths. */
export const LINK_COLORS = {
  core: {
    base: "rgba(34, 211, 238, 0.38)",
    dim: "rgba(34, 211, 238, 0.04)",
    lit: "rgba(165, 243, 252, 0.98)",
  },
  memory: {
    base: "rgba(129, 140, 248, 0.36)",
    dim: "rgba(129, 140, 248, 0.04)",
    lit: "rgba(224, 231, 255, 0.98)",
  },
  relay: {
    base: "rgba(52, 211, 153, 0.48)",
    dim: "rgba(52, 211, 153, 0.05)",
    lit: "rgba(167, 243, 208, 1.0)",
  },
  highway: {
    base: "rgba(251, 191, 36, 0.58)",
    dim: "rgba(251, 191, 36, 0.07)",
    lit: "rgba(254, 249, 195, 1.0)",
  },
} as const;

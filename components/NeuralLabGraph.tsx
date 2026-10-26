"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d").then((mod) => mod.default),
  { ssr: false, loading: () => null }
);

interface LabNode {
  id: string;
  zone: "core" | "memory" | "relay" | "gateway";
  clusterId: number;
  radius: number;
  label: string;
  x?: number;
  y?: number;
  z?: number;
}

interface LabLink {
  source: string;
  target: string;
  width: number;
  curvature: number;
  kind: "core" | "memory" | "relay" | "gateway" | "highway";
  color: string;
}

interface GraphData {
  nodes: LabNode[];
  links: LabLink[];
}

interface LabAssets {
  geometries: Record<string, THREE.BufferGeometry>;
  glowTexture: THREE.Texture;
  ringTexture: THREE.Texture;
}

function generateLabTopology(): GraphData {
  const rng = mulberry32(42);
  const nodes: LabNode[] = [];
  const links: LabLink[] = [];

  // Core nodes (180) - Zone A
  for (let i = 0; i < 180; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 10 + rng() * 75;
    nodes.push({
      id: `core-${i}`,
      zone: "core",
      clusterId: 0,
      radius: 1.2 + rng() * 0.8,
      label: `Core ${i}`,
      x: Math.cos(angle) * radius,
      y: (rng() - 0.5) * 20,
      z: Math.sin(angle) * radius,
    });
  }

  // Memory satellites (7 * 45 = 315) - Zone B
  for (let s = 0; s < 7; s++) {
    const phi = Math.acos(1 - 2 * (s + 0.5) / 7);
    const theta = Math.PI * (1 + Math.sqrt(5)) * s;
    const anchorR = 280 + rng() * 130;
    const anchorX = anchorR * Math.sin(phi) * Math.cos(theta);
    const anchorY = anchorR * Math.cos(phi);
    const anchorZ = anchorR * Math.sin(phi) * Math.sin(theta);

    for (let i = 0; i < 45; i++) {
      const angle = rng() * Math.PI * 2;
      const r = 5 + rng() * 25;
      nodes.push({
        id: `mem-${s}-${i}`,
        zone: "memory",
        clusterId: s + 1,
        radius: 0.8 + rng() * 0.6,
        label: `Mem ${s}-${i}`,
        x: anchorX + Math.cos(angle) * r,
        y: anchorY + (rng() - 0.5) * 10,
        z: anchorZ + Math.sin(angle) * r,
      });
    }
  }

  // Relays (42) - Zone C
  for (let i = 0; i < 42; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 100 + rng() * 180;
    nodes.push({
      id: `relay-${i}`,
      zone: "relay",
      clusterId: 8,
      radius: 1.0,
      label: `Relay ${i}`,
      x: Math.cos(angle) * radius,
      y: (rng() - 0.5) * 40,
      z: Math.sin(angle) * radius,
    });
  }

  // Gateways (3) - Zone C
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const radius = 320;
    nodes.push({
      id: `gateway-${i}`,
      zone: "gateway",
      clusterId: 9,
      radius: 2.0,
      label: `Gateway ${i}`,
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
    });
  }

  // Core links - dense small-world within core
  const coreNodes = nodes.filter((n) => n.zone === "core");
  for (let i = 0; i < coreNodes.length; i++) {
    const connections = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < connections; j++) {
      const targetIdx = (i + 1 + Math.floor(rng() * (coreNodes.length - 1))) % coreNodes.length;
      links.push({
        source: coreNodes[i].id,
        target: coreNodes[targetIdx].id,
        width: 0.4 + rng() * 0.3,
        curvature: 0.1 + rng() * 0.2,
        kind: "core",
        color: `rgba(34, 211, 238, ${0.3 + rng() * 0.3})`,
      });
    }
  }

  // Memory satellite intra-cluster links
  for (let s = 0; s < 7; s++) {
    const clusterNodes = nodes.filter((n) => n.zone === "memory" && n.clusterId === s + 1);
    for (let i = 0; i < clusterNodes.length; i++) {
      const connections = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < connections; j++) {
        const targetIdx = (i + 1 + Math.floor(rng() * (clusterNodes.length - 1))) % clusterNodes.length;
        links.push({
          source: clusterNodes[i].id,
          target: clusterNodes[targetIdx].id,
          width: 0.5 + rng() * 0.3,
          curvature: 0.2 + rng() * 0.3,
          kind: "memory",
          color: `rgba(251, 191, 36, ${0.4 + rng() * 0.3})`,
        });
      }
    }
  }

  // Relay chain links
  const relayNodes = nodes.filter((n) => n.zone === "relay");
  for (let i = 0; i < relayNodes.length - 1; i++) {
    links.push({
      source: relayNodes[i].id,
      target: relayNodes[i + 1].id,
      width: 0.8,
      curvature: 0.15,
      kind: "relay",
      color: `rgba(167, 139, 250, ${0.5 + rng() * 0.3})`,
    });
  }

  // Gateway to relay highway links
  const gatewayNodes = nodes.filter((n) => n.zone === "gateway");
  for (const gateway of gatewayNodes) {
    const targetRelay = relayNodes[Math.floor(rng() * relayNodes.length)];
    links.push({
      source: gateway.id,
      target: targetRelay.id,
      width: 1.5,
      curvature: 0.05,
      kind: "highway",
      color: `rgba(34, 211, 238, ${0.7 + rng() * 0.2})`,
    });
  }

  // Core to relay connections
  for (let i = 0; i < 12; i++) {
    const coreNode = coreNodes[Math.floor(rng() * coreNodes.length)];
    const relayNode = relayNodes[Math.floor(rng() * relayNodes.length)];
    links.push({
      source: coreNode.id,
      target: relayNode.id,
      width: 0.6,
      curvature: 0.1,
      kind: "highway",
      color: `rgba(6, 182, 212, ${0.5 + rng() * 0.3})`,
    });
  }

  return { nodes, links };
}

function createLabAssets(): LabAssets {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 64;
  glowCanvas.height = 64;
  const glowCtx = glowCanvas.getContext("2d")!;
  const glowGradient = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glowGradient.addColorStop(0, "rgba(34,211,238,1)");
  glowGradient.addColorStop(0.5, "rgba(34,211,238,0.4)");
  glowGradient.addColorStop(1, "rgba(34,211,238,0)");
  glowCtx.fillStyle = glowGradient;
  glowCtx.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.needsUpdate = true;

  const ringCanvas = document.createElement("canvas");
  ringCanvas.width = 64;
  ringCanvas.height = 64;
  const ringCtx = ringCanvas.getContext("2d")!;
  ringCtx.beginPath();
  ringCtx.arc(32, 32, 28, 0, Math.PI * 2);
  ringCtx.strokeStyle = "rgba(34,211,238,0.6)";
  ringCtx.lineWidth = 4;
  ringCtx.stroke();
  const ringTexture = new THREE.CanvasTexture(ringCanvas);
  ringTexture.needsUpdate = true;

  return {
    geometries: {
      sphere: new THREE.SphereGeometry(1, 24, 24),
      octahedron: new THREE.OctahedronGeometry(1, 0),
      tetrahedron: new THREE.TetrahedronGeometry(1, 0),
      icosahedron: new THREE.IcosahedronGeometry(1, 0),
    },
    glowTexture,
    ringTexture,
  };
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}

const CLUSTER_COLORS = [
  "#fbbf24", "#f59e0b", "#f97316", "#ef4444",
  "#ec4899", "#a855f7", "#8b5cf6",
] as const;

const ZONE_COLORS = {
  core: "#ffd700",
  memory: "#fbbf24",
  relay: "#a78bfa",
  gateway: "#fbbf24",
} as const

const LINK_KINDS = [
  "core", "memory", "relay", "gateway", "highway",
] as const;

const DEFAULT_LINK_WIDTH = 0.5;
const HIGHWAY_LINK_WIDTH = 1.5;
const CORE_LINK_WIDTH = 0.4;
const MEMORY_LINK_WIDTH = 0.5;
const DEFAULT_CURVATURE = 0.2;
const HIGHWAY_CURVATURE = 0.05;
const CORE_CURVATURE = 0.15;
const MEMORY_CURVATURE = 0.25;
const DEFAULT_PARTICLES = 4;
const HIGHWAY_PARTICLES = 8;
const CORE_PARTICLES = 2;
const MEMORY_PARTICLES = 3;
const HIGHWAY_SPEED = 0.0085;
const CORE_SPEED = 0.0032;
const MEMORY_SPEED = 0.0045;
const LATTICE_DISTANCE_MOBILE = 1035;
const LATTICE_DISTANCE_TABLET = 885;
const LATTICE_DISTANCE_DESKTOP = 760;
const CORE_DISTANCE_MOBILE = 320;
const CORE_DISTANCE_DESKTOP = 258;
const MEMORY_DISTANCE_MOBILE = 192;
const MEMORY_DISTANCE_DESKTOP = 162;
const DEFAULT_TRANSITION = 1500;
const REVEAL_TRANSITION = 2100;
const AUTO_ORBIT_DELAY = 2500;
const AUTO_ORBIT_SPEED = 0.00015;
const D3_ALPHA_DECAY = 0.021;
const D3_VELOCITY_DECAY = 0.28;
const D3_ALPHA_MIN = 0.001;
const WARMUP_TICKS = 70;
const COOLDOWN_TICKS = 280;
const COOLDOWN_TIME = 30000;
const BLOOM_STRENGTH = 0.68;
const BLOOM_RADIUS = 0.62;
const BLOOM_THRESHOLD = 0.22;
const TRACKBALL_ROTATE_SPEED = 3.5;
const TRACKBALL_ZOOM_SPEED = 1.2;
const TRACKBALL_PAN_SPEED = 0.8;
const TRACKBALL_DAMPING = 0.15;
const TRACKBALL_MIN_DISTANCE = 30;
const TRACKBALL_MAX_DISTANCE = 2000;
const CORE_RADIUS_MIN = 1.2;
const CORE_RADIUS_MAX = 2.0;
const MEMORY_RADIUS_MIN = 0.8;
const MEMORY_RADIUS_MAX = 1.4;
const RELAY_RADIUS = 1.0;
const GATEWAY_RADIUS = 2.0;
const CORE_ANCHOR_RADIUS_MIN = 10;
const CORE_ANCHOR_RADIUS_MAX = 85;
const MEMORY_ANCHOR_RADIUS_MIN = 280;
const MEMORY_ANCHOR_RADIUS_MAX = 410;
const RELAY_ANCHOR_RADIUS_MIN = 100;
const RELAY_ANCHOR_RADIUS_MAX = 280;
const GATEWAY_ANCHOR_RADIUS = 320;
const GLOW_SCALE_FACTOR = 2.8;
const SELECTION_RING_SCALE_FACTOR = 3.5;
const LABEL_SPRITE_WIDTH = 120;
const LABEL_SPRITE_HEIGHT = 30;
const LABEL_VERTICAL_OFFSET = 50;
const STAR_COUNT = 3000;
const STAR_INNER_RADIUS = 800;
const STAR_OUTER_RADIUS = 2000;
const STAR_SIZE_MIN = 0.5;
const STAR_SIZE_MAX = 2.5;
const STAR_OPACITY = 0.6;
const HUD_TITLE = "AGI Lab / Cognition Mesh";
const HUD_SUBTITLE = "540-node deterministic topology · 7 agentic memory satellites · 720° trackball";
const HUD_SEED_LABEL = "Seed 42";
const HUD_SYSTEM_LABEL = "Neural Systems";
const VIEW_MODES = ["lattice", "core", "memory", "immersion"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
const NODE_ZONES = ["core", "memory", "relay", "gateway"] as const;
type NodeZone = (typeof NODE_ZONES)[number];
type LinkKind = (typeof LINK_KINDS)[number];
const TARGET_FPS = 60;
const FPS_SAMPLE_INTERVAL = 1000;
const PERFORMANCE_WARN_THRESHOLD = 30;
const RESIZE_DEBOUNCE_MS = 100;

const ZONE_PALETTES = {
  core: { primary: "#ffd700", secondary: "#fbbf24", glow: "#fff3cd" },
  memory: { primary: "#fbbf24", secondary: "#f59e0b", glow: "#fef3c7" },
  relay: { primary: "#a78bfa", secondary: "#8b5cf6", glow: "#ede9fe" },
  gateway: { primary: "#fbbf24", secondary: "#f97316", glow: "#fef3c7" },
} as const;
const MIN_CANVAS_WIDTH = 1;
const MIN_CANVAS_HEIGHT = 1;
const GLOW_TEXTURE_SIZE = 64;
const RING_TEXTURE_SIZE = 64;
const LABEL_TEXTURE_WIDTH = 256;
const LABEL_TEXTURE_HEIGHT = 64;
const SPHERE_SEGMENTS = 24;
const SPHERE_RINGS = 24;
const LINK_RESOLUTION = 4;
const PARTICLE_RESOLUTION = 4;
const ARROW_RESOLUTION = 4;
const NODE_METALNESS = 0.2;
const NODE_ROUGHNESS = 0.3;
const NODE_CLEARCOAT = 0.5;
const NODE_CLEARCOAT_ROUGHNESS = 0.2;
const NODE_OPACITY = 0.95;
const NODE_TRANSMISSION = 0.1;
const NODE_THICKNESS = 0.5;
const NODE_EMISSIVE_INTENSITY = 0.4;
const GLOW_OPACITY = 0.35;
const GLOW_BLENDING = THREE.AdditiveBlending;
const RING_OPACITY = 0.8;
const RING_BLENDING = THREE.AdditiveBlending;
const LABEL_FONT_SIZE = 28;
const LABEL_FONT_FAMILY = "'JetBrains Mono', monospace";
const LABEL_FILL_STYLE = "#22d3ee";
const LABEL_OPACITY = 0.9;
const STAR_COLOR_CYAN = [0.2, 0.8, 1.0] as const;
const STAR_COLOR_AMBER = [1.0, 0.75, 0.2] as const;
const STAR_COLOR_WHITE = [1.0, 1.0, 1.0] as const;
const STAR_COLOR_DISTRIBUTION = [0.4, 0.3, 0.3] as const;
const BG_GRADIENT_1 = "radial-gradient(ellipse at 50% 44%, rgba(6,182,212,0.11), transparent 44%)";
const BG_GRADIENT_2 = "radial-gradient(ellipse at 78% 18%, rgba(245,158,11,0.05), transparent 34%)";


function WebGLFallback() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black p-5">
      <div className="glass-panel glass-panel-strong relative w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-amber-200/70 uppercase tracking-wide">Renderer offline</p>
            <h2 className="text-lg font-semibold text-white">WebGL is unavailable</h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          This 3D topology needs hardware-accelerated WebGL. Enable GPU
          acceleration in your browser, update the graphics driver, or try a
          recent Chrome, Edge, Firefox, or Safari build.
        </p>
      </div>
    </div>
  );
}
const VIGNETTE_GRADIENT = "radial-gradient(circle at 50% 50%, transparent 30%, rgba(3,5,8,0.45) 100%)";

;

, ${b}, ${alpha})`;
}


function GraphSkeleton() {
  return (
    <div role="status" aria-live="polite" className="absolute inset-0 z-20 bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(6,182,212,0.13),transparent_40%),radial-gradient(circle_at_66%_34%,rgba(245,158,11,0.05),transparent_32%)]" />
      <div className="lab-scanlines absolute inset-0 opacity-40" />
      <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2">
        <div className="orbital-ring absolute inset-0 rounded-full border border-dashed border-cyan-200/20 animate-spin" />
        <div className="orbital-ring-reverse absolute inset-6 rounded-full border border-amber-200/15 animate-spin-reverse" />
        <div className="skeleton-sweep absolute inset-10 rounded-full border border-cyan-200/20" />
        <div className="absolute inset-[38%] rounded-full bg-cyan-300/20 blur-2xl" />
        <svg className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-cyan-100/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 14" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17l14-14" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-28 flex flex-col items-center px-5 text-center">
        <div className="flex items-center gap-2">
          <div className="live-dot" />
          <p className="text-xs text-cyan-200/60 uppercase tracking-wide">Synthesizing cognition lattice</p>
        </div>
        <p className="mt-2 text-sm font-medium text-slate-200">540 nodes · 7 agentic memory satellites</p>
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          Seeding the prime cortex, memory anchors, and directed inference
          highways with mulberry32(42).
        </p>
        <div className="mt-5 h-px w-56 bg-white/10">
          <div className="skeleton-sweep h-full w-1/2 bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
        </div>
      </div>
    </div>
  );
}
;
}


function FatalOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-5">
      <div className="glass-panel glass-panel-strong w-full max-w-md rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10">
            <svg className="h-5 w-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-amber-200/70 uppercase tracking-wide">Renderer fault</p>
            <h2 className="text-lg font-semibold text-white">The topology engine hit a snag</h2>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full py-2 px-4 rounded-xl border border-amber-300/25 bg-amber-400/10 text-amber-100 font-mono text-xs uppercase tracking-wide hover:bg-amber-400/15 transition"
        >
          Rebuild renderer
        </button>
      </div>
    </div>
  );
}


function ContextLostBanner() {
  return (
    <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="glass-panel flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2">
        <svg className="h-4 w-4 shrink-0 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-xs text-slate-300">GPU context lost. The lattice is frozen.</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 font-mono text-[9px] uppercase tracking-wide text-amber-100 hover:bg-amber-400/15 transition"
        >
          Reload
        </button>
      </div>
    </div>
  );
}


const orbitalRingStyle = {
  animation: "spin 20s linear infinite",
};

const orbitalRingReverseStyle = {
  animation: "spin 15s linear infinite reverse",
};

const skeletonSweepStyle = {
  animation: "sweep 2s ease-in-out infinite",
};

const liveDotStyle = {
  animation: "pulse 2s ease-in-out infinite",
};

const spinKeyframes = `
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

const sweepKeyframes = `
@keyframes sweep {
  0% { transform: rotate(0deg); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: rotate(360deg); opacity: 0; }
}
`;

const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}
`;

const scanlinesKeyframes = `
@keyframes scanlines {
  0% { background-position: 0 0; }
  100% { background-position: 0 4px; }
}
`;

const vignetteStyle = {
  background: "radial-gradient(circle at 50% 50%, transparent 30%, rgba(3,5,8,0.45) 100%)",
  mixBlendMode: "multiply",
};

const glassPanelStyle = {
  backdropFilter: "blur(12px)",
  background: "rgba(15, 18, 24, 0.7)",
  border: "1px solid rgba(255, 255, 255, 0.05)",
};

const glassPanelStrongStyle = {
  backdropFilter: "blur(20px)",
  background: "rgba(10, 12, 16, 0.85)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
};

const hudPanelStyle = {
  borderRadius: "0.75rem",
  border: "1px solid rgba(255, 255, 255, 0.05)",
  background: "rgba(0, 0, 0, 0.2)",
  padding: "0.5rem",
};

const hudStatStyle = {
  fontSize: "0.6875rem",
  color: "rgb(148 163 184)",
};

const hudValueStyle = {
  marginTop: "0.25rem",
  fontSize: "0.75rem",
  color: "rgb(241 245 249)",
  fontFamily: "monospace",
};

const viewButtonActiveStyle = {
  background: "rgba(34, 211, 238, 0.2)",
  color: "rgb(207 250 254)",
  border: "1px solid rgba(34, 211, 238, 0.3)",
  boxShadow: "0 0 12px -2px rgba(34, 211, 238, 0.5)",
};

const viewButtonInactiveStyle = {
  background: "rgba(255, 255, 255, 0.05)",
  color: "rgb(203 213 225)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
};

const viewButtonHoverStyle = {
  background: "rgba(255, 255, 255, 0.1)",
  color: "rgb(241 245 249)",
};

const statusBadgeActiveStyle = {
  borderRadius: "9999px",
  border: "1px solid rgba(251, 191, 36, 0.2)",
  background: "rgba(251, 191, 36, 0.05)",
  color: "rgb(253 230 138)",
};

const statusBadgeInactiveStyle = {
  borderRadius: "9999px",
  border: "1px solid rgba(34, 211, 238, 0.2)",
  background: "rgba(34, 211, 238, 0.05)",
  color: "rgb(165 243 252)",
};

const statCardStyle = {
  borderRadius: "0.75rem",
  border: "1px solid rgba(255, 255, 255, 0.05)",
  background: "rgba(0, 0, 0, 0.3)",
  backdropFilter: "blur(8px)",
  padding: "0.75rem",
};

const statLabelStyle = {
  fontSize: "0.5625rem",
  fontFamily: "monospace",
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "rgb(148 163 184)",
};

const statValueStyle = {
  fontSize: "1.25rem",
  fontFamily: "monospace",
};

const inspectorPanelStyle = {
  position: "absolute",
  right: "1rem",
  top: "50%",
  transform: "translateY(-50%)",
  width: "18rem",
  maxHeight: "70vh",
  overflow: "auto",
  zIndex: 30,
  backdropFilter: "blur(12px)",
  borderRadius: "1rem",
  padding: "1rem",
};

const inspectorHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.75rem",
};

const inspectorTitleStyle = {
  fontWeight: "600",
  color: "rgb(248 250 252)",
};

const inspectorCloseButtonStyle = {
  color: "rgb(148 163 184)",
};

const inspectorFieldStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.875rem",
  marginBottom: "0.5rem",
};

const inspectorLabelStyle = {
  color: "rgb(148 163 184)",
};

const inspectorValueStyle = {
  fontFamily: "monospace",
  color: "rgb(248 250 252)",
};

const inspectorSectionStyle = {
  paddingTop: "0.5rem",
  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
  marginTop: "0.5rem",
};

const inspectorSectionTitleStyle = {
  fontSize: "0.625rem",
  color: "rgb(148 163 184)",
  marginBottom: "0.25rem",
};

const inspectorNeighborItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.6875rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "0.375rem",
};

const inspectorNeighborHoverStyle = {
  background: "rgba(255, 255, 255, 0.05)",
};

const NEIGHBOR_ZONE_COLORS = {
  core: "rgb(253 230 138)",
  memory: "rgb(254 240 138)",
  relay: "rgb(221 214 254)",
  gateway: "rgb(253 224 71)",
} as const

const LINK_PALETTES = {
  core: { primary: "#22d3ee", secondary: "#06b6d4", alpha: 0.5 },
  memory: { primary: "#fbbf24", secondary: "#f59e0b", alpha: 0.6 },
  relay: { primary: "#a78bfa", secondary: "#8b5cf6", alpha: 0.5 },
  gateway: { primary: "#fbbf24", secondary: "#f97316", alpha: 0.7 },
  highway: { primary: "#22d3ee", secondary: "#06b6d4", alpha: 0.8 },
} as const

const PARTICLE_PALETTES = {
  core: "#22d3ee",
  memory: "#fbbf24",
  relay: "#a78bfa",
  gateway: "#fbbf24",
  highway: "#22d3ee",
} as const

const ARROW_PALETTES = {
  highway: "rgba(34, 211, 238, 0.8)",
  core: "rgba(0, 0, 0, 0)",
  memory: "rgba(0, 0, 0, 0)",
  relay: "rgba(0, 0, 0, 0)",
  gateway: "rgba(0, 0, 0, 0)",
} as const

const NOISE_TEXTURE_SIZE = 256;
const NOISE_OCTAVES = 4;
const NOISE_PERSISTENCE = 0.5;
const NOISE_SCALE = 0.01;

const FXAA_ENABLED = true;
const SSAO_ENABLED = false;
const DOF_ENABLED = false;
const MOTION_BLUR_ENABLED = false;

const RENDER_TARGET_FORMAT = THREE.RGBAFormat;
const RENDER_TARGET_TYPE = THREE.FloatType;
const RENDER_TARGET_MIN_FILTER = THREE.LinearFilter;
const RENDER_TARGET_MAG_FILTER = THREE.LinearFilter;

const CAMERA_FOV = 60;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 5000;
const CAMERA_ASPECT_MIN = 0.5;
const CAMERA_ASPECT_MAX = 2.0;

const RAYCAST_THRESHOLD = 0.01;
const RAYCAST_MAX_DISTANCE = 5000;
const HOVER_RADIUS_MULTIPLIER = 1.5;

const DRAG_ELASTICITY = 0.1;
const DRAG_DAMPING = 0.9;
const DRAG_MAX_FORCE = 100;
const DRAG_RELEASE_VELOCITY = 0.5;

const SPRING_STIFFNESS = 0.1;
const SPRING_DAMPING = 0.8;
const SPRING_MASS = 1.0;

const CHARGE_STRENGTH = -30;
const LINK_DISTANCE = 30;
const LINK_STRENGTH = 0.7;
const CENTER_STRENGTH = 0.1;
const COLLISION_RADIUS = 5;

const CLUSTER_ANCHOR_STRENGTH = 0.3;
const CLUSTER_ANCHOR_RADIUS = 50;
const CLUSTER_CHARGE = -10;

const LINK_FORCE_CORE = 0.5;
const LINK_FORCE_MEMORY = 0.4;
const LINK_FORCE_RELAY = 0.6;
const LINK_FORCE_HIGHWAY = 0.8;

const SIMULATION_TICK_RATE = 60;
const SIMULATION_SUB_STEPS = 4;
const SIMULATION_TIME_STEP = 1 / 60;

const VELOCITY_DECAY_LINEAR = 0.95;
const VELOCITY_DECAY_ANGULAR = 0.9;
const MAX_VELOCITY = 50;

const INIT_DELAY_MS = 100;
const ASSET_LOAD_TIMEOUT = 5000;
const SCENE_REVEAL_DELAY = 560;
const BLOOM_LOAD_DELAY = 100;

const DISPOSE_DELAY_MS = 1100;
const GEOMETRY_DISPOSE_BATCH = 10;
const TEXTURE_DISPOSE_BATCH = 5;
const MATERIAL_DISPOSE_BATCH = 10;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const ERROR_REPORT_TIMEOUT = 5000;

const ARIA_LABELS = {
  canvas: "Interactive 3D topology of AGI research lab with 540 nodes",
  viewButton: (view: string) => `Switch to ${view} view`,
  orbitToggle: (enabled: boolean) => enabled ? "Pause auto-orbit" : "Resume auto-orbit",
  nodeHover: (id: string) => `Node ${id}`,
  nodeSelect: (id: string) => `Select node ${id}`,
  closeInspector: "Close node inspector",
  reload: "Reload the topology",
} as const

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const REDUCED_MOTION_TRANSITION_MULTIPLIER = 0.1;

const TOUCH_DRAG_THRESHOLD = 10;
const TOUCH_ZOOM_SENSITIVITY = 1.5;
const TOUCH_ROTATE_SENSITIVITY = 1.2;
const TOUCH_PAN_SENSITIVITY = 1.0;

const ORIENTATION_DEBOUNCE_MS = 200;
const ORIENTATION_CAMERA_ADJUST = true;

const SAFE_AREA_TOP = "env(safe-area-inset-top)";
const SAFE_AREA_BOTTOM = "env(safe-area-inset-bottom)";
const SAFE_AREA_LEFT = "env(safe-area-inset-left)";
const SAFE_AREA_RIGHT = "env(safe-area-inset-right)";

const BREAKPOINT_SM = 640;
const BREAKPOINT_MD = 768;
const BREAKPOINT_LG = 1024;
const BREAKPOINT_XL = 1280;
const BREAKPOINT_2XL = 1536;

const CONTAINER_SM = 400;
const CONTAINER_MD = 600;
const CONTAINER_LG = 800;
;
;
;
;
;














interface NodeVisual {
  mesh: THREE.Mesh;
  glowMaterial: THREE.SpriteMaterial;
  cage?: THREE.Mesh;
  baseColor: THREE.Color;
  baseEmissive: THREE.Color;
}

function getZoneColor(zone: LabNode["zone"], clusterId: number): THREE.Color {
  switch (zone) {
    case "core":
      return new THREE.Color(0xffd700);
    case "memory":
      const hues = [0.08, 0.15, 0.22, 0.3, 0.45, 0.55, 0.65];
      return new THREE.Color().setHSL(hues[clusterId - 1] ?? 0.1, 0.85, 0.55);
    case "relay":
      return new THREE.Color(0xa78bfa);
    case "gateway":
      return new THREE.Color(0xfbbf24);
    default:
      return new THREE.Color(0x22d3ee);
  }
}

function createNodeVisual(node: LabNode, assets: LabAssets): NodeVisual {
  const baseColor = getZoneColor(node.zone, node.clusterId);
  const baseEmissive = baseColor.clone().multiplyScalar(0.3);

  const geometry = assets.geometries.sphere;
  const material = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: baseEmissive,
    emissiveIntensity: 0.4,
    metalness: 0.2,
    roughness: 0.3,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    transparent: true,
    opacity: 0.95,
    transmission: 0.1,
    thickness: 0.5,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(node.radius);
  mesh.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
  mesh.renderOrder = 1;

  const glowMaterial = new THREE.SpriteMaterial({
    map: assets.glowTexture,
    color: baseColor,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  return { mesh, glowMaterial, baseColor, baseEmissive };

const fpsGoodStyle = { color: "rgb(34 197 94)" };
const fpsWarnStyle = { color: "rgb(251 191 36)" };
const fpsBadStyle = { color: "rgb(239 68 68)" };

const KEYBOARD_SHORTCUTS = [
  { key: "1", action: "Lattice view" },
  { key: "2", action: "Core view" },
  { key: "3", action: "Memory view" },
  { key: "4", action: "Immersion view" },
  { key: "Space", action: "Toggle auto-orbit" },
  { key: "R", action: "Reset view" },
  { key: "Esc", action: "Deselect node" },
] as const;

const CLUSTER_NAMES = [
  "EPISODIC", "SEMANTIC", "PROCEDURAL", "WORKING",
  "REFERENCE", "ASSOCIATIVE", "TEMPORAL",
] as const;

const VIEW_TRANSITION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const VIEW_TRANSITION_DURATION = 1500;
const HOVER_TRANSITION_DURATION = 150;
const SELECTION_TRANSITION_DURATION = 200;
const HOVER_DEBOUNCE_MS = 50;
const CLICK_DEBOUNCE_MS = 100;
const RESIZE_DEBOUNCE_MS = 100;




}

function BrandMark() {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/5 shadow-[0_0_24px_-8px_rgba(34,211,238,0.6)]">
      <div className="absolute h-7 w-7 rounded-full border border-dashed border-cyan-200/20 animate-spin" />
      <div className="absolute h-4 w-4 rounded-full border border-amber-200/25 animate-spin-reverse" />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_2px_rgba(103,232,249,0.7)]" />
      <div className="absolute h-0.75 w-0.75 rounded-full bg-amber-200 shadow-[0_0_6px_1px_rgba(251,191,36,0.7)] translate-x-3 -translate-y-3" />
    </div>
  );
}

function HudStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-2 py-2">
      <span className="text-[7px] text-slate-500">{label}</span>
      <p className="mt-1 truncate text-[11px] text-slate-100 font-mono">{value}</p>
    </div>
  );
}

function ViewButton({
  id,
  label,
  active,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-all duration-300 ${
        active
          ? "bg-cyan-400/20 text-cyan-100 border border-cyan-300/30 shadow-[0_0_12px_-2px_rgba(34,211,238,0.5)]"
          : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100 border border-white/10"
      }`}
    >
      {label}
    </button>
  );
}
358: 
359: function InspectorPanel({ node }: { node: LabNode | null }) {
360:   if (!node) return null;
361: 
362:   const neighbors = Array.from(adjacency.get(node.id) ?? [])
363:     .map((id) => nodeById.get(id))
364:     .filter((n): n is LabNode => Boolean(n))
365:     .sort((a, b) => b.radius - a.radius)
366:     .slice(0, 5);
367: 
368:   const zoneColors: Record<LabNode["zone"], string> = {
369:     core: "text-amber-200",
370:     memory: "text-yellow-200",
371:     relay: "text-violet-200",
372:     gateway: "text-yellow-300",
373:   };
374: 
375:   return (
376:     <div
377:       className="pointer-events-auto absolute right-4 top-1/2 z-30 -translate-y-1/2 w-72 max-h-[70vh] overflow-auto glass-panel glass-panel-strong rounded-2xl p-4"
378:       style={{ backdropFilter: "blur(12px)" }}
379:     >
380:       <div className="flex items-center justify-between mb-3">
381:         <h3 className="font-semibold text-slate-50">NODE INSPECTOR</h3>
382:         <button
383:           onClick={() => setSelectedId(null)}
384:           className="text-slate-400 hover:text-slate-200"
385:         >
386:           ×
387:         </button>
388:       </div>
389:       <div className="space-y-2 text-sm">
390:         <div className="flex justify-between">
391:           <span className="text-slate-400">ID</span>
392:           <span className="font-mono text-slate-100">{node.id}</span>
393:         </div>
394:         <div className="flex justify-between">
395:           <span className="text-slate-400">Zone</span>
396:           <span className={`font-medium ${zoneColors[node.zone]}`}>{node.zone.toUpperCase()}</span>
397:         </div>
398:         <div className="flex justify-between">
399:           <span className="text-slate-400">Cluster</span>
400:           <span className="font-mono text-slate-100">#{node.clusterId}</span>
401:         </div>
402:         <div className="flex justify-between">
403:           <span className="text-slate-400">Radius</span>
404:           <span className="font-mono text-slate-100">{node.radius.toFixed(2)}</span>
405:         </div>
406:         <div className="flex justify-between">
407:           <span className="text-slate-400">Position</span>
408:           <span className="font-mono text-[10px] text-slate-300">
409:             {node.x?.toFixed(1)}, {node.y?.toFixed(1)}, {node.z?.toFixed(1)}
410:           </span>
411:         </div>
412:         <div className="pt-2 border-t border-white/10">
413:           <p className="text-[10px] text-slate-400 mb-1">NEIGHBORS ({neighbors.length})</p>
414:           <div className="space-y-1 max-h-40 overflow-auto">
415:             {neighbors.map((n) => (
416:               <div
417:                 key={n.id}
418:                 className="flex justify-between text-[11px] px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
419:                 onClick={() => setSelectedId(n.id)}
420:               >
421:                 <span className="font-mono text-slate-300">{n.id}</span>
                <span className={`font-mono ${zoneColors[n.zone]}`}>{n.zone[0].toUpperCase()}</span>
422:               </div>
423:             ))}
424:           </div>
425:         </div>
426:       </div>
427:     </div>
428:   );
429: }
430: 
431: export function NeuralLabGraph() {
  const [webglState, setWebglState] = useState<"checking" | "ready" | "unsupported">("checking");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [graphApi, setGraphApi] = useState<any>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const cameraControlsRef = useRef<TrackballControls | null>(null);
  const assetsRef = useRef<LabAssets | null>(null);
  const materialMapRef = useRef<Map<string, NodeVisual>>(new Map());
  const ringRef = useRef<THREE.Sprite | null>(null);
  const labelsRef = useRef<THREE.Sprite[]>([]);

  const reducedMotionRef = useRef(false);

  const graph = useMemo(() => generateLabTopology(), []);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph]
  );

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of graph.nodes) map.set(node.id, new Set());
    for (const link of graph.links) {
      map.get(link.source)?.add(link.target);
      map.get(link.target)?.add(link.source);
    }
    return map;
  }, [graph]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const focusIdRef = useRef<string | null>(null);
  const adjacencyRef = useRef(adjacency);

  adjacencyRef.current = adjacency;
  focusIdRef.current = hoveredId ?? selectedId;

  const activeFocusId = hoveredId ?? selectedId;
  const focusNode = activeFocusId ? nodeById.get(activeFocusId) : undefined;

  useEffect(() => {
    const api = fgRef.current;
    if (!api || !selectedId) {
      if (ringRef.current) {
        ringRef.current.visible = false;
      }
      return;
    }

    const scene = api.scene();
    const node = nodeById.get(selectedId);
    if (!node || !assetsRef.current) return;

    if (!ringRef.current) {
      const ringMaterial = new THREE.SpriteMaterial({
        map: assetsRef.current.ringTexture,
        color: new THREE.Color(0x22d3ee),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      ringRef.current = new THREE.Sprite(ringMaterial);
      scene.add(ringRef.current);
    }

    const visual = materialMapRef.current.get(selectedId);
    if (visual && ringRef.current) {
      ringRef.current.visible = true;
      ringRef.current.position.copy(visual.mesh.position);
      ringRef.current.scale.setScalar(node.radius * 3.5);
      ringRef.current.material.color.copy(visual.baseColor);
    }
  }, [selectedId, nodeById]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      setWebglState(context ? "ready" : "unsupported");
    } catch {
      setWebglState("unsupported");
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;
    if (media.matches) setAutoOrbit(false);
    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
      if (event.matches) setAutoOrbit(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      switch (event.key.toLowerCase()) {
        case "1":
          applyView("lattice");
          break;
        case "2":
          applyView("core");
          break;
        case "3":
          applyView("memory");
          break;
        case "4":
          applyView("immersion");
          break;
        case " ":
          event.preventDefault();
          setAutoOrbit((prev) => !prev);
          break;
        case "r":
          applyView("lattice", 2000);
          break;
        case "escape":
          setSelectedId(null);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyView]);

  const handleGraphRef = useCallback((instance: any) => {
    fgRef.current = instance;
    setGraphApi(instance);
  }, []);

  const [activeView, setActiveView] = useState<"lattice" | "core" | "memory" | "immersion">("lattice");
  const [autoOrbit, setAutoOrbit] = useState(true);
  const lastInteractionRef = useRef(0);
  const autoOrbitRef = useRef(true);

  const moveCamera = useCallback(
    (target: THREE.Vector3, position: THREE.Vector3, transition = 1500) => {
      const api = fgRef.current;
      if (!api) return;
      api.cameraPosition(
        { x: position.x, y: position.y, z: position.z },
        { x: target.x, y: target.y, z: target.z },
        transition,
      );
      lastInteractionRef.current = performance.now();
    },
    [],
  );

  const applyView = useCallback(
    (view: "lattice" | "core" | "memory" | "immersion", transition = 1500) => {
      const api = fgRef.current;
      if (!api) return;
      const camera = api.camera() as THREE.PerspectiveCamera;
      camera.up.set(0, 1, 0);
      const target = new THREE.Vector3();
      const position = new THREE.Vector3();
      const aspect = size.width / Math.max(1, size.height);

      if (view === "lattice") {
        const distance = aspect < 0.7 ? 1035 : aspect < 1.05 ? 885 : 760;
        target.set(0, 0, 0);
        position.set(0, distance * (aspect < 0.7 ? 0.08 : 0.14), distance);
      } else if (view === "core") {
        const distance = aspect < 0.8 ? 320 : 258;
        target.set(0, 0, 0);
        position.set(0, distance * 0.16, distance);
      } else if (view === "memory") {
        const cluster = graph.nodes.find((n) => n.clusterId === 1);
        if (cluster) {
          target.set(cluster.x ?? 0, cluster.y ?? 0, cluster.z ?? 0);
          const radial = target.clone().normalize();
          const distance = aspect < 0.8 ? 192 : 162;
          position.copy(target).addScaledVector(radial, distance).add(new THREE.Vector3(0, distance * 0.16, 0));
        }
      } else if (view === "immersion") {
        target.set(0, 0, 0);
        position.set(0, 0, 0);
      }

      moveCamera(target, position, transition);
      setActiveView(view);
    },
    [moveCamera, size, graph.nodes],
  );

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  const linkColor = useCallback((link: any) => {
    const focusId = focusIdRef.current;
    if (!focusId) return link.color;
    const source = typeof link.source === "object" ? link.source.id : link.source;
    const target = typeof link.target === "object" ? link.target.id : link.target;
    if (source === focusId || target === focusId) {
      return link.color.replace(/[\d.]+\)$/, "1)");
    }
    return link.color.replace(/[\d.]+\)$/, "0.15)");
  }, []);

  const linkWidth = useCallback((link: any) => {
    const focusId = focusIdRef.current;
    if (!focusId) return link.width;
    const source = typeof link.source === "object" ? link.source.id : link.source;
    const target = typeof link.target === "object" ? link.target.id : link.target;
    return source === focusId || target === focusId ? link.width * 2.5 : link.width * 0.3;
  }, []);

  const linkParticles = useCallback((link: any) => {
    const focusId = focusIdRef.current;
    if (!focusId) return link.particles ?? 4;
    const source = typeof link.source === "object" ? link.source.id : link.source;
    const target = typeof link.target === "object" ? link.target.id : link.target;
    if (source === focusId || target === focusId) return Math.max(link.particles ?? 4, 8);
    return 0;
  }, []);

  const linkCurvature = useCallback((link: any) => link.curvature, []);

  useEffect(() => {
    const api = fgRef.current;
    if (!api) return;

    const renderer = api.renderer();
    const scene = api.scene();
    const camera = api.camera() as THREE.PerspectiveCamera;

    if (!assetsRef.current) {
      assetsRef.current = createLabAssets();
    }
    const assets = assetsRef.current;

    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 3.5;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.15;
    controls.minDistance = 30;
    controls.maxDistance = 2000;
    cameraControlsRef.current = controls;

    const canvas = renderer.domElement;
    const [contextLost, setContextLost] = useState(false);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const node of graph.nodes) {
      const visual = createNodeVisual(node, assets);
      materialMapRef.current.set(node.id, visual);
      scene.add(visual.mesh);
      const glowSprite = new THREE.Sprite(visual.glowMaterial);
      glowSprite.scale.setScalar(node.radius * 2.8);
      glowSprite.position.copy(visual.mesh.position);
      visual.mesh.add(glowSprite);
    }

    const clusterAnchors = new Map<number, THREE.Vector3>();
    for (const node of graph.nodes) {
      if (node.zone === "memory" && !clusterAnchors.has(node.clusterId)) {
        clusterAnchors.set(node.clusterId, new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0));
      }
    }

    const clusterNames = [
      "EPISODIC", "SEMANTIC", "PROCEDURAL", "WORKING",
      "REFERENCE", "ASSOCIATIVE", "TEMPORAL"
    ];

    clusterAnchors.forEach((anchor, clusterId) => {
      if (clusterId >= 1 && clusterId <= 7) {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        ctx.font = "bold 28px 'JetBrains Mono', monospace";
        ctx.fillStyle = "#22d3ee";
        ctx.textAlign = "center";
        ctx.fillText(clusterNames[clusterId - 1], 128, 42);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(anchor).add(new THREE.Vector3(0, 50, 0));
        sprite.scale.set(120, 30, 1);
        scene.add(sprite);
        labelsRef.current.push(sprite);
      }
    });

    const starGeometry = new THREE.BufferGeometry();
    const starCount = 3000;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 800 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);
      starSizes[i] = 0.5 + Math.random() * 2;
      const colorChoice = Math.random();
      if (colorChoice < 0.4) {
        starColors[i * 3] = 0.2; starColors[i * 3 + 1] = 0.8; starColors[i * 3 + 2] = 1.0;
      } else if (colorChoice < 0.7) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.75; starColors[i * 3 + 2] = 0.2;
      } else {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("size", new THREE.BufferAttribute(starSizes, 1));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
    labelsRef.current.push(starField as unknown as THREE.Sprite);

    const composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.68,
      0.62,
      0.22
    );
    composer.addPass(bloomPass);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();

      if (autoOrbitRef.current && activeView === "lattice") {
        const now = performance.now();
        if (now - lastInteractionRef.current > 2500) {
          const camera = api.camera() as THREE.PerspectiveCamera;
          const target = controls.target;
          const offset = new THREE.Vector3().subVectors(camera.position, target);
          const axis = new THREE.Vector3(0.22, 0.95, 0.12).normalize();
          const angle = 0.00015;
          offset.applyAxisAngle(axis, angle);
          camera.up.applyAxisAngle(axis, angle);
          camera.position.copy(target).add(offset);
          camera.lookAt(target);
        }
      }

      composer.render();
    };
    animate();

    setSceneReady(true);

    return () => {
      controls.dispose();
      composer.dispose();
      bloomPass.dispose();
      for (const visual of materialMapRef.current.values()) {
        visual.mesh.material.dispose();
        visual.glowMaterial.dispose();
        visual.cage?.material.dispose();
        scene.remove(visual.mesh);
      }
      materialMapRef.current.clear();
      for (const label of labelsRef.current) {
        scene.remove(label);
        label.material.map?.dispose();
        label.material.dispose();
      }
      labelsRef.current = [];
      if (ringRef.current) {
        scene.remove(ringRef.current);
        ringRef.current.material.dispose();
        ringRef.current = null;
      }
      for (const geometry of Object.values(assets.geometries)) {
        geometry.dispose();
      }
      assets.glowTexture.dispose();
      assets.ringTexture.dispose();
      assetsRef.current = null;
    };
  }, [graph, size]);

  if (webglState !== "ready" || size.width === 0) {
    return (
      <div ref={stageRef} className="graph-stage absolute inset-0 bg-black" />
    );
  }

  const coreCount = graph.nodes.filter((n) => n.zone === "core").length;
  const memoryCount = graph.nodes.filter((n) => n.zone === "memory").length;
  const relayCount = graph.nodes.filter((n) => n.zone === "relay").length;
  const gatewayCount = graph.nodes.filter((n) => n.zone === "gateway").length;
  const linkCount = graph.links.length;

  return (
    <div ref={stageRef} className="relative h-screen w-full overflow-hidden bg-lab-void">
      <div className="graph-stage absolute inset-0 z-0 bg-lab-void">
        <ForceGraph3D
          ref={handleGraphRef}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor="#030508"
          nodeId="id"
          nodeVal="radius"
          nodeThreeObject={(node) => {
            const visual = materialMapRef.current.get(node.id);
            if (visual) {
              visual.mesh.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
              return visual.mesh;
            }
            const mesh = new THREE.Mesh(
              new THREE.SphereGeometry(node.radius, 16, 16),
              new THREE.MeshBasicMaterial({ color: 0x22d3ee })
            );
            mesh.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
            return mesh;
          }}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={linkCurvature}
          linkDirectionalParticles={linkParticles}
          enableNodeDrag
          onNodeHover={(node) => setHoveredId(node?.id ?? null)}
          onNodeClick={(node) => setSelectedId(node?.id ?? null)}
          onBackgroundClick={() => setSelectedId(null)}
          d3AlphaDecay={0.021}
          d3VelocityDecay={0.28}
        />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxkZWZzPjxwYXR0ZXJuIGlkPSJub2lzZSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQiIGhlaWdodD0iNCI+PHJlY3Qgd2lkdGg9IjQiIGhlaWdodD0iNCIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMDAuMDMiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjbm9pc2UpIi8+PC9zdmc+')",
          }}
        />
      </div>

      <div
        className="pointer-events-auto absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-200/60">
                  Neural Systems
                </span>
                <span className="hidden h-px w-5 bg-cyan-300/20 sm:block" />
                <span className="hidden font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500 sm:inline">
                  Seed 42
                </span>
              </div>
              <h1 className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-50 sm:text-[14px] sm:tracking-[0.18em]">
                AGI Lab <span className="text-cyan-300/40">/</span> Cognition Mesh
              </h1>
              <p className="mt-1 hidden text-[9px] leading-relaxed text-slate-500 md:block">
                540-node deterministic topology · 7 agentic memory satellites · 720° trackball
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-1 backdrop-blur-sm">
              <ViewButton
                id="lattice"
                label="Lattice"
                active={activeView === "lattice"}
                onClick={() => applyView("lattice")}
              />
              <ViewButton
                id="core"
                label="Core"
                active={activeView === "core"}
                onClick={() => applyView("core")}
              />
              <ViewButton
                id="memory"
                label="Memory"
                active={activeView === "memory"}
                onClick={() => applyView("memory")}
              />
              <ViewButton
                id="immersion"
                label="Immersion"
                active={activeView === "immersion"}
                onClick={() => applyView("immersion")}
              />
            </div>

            <div className="hidden items-center gap-3 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur-sm sm:flex">
              <HudStat label="Nodes" value={graph.nodes.length} />
              <span className="h-4 w-px bg-white/10 mx-1" />
              <HudStat label="Edges" value={linkCount} />
              <span className="h-4 w-px bg-white/10 mx-1" />
              <HudStat label="FPS" value="60" />
            </div>
          </div>
        </header>

        <footer className="flex items-end justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-amber-300/20 bg-amber-400/5 px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-amber-200">
              {activeView.toUpperCase()} VIEW
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-400/5 px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-cyan-200">
              {autoOrbit ? "AUTO ORBIT" : "MANUAL"}
            </div>
            <button
              type="button"
              onClick={() => setAutoOrbit(!autoOrbit)}
              className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.15em] text-slate-300 hover:text-slate-100 hover:border-white/20 transition"
            >
              {autoOrbit ? "PAUSE" : "RESUME"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 text-right">
            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 backdrop-blur-sm">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">CORE NODES</p>
              <p className="text-xl font-mono text-cyan-200">{coreCount}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 backdrop-blur-sm">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">MEMORY</p>
              <p className="text-xl font-mono text-amber-200">{memoryCount}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 backdrop-blur-sm">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">RELAYS</p>
              <p className="text-xl font-mono text-violet-200">{relayCount}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 backdrop-blur-sm">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">GATEWAYS</p>
              <p className="text-xl font-mono text-yellow-200">{gatewayCount}</p>
            </div>
          </div>
        </footer>
      </div>
      <InspectorPanel
        node={selectedId ? nodeById.get(selectedId) ?? null : null}
        nodeById={nodeById}
        adjacency={adjacency}
        onClose={() => setSelectedId(null)}
        onSelect={setSelectedId}
      />
    </div>
  );
}
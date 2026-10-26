"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

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
  return {
    geometries: {
      sphere: new THREE.SphereGeometry(1, 16, 16),
    },
    glowTexture: new THREE.Texture(),
    ringTexture: new THREE.Texture(),
  };
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function NeuralLabGraph() {
  const [webglState, setWebglState] = useState<"checking" | "ready" | "unsupported">("checking");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [graphApi, setGraphApi] = useState<any>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const graph = useMemo(() => generateLabTopology(), []);

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
  }, []);

  const handleGraphRef = useCallback((instance: any) => {
    setGraphApi(instance);
  }, []);

  if (webglState !== "ready" || size.width === 0) {
    return (
      <div ref={stageRef} className="graph-stage absolute inset-0 bg-black" />
    );
  }

  return (
    <div ref={stageRef} className="graph-stage absolute inset-0 bg-black">
      <ForceGraph3D
        ref={handleGraphRef}
        graphData={graph}
        width={size.width}
        height={size.height}
        backgroundColor="#030508"
        nodeId="id"
        nodeVal="radius"
        nodeThreeObject={(node) => {
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(node.radius, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x22d3ee })
          );
          mesh.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
          return mesh;
        }}
        linkColor="color"
        linkWidth="width"
        linkCurvature="curvature"
        enableNodeDrag
        d3AlphaDecay={0.021}
        d3VelocityDecay={0.28}
      />
    </div>
  );
}
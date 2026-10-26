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
  const nodes: LabNode[] = [];
  const links: LabLink[] = [];

  // Core nodes (180)
  for (let i = 0; i < 180; i++) {
    nodes.push({
      id: `core-${i}`,
      zone: "core",
      clusterId: 0,
      radius: 1.2 + Math.random() * 0.8,
      label: `Core ${i}`,
    });
  }

  // Memory satellites (7 * 45 = 315)
  for (let s = 0; s < 7; s++) {
    for (let i = 0; i < 45; i++) {
      nodes.push({
        id: `mem-${s}-${i}`,
        zone: "memory",
        clusterId: s + 1,
        radius: 0.8 + Math.random() * 0.6,
        label: `Mem ${s}-${i}`,
      });
    }
  }

  // Relays (42)
  for (let i = 0; i < 42; i++) {
    nodes.push({
      id: `relay-${i}`,
      zone: "relay",
      clusterId: 8,
      radius: 1.0,
      label: `Relay ${i}`,
    });
  }

  // Gateways (3)
  for (let i = 0; i < 3; i++) {
    nodes.push({
      id: `gateway-${i}`,
      zone: "gateway",
      clusterId: 9,
      radius: 2.0,
      label: `Gateway ${i}`,
    });
  }

  // Simple links for now
  for (let i = 0; i < nodes.length - 1; i++) {
    links.push({
      source: nodes[i].id,
      target: nodes[i + 1].id,
      width: 0.5,
      curvature: 0.2,
      kind: "core",
      color: "#22d3ee80",
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
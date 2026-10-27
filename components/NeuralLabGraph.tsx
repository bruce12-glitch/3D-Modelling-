"use client";

import dynamic from "next/dynamic";
import type { ComponentType, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods, ForceGraphProps } from "react-force-graph-3d";
import * as THREE from "three";
import type { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { ContextLostBanner, FatalOverlay, GraphSkeleton, WebGLFallback } from "@/components/lab/Fallbacks";
import { Header, ShortcutHint, ViewSwitcher, ZoneStats } from "@/components/lab/Hud";
import { InspectorPanel } from "@/components/lab/InspectorPanel";
import { LabScene } from "@/lib/lab/LabScene";
import {
  INTRO_DURATION_MS,
  ORBIT_IDLE_MS,
  applyIntro,
  applyOrbit,
  presetPose,
  satelliteHeads,
  type Pose,
} from "@/lib/lab/camera";
import { CLUSTER_NAMES, LINK_COLORS, ZONE_COLORS, ZONE_LABELS, nodeColorHex } from "@/lib/lab/palette";
import { generateLabTopology } from "@/lib/lab/topology";
import type { LabLink, LabNode, LinkKind, ViewMode } from "@/lib/lab/types";

type FGMethods = ForceGraphMethods;
type FGProps = ForceGraphProps & { ref?: MutableRefObject<FGMethods | undefined> };

const ForceGraph3D = dynamic(
  () => import("react-force-graph-3d") as unknown as Promise<{ default: ComponentType<FGProps> }>,
  { ssr: false, loading: () => null },
);

const PARTICLE_SPEED: Record<LinkKind, number> = {
  core: 0.003,
  memory: 0.0035,
  relay: 0.005,
  highway: 0.008,
};

const endId = (end: unknown): string =>
  typeof end === "object" && end !== null ? (end as { id: string }).id : String(end);

const EMPTY: ReadonlySet<string> = new Set();

function tooltip(node: LabNode): string {
  const color = nodeColorHex(node.zone, node.clusterId);
  const region = node.zone === "memory" ? CLUSTER_NAMES[node.clusterId - 1] : ZONE_LABELS[node.zone];
  return `<div class="lab-tip"><span class="lab-tip-dot" style="background:${color};box-shadow:0 0 8px ${color}"></span><b>${node.label}</b><i>${region} · deg ${node.degree}</i></div>`;
}

export default function NeuralLabGraph() {
  const graph = useMemo(() => generateLabTopology(), []);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of graph.nodes) map.set(n.id, new Set());
    for (const l of graph.links) {
      map.get(l.source)?.add(l.target);
      map.get(l.target)?.add(l.source);
    }
    return map;
  }, [graph]);
  const counts = useMemo(
    () =>
      (["core", "memory", "relay", "gateway"] as const).map((zone) => ({
        label: zone === "memory" ? "Memory" : zone === "core" ? "Core" : zone === "relay" ? "Relays" : "Gateways",
        value: graph.nodes.filter((n) => n.zone === zone).length,
        color: ZONE_COLORS[zone],
      })),
    [graph],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [webgl, setWebgl] = useState<"checking" | "ready" | "unsupported">("checking");
  const [lab, setLab] = useState<LabScene | null>(null);
  const [fg, setFg] = useState<FGMethods | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const [view, setView] = useState<ViewMode>("lattice");
  const [satellite, setSatellite] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [introActive, setIntroActive] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  // Mutable mirrors read by the animation loop and stable callbacks.
  const sizeRef = useRef(size);
  const autoOrbitRef = useRef(autoOrbit);
  const selectedRef = useRef<string | null>(null);
  const reducedMotionRef = useRef(false);
  const introRef = useRef<{ start: number; final: Pose } | null>(null);
  const lastInteractionRef = useRef(0);
  const tweenUntilRef = useRef(0);
  const fgRef = useRef<FGMethods | null>(null);
  sizeRef.current = size;
  autoOrbitRef.current = autoOrbit;
  selectedRef.current = selectedId;
  fgRef.current = fg;

  // ── Stage sizing ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const width = Math.max(1, Math.round(r.width));
      const height = Math.max(1, Math.round(r.height));
      setSize((p) => (p.width === width && p.height === height ? p : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Capability detection + scene assets (client only: needs `document`) ──
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;
    if (media.matches) setAutoOrbit(false);
    const onMotion = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
      if (e.matches) setAutoOrbit(false);
    };
    media.addEventListener("change", onMotion);

    let supported = false;
    try {
      const probe = document.createElement("canvas");
      supported = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
    } catch {
      supported = false;
    }
    setWebgl(supported ? "ready" : "unsupported");

    let scene: LabScene | null = null;
    if (supported) {
      try {
        scene = new LabScene(graph);
        setLab(scene);
      } catch (error) {
        setFatal(error instanceof Error ? error.message : "Failed to build the 3D scene.");
      }
    }
    return () => {
      media.removeEventListener("change", onMotion);
      scene?.dispose();
      setLab(null);
      setFg(null);
      setReady(false);
    };
  }, [graph, attempt]);

  // ── Camera helpers ──
  const flyTo = useCallback((pose: Pose, ms = 1700) => {
    const api = fgRef.current;
    if (!api) return;
    const duration = reducedMotionRef.current ? 0 : ms;
    introRef.current = null;
    setIntroActive(false);
    const now = performance.now();
    tweenUntilRef.current = now + duration + 150;
    lastInteractionRef.current = now;
    api.cameraPosition(
      { x: pose.position.x, y: pose.position.y, z: pose.position.z },
      { x: pose.target.x, y: pose.target.y, z: pose.target.z },
      duration,
    );
  }, []);

  const applyView = useCallback(
    (next: ViewMode, sat?: number, ms?: number) => {
      const index = sat ?? satellite;
      const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
      setView(next);
      if (sat !== undefined) setSatellite(sat);
      flyTo(presetPose(next, aspect, graph, index), ms);
    },
    [flyTo, graph, satellite],
  );

  const flyToNode = useCallback(
    (id: string) => {
      const node = nodeById.get(id);
      if (!node) return;
      const target = new THREE.Vector3(node.x, node.y, node.z);
      const dir = target.clone().normalize();
      const position = target.clone().addScaledVector(dir, node.zone === "memory" ? 70 : 60);
      position.y += 14;
      flyTo({ position, target }, 1400);
    },
    [flyTo, nodeById],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) flyToNode(id);
    },
    [flyToNode],
  );

  // ── Renderer wiring, post-processing and the frame loop ──
  useEffect(() => {
    if (!fg || !lab) return;
    let raf = 0;
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    try {
      const renderer = fg.renderer();
      const camera = fg.camera() as THREE.PerspectiveCamera;
      const controls = fg.controls() as unknown as TrackballControls;
      lab.install(fg.scene());

      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const composer = fg.postProcessingComposer();
      for (const target of [composer.renderTarget1, composer.renderTarget2]) {
        target.samples = 4; // MSAA on the post-processing targets
        target.dispose();
      }
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(sizeRef.current.width, sizeRef.current.height),
        0.6,
        0.6,
        0.3,
      );
      const output = new OutputPass();
      composer.addPass(bloom);
      composer.addPass(output);
      cleanups.push(() => {
        composer.removePass(bloom);
        composer.removePass(output);
        bloom.dispose();
        output.dispose();
        renderer.toneMapping = THREE.NoToneMapping;
      });

      controls.rotateSpeed = 2.6;
      controls.zoomSpeed = 1.1;
      controls.panSpeed = 0.7;
      controls.dynamicDampingFactor = 0.12;
      controls.minDistance = 24;
      controls.maxDistance = 2800;

      const canvas = renderer.domElement;
      const onLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onRestored = () => setContextLost(false);
      canvas.addEventListener("webglcontextlost", onLost);
      canvas.addEventListener("webglcontextrestored", onRestored);
      cleanups.push(() => {
        canvas.removeEventListener("webglcontextlost", onLost);
        canvas.removeEventListener("webglcontextrestored", onRestored);
      });

      // Any user input takes control from the scripted reveal and pauses idle orbit.
      const touch = () => {
        lastInteractionRef.current = performance.now();
        if (introRef.current) {
          introRef.current = null;
          setIntroActive(false);
        }
      };
      const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
      events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
      cleanups.push(() => events.forEach((e) => window.removeEventListener(e, touch)));

      // Opening shot: the 720° reveal (or a direct cut when motion is reduced).
      const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height);
      const final = presetPose("lattice", aspect, graph);
      if (reducedMotionRef.current) {
        camera.position.copy(final.position);
        camera.lookAt(final.target);
      } else {
        introRef.current = { start: performance.now(), final };
        applyIntro(0, final, camera);
        setIntroActive(true);
      }
      lastInteractionRef.current = performance.now();

      const up = new THREE.Vector3(0, 1, 0);
      let last = performance.now();
      let frames = 0;
      let windowStart = last;
      let warm = 0;
      const loop = (now: number) => {
        if (cancelled) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        const intro = introRef.current;
        if (intro) {
          const p = (now - intro.start) / INTRO_DURATION_MS;
          applyIntro(p, intro.final, camera);
          if (p >= 1) {
            introRef.current = null;
            lastInteractionRef.current = now;
            setIntroActive(false);
          }
        } else if (now < tweenUntilRef.current) {
          camera.up.lerp(up, 1 - Math.exp(-dt * 4)).normalize();
        } else if (
          autoOrbitRef.current &&
          !reducedMotionRef.current &&
          !selectedRef.current &&
          now - lastInteractionRef.current > ORBIT_IDLE_MS
        ) {
          applyOrbit(dt, camera, controls.target);
        }

        lab.update(dt, camera, renderer);

        frames++;
        if (now - windowStart >= 1000) {
          setFps(Math.round((frames * 1000) / (now - windowStart)));
          frames = 0;
          windowStart = now;
        }
        if (warm < 3 && ++warm === 3) setReady(true);
      };
      raf = requestAnimationFrame(loop);
    } catch (error) {
      setFatal(error instanceof Error ? error.message : "The renderer failed to initialise.");
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
    };
  }, [fg, lab, graph]);

  // ── Focus / selection → scene + link styling ──
  const focusId = hoveredId ?? selectedId;
  useEffect(() => {
    lab?.setFocus({ primary: focusId, neighbors: focusId ? (adjacency.get(focusId) ?? EMPTY) : EMPTY });
  }, [lab, focusId, adjacency]);
  useEffect(() => {
    lab?.setSelected(selectedId);
  }, [lab, selectedId]);

  const isLit = useCallback(
    (l: object) => {
      const link = l as LabLink;
      return focusId !== null && (endId(link.source) === focusId || endId(link.target) === focusId);
    },
    [focusId],
  );
  const linkColor = useCallback(
    (l: object) => {
      const palette = LINK_COLORS[(l as LabLink).kind];
      return focusId === null ? palette.base : isLit(l) ? palette.lit : palette.dim;
    },
    [focusId, isLit],
  );
  const linkParticles = useCallback(
    (l: object) => {
      const base = (l as LabLink).particles;
      return focusId === null ? base : isLit(l) ? Math.max(base, 2) + 1 : 0;
    },
    [focusId, isLit],
  );
  const linkWidth = useCallback((l: object) => (l as LabLink).width, []);
  const linkSpeed = useCallback((l: object) => PARTICLE_SPEED[(l as LabLink).kind], []);
  const linkParticleColor = useCallback((l: object) => LINK_COLORS[(l as LabLink).kind].lit, []);
  const nodeLabel = useCallback((n: object) => tooltip(n as LabNode), []);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const heads = satelliteHeads(graph).length;
      switch (e.key.toLowerCase()) {
        case "1": applyView("lattice"); break;
        case "2": applyView("core"); break;
        case "3": applyView("memory"); break;
        case "4": applyView("immersion"); break;
        case "arrowright":
          if (view === "memory") applyView("memory", (satellite + 1) % heads);
          break;
        case "arrowleft":
          if (view === "memory") applyView("memory", (satellite + heads - 1) % heads);
          break;
        case "r": setSelectedId(null); applyView("lattice", undefined, 2000); break;
        case "escape": setSelectedId(null); break;
        case " ":
          if (t instanceof HTMLButtonElement) return;
          e.preventDefault();
          setAutoOrbit((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyView, graph, satellite, view]);

  const setGraphRef = useCallback((instance: FGMethods | null | undefined) => {
    setFg(instance ?? null);
  }, []);

  if (webgl === "unsupported") return <WebGLFallback />;

  const selected = selectedId ? (nodeById.get(selectedId) ?? null) : null;
  const neighbors = selected
    ? Array.from(adjacency.get(selected.id) ?? [])
        .map((id) => nodeById.get(id))
        .filter((n): n is LabNode => Boolean(n))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 8)
    : [];

  return (
    <div ref={stageRef} className="relative h-dvh w-full overflow-hidden bg-lab-void">
      <div className="graph-stage absolute inset-0 z-0">
        {lab && size.width > 0 && (
          <ForceGraph3D
            key={attempt}
            ref={setGraphRef as unknown as MutableRefObject<FGMethods | undefined>}
            graphData={graph}
            width={size.width}
            height={size.height}
            backgroundColor="#030508"
            showNavInfo={false}
            rendererConfig={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            nodeId="id"
            nodeThreeObject={lab.nodeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={nodeLabel}
            linkColor={linkColor}
            linkOpacity={1}
            linkWidth={linkWidth}
            linkCurvature="curvature"
            linkCurveRotation="rotation"
            linkDirectionalParticles={linkParticles}
            linkDirectionalParticleSpeed={linkSpeed}
            linkDirectionalParticleColor={linkParticleColor}
            linkDirectionalParticleWidth={1.8}
            linkDirectionalParticleResolution={6}
            enableNodeDrag={false}
            warmupTicks={0}
            cooldownTicks={0}
            onNodeHover={(n) => setHoveredId(n ? (n as LabNode).id : null)}
            onNodeClick={(n) => select((n as LabNode).id)}
            onBackgroundClick={() => setSelectedId(null)}
          />
        )}
      </div>

      <div aria-hidden="true" className="vignette pointer-events-none absolute inset-0 z-10" />
      <div aria-hidden="true" className="lab-scanlines pointer-events-none absolute inset-0 z-10 opacity-60" />

      <div
        className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto">
          <Header fps={fps} nodes={graph.nodes.length} links={graph.links.length} />
        </div>

        {introActive && (
          <p className="hud-label hud-enter absolute left-1/2 top-[18%] -translate-x-1/2 text-cyan-100/70">
            Drag, scroll or press any key to take control
          </p>
        )}

        <footer className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <ViewSwitcher
              view={view}
              satellite={satellite}
              autoOrbit={autoOrbit}
              onView={(v) => applyView(v)}
              onSatellite={(i) => applyView("memory", i)}
              onToggleOrbit={() => setAutoOrbit((v) => !v)}
              onReset={() => {
                setSelectedId(null);
                applyView("lattice", undefined, 2000);
              }}
            />
            <ShortcutHint />
          </div>
          <ZoneStats counts={counts} />
        </footer>
      </div>

      <InspectorPanel
        node={selected}
        neighbors={neighbors}
        onClose={() => setSelectedId(null)}
        onSelect={select}
        onFocus={flyToNode}
      />

      {contextLost && <ContextLostBanner />}
      {fatal && (
        <FatalOverlay
          message={fatal}
          onRetry={() => {
            setFatal(null);
            setAttempt((a) => a + 1);
          }}
        />
      )}
      {!ready && !fatal && <GraphSkeleton />}
    </div>
  );
}

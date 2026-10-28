import * as THREE from "three";
import { CLUSTER_COLORS, CLUSTER_NAMES, nodeColorHex } from "./palette";
import { mulberry32 } from "./random";
import { BELT_RADIUS, CORE_RADIUS, discNormalOf } from "./topology";
import { createGlowTexture, createLabelTexture, createRingTexture } from "./textures";
import type { GraphData, LabNode } from "./types";

const HALO_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aBoost;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform vec3 uWaveOrigin;
  uniform float uWaveRadius;
  uniform float uWaveStrength;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vWaveHit;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float distToOrigin = length(position);

    // Continuous outward forward-pass inference wave from core + interactive shockwave
    float globalWave = sin(distToOrigin * 0.045 - uTime * 3.8 + aPhase * 0.35);
    float globalPulse = smoothstep(0.55, 1.0, globalWave) * 0.42;

    float dShock = abs(length(position - uWaveOrigin) - uWaveRadius);
    float shockHit = exp(-dShock * dShock * 0.0012) * uWaveStrength;

    float pulse = 0.85 + 0.18 * sin(uTime * 2.2 + aPhase) + globalPulse + shockHit * 0.85;
    float focus = max(aBoost, 0.0);
    float dim = max(-aBoost, 0.0);
    float size = aSize * pulse * (1.0 + focus * 0.55 + shockHit * 0.7) * (1.0 - dim * 0.45);
    gl_PointSize = clamp(size * uScale / max(-mv.z, 1.0), 1.6, 440.0);
    gl_Position = projectionMatrix * mv;

    vColor = mix(aColor, vec3(0.92, 0.99, 1.0), clamp(shockHit * 0.65 + globalPulse * 0.35, 0.0, 0.85));
    vWaveHit = shockHit + globalPulse;
    float proximity = mix(0.24, 1.0, smoothstep(30.0, 170.0, -mv.z));
    vAlpha = (0.32 + focus * 0.45 + shockHit * 0.5) * pulse * (1.0 - dim * 0.8) * proximity;
  }
`;

const HALO_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vWaveHit;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 6.5);
    float ring = exp(-pow(d - 0.58, 2.0) * 38.0) * clamp(vWaveHit, 0.0, 1.0) * 0.55;
    float falloff = pow(1.0 - d, 2.2);
    gl_FragColor = vec4(vColor, (core * 0.95 + falloff * 0.58 + ring) * vAlpha);
  }
`;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
    vColor = aColor;
    vAlpha = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, pow(1.0 - d, 1.6) * vAlpha * 0.8);
  }
`;

/** GPU-driven radial tensor data stream particles flowing between Core, Belt, and Shards */
const STREAM_VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aOffset;
  attribute float aSpeed;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScale;
  uniform float uBurst;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float t = fract(aOffset + uTime * aSpeed * (1.0 + uBurst * 1.4));
    // Smooth arc lift perpendicular to path
    vec3 mid = mix(aStart, aEnd, 0.5) + normalize(aStart + aEnd + vec3(0.0, 20.0, 0.0)) * 22.0;
    vec3 p0 = mix(aStart, mid, t);
    vec3 p1 = mix(mid, aEnd, t);
    vec3 pos = mix(p0, p1, t);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float edgeFade = sin(t * 3.14159265);
    gl_PointSize = clamp(aSize * (0.7 + 0.6 * edgeFade) * uScale / max(-mv.z, 1.0), 1.5, 90.0);
    vColor = mix(aColor, vec3(1.0), uBurst * 0.45);
    vAlpha = edgeFade * (0.75 + uBurst * 0.25);
  }
`;

const STREAM_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 8.0);
    gl_FragColor = vec4(vColor, (core + pow(1.0 - d, 2.0) * 0.5) * vAlpha);
  }
`;

export interface FocusState {
  primary: string | null;
  neighbors: ReadonlySet<string>;
}

interface BaseCoord {
  x: number;
  y: number;
  z: number;
  phase: number;
  amp: number;
}

export class LabScene {
  readonly root = new THREE.Group();

  private readonly graph: GraphData;
  private readonly indexById = new Map<string, number>();
  private readonly baseCoords: BaseCoord[] = [];
  private readonly groups = new Map<string, THREE.Group>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geometries: Record<LabNode["zone"], THREE.BufferGeometry>;
  private readonly pickGeometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly glowTexture = createGlowTexture();
  private readonly ringTexture = createRingTexture();
  private readonly disposables: Array<{ dispose(): void }> = [];

  private readonly haloMaterial: THREE.ShaderMaterial;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly boostAttribute: THREE.BufferAttribute;
  private readonly boost: Float32Array;
  private readonly targetBoost: Float32Array;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly streamMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly containment: THREE.LineSegments;
  private readonly coreGyros: THREE.Object3D[] = [];
  private readonly satelliteRings: THREE.Object3D[] = [];
  private readonly cages: THREE.Object3D[] = [];
  private readonly labels: { sprite: THREE.Sprite; aspect: number; baseY: number }[] = [];
  private readonly selection: THREE.Sprite;
  private readonly shockwaveMesh: THREE.Mesh;
  private readonly shockwaveMat: THREE.MeshBasicMaterial;
  private readonly size = new THREE.Vector2();

  private selectedId: string | null = null;
  private time = 0;
  private waveRadius = 0;
  private waveStrength = 0;
  private waveActive = false;

  constructor(graph: GraphData) {
    this.graph = graph;
    graph.nodes.forEach((n, i) => this.indexById.set(n.id, i));

    this.geometries = {
      core: new THREE.IcosahedronGeometry(1, 2),
      memory: new THREE.OctahedronGeometry(1.05, 1),
      relay: new THREE.OctahedronGeometry(1.2, 0),
      gateway: new THREE.IcosahedronGeometry(1.1, 1),
    };

    const count = graph.nodes.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    this.boost = new Float32Array(count);
    this.targetBoost = new Float32Array(count);
    const rng = mulberry32(1337);
    const tmp = new THREE.Color();

    graph.nodes.forEach((n, i) => {
      positions.set([n.x, n.y, n.z], i * 3);
      tmp.set(nodeColorHex(n.zone, n.clusterId));
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      sizes[i] = n.radius * (n.hub ? 6.4 : n.zone === "core" ? 2.9 : 4.4);
      const ph = rng() * Math.PI * 2;
      phases[i] = ph;
      this.baseCoords.push({
        x: n.x,
        y: n.y,
        z: n.z,
        phase: ph,
        amp: n.hub ? 1.2 : n.zone === "core" ? 1.8 : 2.6,
      });
    });

    const haloGeometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    haloGeometry.setAttribute("position", this.positionAttribute);
    haloGeometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    haloGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    haloGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.boostAttribute = new THREE.BufferAttribute(this.boost, 1);
    this.boostAttribute.setUsage(THREE.DynamicDrawUsage);
    haloGeometry.setAttribute("aBoost", this.boostAttribute);
    haloGeometry.computeBoundingSphere();

    this.haloMaterial = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uWaveOrigin: { value: new THREE.Vector3(0, 0, 0) },
        uWaveRadius: { value: 0 },
        uWaveStrength: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Points(haloGeometry, this.haloMaterial);
    halo.frustumCulled = false;
    halo.renderOrder = 2;
    this.root.add(halo);
    this.disposables.push(haloGeometry, this.haloMaterial);

    // Expanding 3D Shockwave Sphere for Forward-Pass & Node Selection bursts
    const shockGeo = new THREE.SphereGeometry(1, 32, 24);
    this.shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shockwaveMesh = new THREE.Mesh(shockGeo, this.shockwaveMat);
    this.shockwaveMesh.visible = false;
    this.root.add(this.shockwaveMesh);
    this.disposables.push(shockGeo, this.shockwaveMat);

    // GPU Tensor Stream Particles (high-speed tokens leaping across zones)
    this.streamMaterial = this.buildTensorStreams();

    // Starfield
    const starCount = 3000;
    const sp = new Float32Array(starCount * 3);
    const sc = new Float32Array(starCount * 3);
    const ss = new Float32Array(starCount);
    const sph = new Float32Array(starCount);
    const ssp = new Float32Array(starCount);
    const srng = mulberry32(7);
    for (let i = 0; i < starCount; i++) {
      const r = 1400 + srng() * 2200;
      const theta = srng() * Math.PI * 2;
      const phi = Math.acos(2 * srng() - 1);
      sp.set(
        [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
        i * 3,
      );
      const pick = srng();
      const c =
        pick < 0.5 ? [0.45, 0.82, 1.0] : pick < 0.78 ? [0.68, 0.55, 1.0] : [0.95, 0.98, 1.0];
      sc.set(c, i * 3);
      ss[i] = 1.1 + Math.pow(srng(), 3) * 3.8;
      sph[i] = srng() * Math.PI * 2;
      ssp[i] = 0.5 + srng() * 2.0;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    starGeometry.setAttribute("aColor", new THREE.BufferAttribute(sc, 3));
    starGeometry.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(sph, 1));
    starGeometry.setAttribute("aSpeed", new THREE.BufferAttribute(ssp, 1));
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.root.add(this.stars);
    this.disposables.push(starGeometry, this.starMaterial);

    this.buildNebulae();
    this.buildRingsAndGyros();
    this.buildLabels();

    this.containment = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CORE_RADIUS + 14, 2)),
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.root.add(this.containment);
    this.disposables.push(this.containment.geometry, this.containment.material as THREE.Material);

    const selectionMaterial = new THREE.SpriteMaterial({
      map: this.ringTexture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.selection = new THREE.Sprite(selectionMaterial);
    this.selection.visible = false;
    this.selection.renderOrder = 10;
    this.root.add(this.selection);
    this.disposables.push(selectionMaterial);

    this.root.add(new THREE.AmbientLight(0x93a5c8, 0.8));
    const key = new THREE.DirectionalLight(0xbfe9ff, 2.6);
    key.position.set(220, 320, 260);
    const rim = new THREE.DirectionalLight(0xc084fc, 1.8);
    rim.position.set(-260, -90, -210);
    this.root.add(key, rim);

    // Trigger an initial welcome forward-pass wave on scene boot
    this.triggerWave(new THREE.Vector3(0, 0, 0), "#38bdf8");
  }

  install(scene: THREE.Scene): void {
    scene.add(this.root);
  }

  /** Triggers an expanding 3D tensor wave across the entire topology. */
  triggerWave(origin = new THREE.Vector3(0, 0, 0), colorHex = "#38bdf8"): void {
    this.haloMaterial.uniforms.uWaveOrigin.value.copy(origin);
    this.waveRadius = 4;
    this.waveStrength = 1.0;
    this.waveActive = true;
    this.shockwaveMesh.position.copy(origin);
    this.shockwaveMesh.scale.setScalar(1);
    this.shockwaveMat.color.set(colorHex);
    this.shockwaveMat.opacity = 0.35;
    this.shockwaveMesh.visible = true;
  }

  getBurstIntensity(): number {
    return this.waveStrength;
  }

  nodeObject = (raw: object): THREE.Object3D => {
    const node = raw as LabNode;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.geometries[node.zone], this.materialFor(node));
    mesh.scale.setScalar(node.radius);
    group.add(mesh);

    const pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    pick.scale.setScalar(Math.max(node.radius * 2.6, 4.2));
    group.add(pick);

    if (node.zone === "gateway" || (node.zone === "core" && node.hub)) {
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(node.radius * 1.85, 0)),
        new THREE.LineBasicMaterial({
          color: node.zone === "gateway" ? 0xfde047 : 0x7dd3fc,
          transparent: true,
          opacity: node.zone === "gateway" ? 0.58 : 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      group.add(cage);
      this.cages.push(cage);
      this.disposables.push(cage.geometry, cage.material as THREE.Material);
    }
    this.groups.set(node.id, group);
    return group;
  };

  setFocus({ primary, neighbors }: FocusState): void {
    for (let i = 0; i < this.targetBoost.length; i++) {
      const id = this.graph.nodes[i].id;
      this.targetBoost[i] = !primary ? 0 : id === primary ? 1 : neighbors.has(id) ? 0.6 : -1;
    }
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      this.selection.visible = false;
      return;
    }
    const idx = this.indexById.get(id) ?? -1;
    const node = this.graph.nodes[idx];
    if (!node) return;
    const hex = nodeColorHex(node.zone, node.clusterId);
    this.selection.position.set(node.x, node.y, node.z);
    this.selection.material.color.set(hex);
    this.selection.visible = true;
    this.triggerWave(new THREE.Vector3(node.x, node.y, node.z), hex);
  }

  update(dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
    this.time += dt;
    renderer.getDrawingBufferSize(this.size);
    const scale = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.haloMaterial.uniforms.uScale.value = scale;
    this.haloMaterial.uniforms.uTime.value = this.time;
    this.streamMaterial.uniforms.uScale.value = scale;
    this.streamMaterial.uniforms.uTime.value = this.time;
    this.starMaterial.uniforms.uTime.value = this.time;
    this.starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();

    // Update active forward-pass shockwave
    if (this.waveActive) {
      this.waveRadius += dt * 290;
      this.waveStrength = Math.max(0, 1 - this.waveRadius / 520);
      this.haloMaterial.uniforms.uWaveRadius.value = this.waveRadius;
      this.haloMaterial.uniforms.uWaveStrength.value = this.waveStrength;
      this.streamMaterial.uniforms.uBurst.value = this.waveStrength;

      this.shockwaveMesh.scale.setScalar(Math.max(1, this.waveRadius));
      this.shockwaveMesh.rotation.y += dt * 0.8;
      this.shockwaveMesh.rotation.x += dt * 0.4;
      this.shockwaveMat.opacity = this.waveStrength * 0.22;

      if (this.waveStrength <= 0.005) {
        this.waveActive = false;
        this.shockwaveMesh.visible = false;
        this.haloMaterial.uniforms.uWaveStrength.value = 0;
        this.streamMaterial.uniforms.uBurst.value = 0;
      }
    }

    this.stars.rotation.y = this.time * 0.005;
    this.containment.rotation.y += dt * 0.045;
    this.containment.rotation.x += dt * 0.018;

    // Counter-rotating core gyroscopic rings
    this.coreGyros.forEach((gyro, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      gyro.rotation.z += dt * (0.22 + i * 0.07) * dir;
      gyro.rotation.x += dt * 0.08 * dir;
    });

    // Rotating satellite data rings
    this.satelliteRings.forEach((ring, i) => {
      ring.rotation.z += dt * (i % 2 === 0 ? 0.35 : -0.25);
    });

    for (const cage of this.cages) {
      cage.rotation.y += dt * 0.75;
      cage.rotation.x += dt * 0.45;
    }

    // Harmonic node breathing (keeps the 3D mesh organically alive)
    const posArr = this.positionAttribute.array as Float32Array;
    for (let i = 0; i < this.graph.nodes.length; i++) {
      const n = this.graph.nodes[i];
      const base = this.baseCoords[i];
      const wave = Math.sin(this.time * 1.45 + base.phase);
      const wave2 = Math.cos(this.time * 1.1 + base.phase * 1.3);
      const dx = wave * base.amp * 0.45;
      const dy = wave2 * base.amp * 0.65;
      const dz = wave * base.amp * 0.45;

      const nx = base.x + dx;
      const ny = base.y + dy;
      const nz = base.z + dz;

      posArr[i * 3] = nx;
      posArr[i * 3 + 1] = ny;
      posArr[i * 3 + 2] = nz;

      const group = this.groups.get(n.id);
      if (group) {
        group.position.set(nx, ny, nz);
      }
    }
    this.positionAttribute.needsUpdate = true;

    for (const { sprite, aspect, baseY } of this.labels) {
      sprite.position.y = baseY + Math.sin(this.time * 1.6 + sprite.position.x * 0.02) * 2.5;
      const height = THREE.MathUtils.clamp(
        camera.position.distanceTo(sprite.position) * 0.029,
        5.5,
        28,
      );
      sprite.scale.set(height * aspect, height, 1);
    }

    const k = 1 - Math.exp(-dt * 12);
    let changed = false;
    for (let i = 0; i < this.boost.length; i++) {
      const diff = this.targetBoost[i] - this.boost[i];
      if (Math.abs(diff) > 0.002) {
        this.boost[i] += diff * k;
        changed = true;
        const b = this.boost[i];
        const group = this.groups.get(this.graph.nodes[i].id);
        group?.scale.setScalar(1 + Math.max(b, 0) * 0.65 - Math.max(-b, 0) * 0.22);
      }
    }
    if (changed) this.boostAttribute.needsUpdate = true;

    if (this.selectedId && this.selection.visible) {
      const idx = this.indexById.get(this.selectedId) ?? 0;
      const node = this.graph.nodes[idx];
      const group = this.groups.get(node.id);
      if (group) this.selection.position.copy(group.position);
      const base = node.radius * 2.6 + 7.5;
      this.selection.scale.setScalar(base * (1 + 0.09 * Math.sin(this.time * 4.0)));
      this.selection.material.rotation = this.time * 0.65;
    }
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const m of this.materials.values()) m.dispose();
    for (const g of Object.values(this.geometries)) g.dispose();
    this.pickGeometry.dispose();
    this.pickMaterial.dispose();
    this.glowTexture.dispose();
    this.ringTexture.dispose();
    for (const d of this.disposables) d.dispose();
    this.materials.clear();
    this.groups.clear();
    this.cages.length = 0;
    this.coreGyros.length = 0;
    this.satelliteRings.length = 0;
    this.labels.length = 0;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private buildTensorStreams(): THREE.ShaderMaterial {
    const streamCount = 1400;
    const starts = new Float32Array(streamCount * 3);
    const ends = new Float32Array(streamCount * 3);
    const offsets = new Float32Array(streamCount);
    const speeds = new Float32Array(streamCount);
    const sizes = new Float32Array(streamCount);
    const colors = new Float32Array(streamCount * 3);

    const rng = mulberry32(9001);
    const coreNodes = this.graph.nodes.filter((n) => n.zone === "core");
    const relays = this.graph.nodes.filter((n) => n.zone === "relay");
    const heads = this.heads();
    const gateways = this.graph.nodes.filter((n) => n.zone === "gateway");
    const cTmp = new THREE.Color();

    for (let i = 0; i < streamCount; i++) {
      const mode = rng();
      let a: LabNode;
      let b: LabNode;
      if (mode < 0.42) {
        // Core -> Relay
        a = coreNodes[Math.floor(rng() * coreNodes.length)];
        b = relays[Math.floor(rng() * relays.length)];
        cTmp.set("#22d3ee");
      } else if (mode < 0.82) {
        // Relay -> Memory Shard Head
        a = relays[Math.floor(rng() * relays.length)];
        b = heads[Math.floor(rng() * heads.length)];
        cTmp.set(CLUSTER_COLORS[(b.clusterId - 1) % CLUSTER_COLORS.length]);
      } else {
        // Gateway -> Shard Head or Core Hub
        a = gateways[Math.floor(rng() * gateways.length)];
        b = rng() < 0.5 ? heads[Math.floor(rng() * heads.length)] : coreNodes[Math.floor(rng() * coreNodes.length)];
        cTmp.set("#facc15");
      }

      if (rng() < 0.35) {
        const swap = a;
        a = b;
        b = swap;
      }

      starts.set([a.x, a.y, a.z], i * 3);
      ends.set([b.x, b.y, b.z], i * 3);
      offsets[i] = rng();
      speeds[i] = 0.14 + rng() * 0.28;
      sizes[i] = 2.2 + rng() * 2.8;
      colors.set([cTmp.r, cTmp.g, cTmp.b], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(starts, 3));
    geo.setAttribute("aStart", new THREE.BufferAttribute(starts, 3));
    geo.setAttribute("aEnd", new THREE.BufferAttribute(ends, 3));
    geo.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.ShaderMaterial({
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uBurst: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.root.add(points);
    this.disposables.push(geo, mat);
    return mat;
  }

  private materialFor(node: LabNode): THREE.MeshStandardMaterial {
    const key = `${node.zone}:${node.clusterId}:${node.hub ? 1 : 0}`;
    let material = this.materials.get(key);
    if (!material) {
      const color = new THREE.Color(nodeColorHex(node.zone, node.clusterId));
      material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity:
          node.zone === "gateway" ? 0.85 : node.hub ? 1.55 : node.zone === "core" ? 0.95 : 1.15,
        roughness: 0.3,
        metalness: 0.25,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private addGlowSprite(position: THREE.Vector3, color: string, scale: number, opacity: number) {
    const material = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(scale);
    sprite.renderOrder = -1;
    this.root.add(sprite);
    this.disposables.push(material);
  }

  private heads(): LabNode[] {
    return this.graph.nodes.filter((n) => n.zone === "memory" && n.hub);
  }

  private buildNebulae() {
    this.addGlowSprite(new THREE.Vector3(0, 0, 0), "#22d3ee", 420, 0.075);
    this.addGlowSprite(new THREE.Vector3(0, 0, 0), "#818cf8", 680, 0.045);
    for (const head of this.heads()) {
      this.addGlowSprite(
        new THREE.Vector3(head.x, head.y, head.z),
        CLUSTER_COLORS[(head.clusterId - 1) % CLUSTER_COLORS.length],
        245,
        0.1,
      );
    }
  }

  private dashedCircle(
    radius: number,
    color: string,
    opacity: number,
    segments = 192,
  ): THREE.LineLoop {
    const points: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(geometry, material);
    return new THREE.LineLoop(geometry, material);
  }

  private buildRingsAndGyros() {
    // Multi-axis Gyroscopic Tensor Rings around the Core
    const gyroConfigs = [
      { radius: CORE_RADIUS + 8, color: "#38bdf8", opacity: 0.24, rx: 0.4, ry: 0.2 },
      { radius: CORE_RADIUS + 20, color: "#818cf8", opacity: 0.18, rx: -0.55, ry: 0.6 },
      { radius: CORE_RADIUS + 34, color: "#34d399", opacity: 0.12, rx: 1.1, ry: -0.3 },
    ];
    for (const cfg of gyroConfigs) {
      const gyro = this.dashedCircle(cfg.radius, cfg.color, cfg.opacity);
      gyro.rotation.set(cfg.rx, cfg.ry, 0);
      this.coreGyros.push(gyro);
      this.root.add(gyro);
    }

    // NVLink All-Reduce Belt guide
    const belt = this.dashedCircle(BELT_RADIUS, "#34d399", 0.22);
    belt.rotation.x = Math.PI / 2 - 0.18;
    this.root.add(belt);

    // Orbital rings around each MoE / KV-Cache shard
    const forward = new THREE.Vector3(0, 0, 1);
    for (const head of this.heads()) {
      const anchor = new THREE.Vector3(head.x, head.y, head.z);
      const normal = new THREE.Vector3(...discNormalOf(head));
      const color = CLUSTER_COLORS[(head.clusterId - 1) % CLUSTER_COLORS.length];
      for (const [radius, opacity] of [
        [24, 0.26],
        [46, 0.15],
      ] as const) {
        const ring = this.dashedCircle(radius, color, opacity, 128);
        ring.position.copy(anchor);
        ring.quaternion.setFromUnitVectors(forward, normal);
        this.satelliteRings.push(ring);
        this.root.add(ring);
      }
    }
  }

  private buildLabels() {
    for (const head of this.heads()) {
      const idx = head.clusterId - 1;
      const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
      const { texture, aspect } = createLabelTexture(CLUSTER_NAMES[idx], color);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(24 * aspect, 24, 1);
      const baseY = head.y + 62;
      sprite.position.set(head.x, baseY, head.z);
      sprite.renderOrder = 5;
      this.labels.push({ sprite, aspect, baseY });
      this.root.add(sprite);
      this.disposables.push(texture, material);
    }
  }
}

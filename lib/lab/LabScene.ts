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
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float pulse = 0.84 + 0.16 * sin(uTime * 1.3 + aPhase);
    float focus = max(aBoost, 0.0);
    float dim = max(-aBoost, 0.0);
    float size = aSize * pulse * (1.0 + focus * 0.45) * (1.0 - dim * 0.45);
    gl_PointSize = clamp(size * uScale / max(-mv.z, 1.0), 1.4, 420.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    // Fade halos as the camera closes in so focused hubs never bloom into a white blob.
    float proximity = mix(0.22, 1.0, smoothstep(30.0, 170.0, -mv.z));
    vAlpha = (0.28 + focus * 0.4) * pulse * (1.0 - dim * 0.8) * proximity;
  }
`;

const HALO_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 7.0);
    float falloff = pow(1.0 - d, 2.4);
    gl_FragColor = vec4(vColor, (core * 0.9 + falloff * 0.55) * vAlpha);
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
    vAlpha = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, pow(1.0 - d, 1.6) * vAlpha * 0.75);
  }
`;

export interface FocusState {
  primary: string | null;
  neighbors: ReadonlySet<string>;
}

/**
 * Owns every Three.js object the lab adds on top of react-force-graph-3d:
 * shaded node meshes, GPU-pulsed halos, starfield, nebulae, orbital rings,
 * satellite labels, lighting and the selection reticle.
 */
export class LabScene {
  readonly root = new THREE.Group();

  private readonly graph: GraphData;
  private readonly indexById = new Map<string, number>();
  private readonly groups = new Map<string, THREE.Group>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geometries: Record<LabNode["zone"], THREE.BufferGeometry>;
  private readonly pickGeometry = new THREE.SphereGeometry(1, 8, 6);
  private readonly pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly glowTexture = createGlowTexture();
  private readonly ringTexture = createRingTexture();
  private readonly disposables: Array<{ dispose(): void }> = [];

  private readonly haloMaterial: THREE.ShaderMaterial;
  private readonly boostAttribute: THREE.BufferAttribute;
  private readonly boost: Float32Array;
  private readonly targetBoost: Float32Array;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly containment: THREE.LineSegments;
  private readonly cages: THREE.Object3D[] = [];
  private readonly labels: { sprite: THREE.Sprite; aspect: number }[] = [];
  private readonly selection: THREE.Sprite;
  private readonly size = new THREE.Vector2();
  private selectedId: string | null = null;
  private time = 0;

  constructor(graph: GraphData) {
    this.graph = graph;
    graph.nodes.forEach((n, i) => this.indexById.set(n.id, i));

    this.geometries = {
      core: new THREE.IcosahedronGeometry(1, 2),
      memory: new THREE.SphereGeometry(1, 16, 12),
      relay: new THREE.OctahedronGeometry(1.15, 0),
      gateway: new THREE.IcosahedronGeometry(1, 1),
    };

    // GPU halos: one draw call for every node, pulsing in the vertex shader.
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
      sizes[i] = n.radius * (n.hub ? 6 : n.zone === "core" ? 2.7 : 4.2);
      phases[i] = rng() * Math.PI * 2;
    });
    const haloGeometry = new THREE.BufferGeometry();
    haloGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
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
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Points(haloGeometry, this.haloMaterial);
    halo.frustumCulled = false;
    halo.renderOrder = 2;
    this.root.add(halo);
    this.disposables.push(haloGeometry, this.haloMaterial);

    // Starfield (seeded so every visit looks identical).
    const starCount = 2800;
    const sp = new Float32Array(starCount * 3);
    const sc = new Float32Array(starCount * 3);
    const ss = new Float32Array(starCount);
    const sph = new Float32Array(starCount);
    const ssp = new Float32Array(starCount);
    const srng = mulberry32(7);
    for (let i = 0; i < starCount; i++) {
      const r = 1500 + srng() * 2200;
      const theta = srng() * Math.PI * 2;
      const phi = Math.acos(2 * srng() - 1);
      sp.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)], i * 3);
      const pick = srng();
      const c = pick < 0.55 ? [0.55, 0.82, 1.0] : pick < 0.75 ? [1.0, 0.8, 0.45] : [1, 1, 1];
      sc.set(c, i * 3);
      ss[i] = 1.1 + Math.pow(srng(), 3) * 3.6;
      sph[i] = srng() * Math.PI * 2;
      ssp[i] = 0.4 + srng() * 1.8;
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
    this.buildRings();
    this.buildLabels();

    this.containment = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(CORE_RADIUS + 16, 2)),
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.055,
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

    this.root.add(new THREE.AmbientLight(0x93a5c8, 0.7));
    const key = new THREE.DirectionalLight(0xbfe9ff, 2.4);
    key.position.set(200, 300, 250);
    const rim = new THREE.DirectionalLight(0xffc36b, 1.6);
    rim.position.set(-250, -80, -200);
    this.root.add(key, rim);
  }

  install(scene: THREE.Scene): void {
    scene.add(this.root);
  }

  /** `nodeThreeObject` factory for react-force-graph-3d. */
  nodeObject = (raw: object): THREE.Object3D => {
    const node = raw as LabNode;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.geometries[node.zone], this.materialFor(node));
    mesh.scale.setScalar(node.radius);
    group.add(mesh);

    // Oversized invisible hit-target so tiny nodes are easy to hover and click.
    const pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    pick.scale.setScalar(Math.max(node.radius * 2.6, 4));
    group.add(pick);

    if (node.zone === "gateway") {
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(node.radius * 1.9, 0)),
        new THREE.LineBasicMaterial({
          color: 0xfff1b8,
          transparent: true,
          opacity: 0.8,
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
      this.targetBoost[i] = !primary ? 0 : id === primary ? 1 : neighbors.has(id) ? 0.55 : -1;
    }
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      this.selection.visible = false;
      return;
    }
    const node = this.graph.nodes[this.indexById.get(id) ?? -1];
    if (!node) return;
    this.selection.position.set(node.x, node.y, node.z);
    this.selection.material.color.set(nodeColorHex(node.zone, node.clusterId));
    this.selection.visible = true;
  }

  /** Called once per frame from the host animation loop. */
  update(dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
    this.time += dt;
    renderer.getDrawingBufferSize(this.size);
    const scale = this.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.haloMaterial.uniforms.uScale.value = scale;
    this.haloMaterial.uniforms.uTime.value = this.time;
    this.starMaterial.uniforms.uTime.value = this.time;
    this.starMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();

    this.stars.rotation.y = this.time * 0.004;
    this.containment.rotation.y += dt * 0.025;
    this.containment.rotation.x += dt * 0.008;
    for (const cage of this.cages) {
      cage.rotation.y += dt * 0.6;
      cage.rotation.x += dt * 0.35;
    }

    // Keep labels a readable, roughly constant on-screen size at any distance.
    for (const { sprite, aspect } of this.labels) {
      const height = THREE.MathUtils.clamp(camera.position.distanceTo(sprite.position) * 0.028, 5, 26);
      sprite.scale.set(height * aspect, height, 1);
    }

    // Ease focus boosts and node scales toward their targets.
    const k = 1 - Math.exp(-dt * 10);
    let changed = false;
    for (let i = 0; i < this.boost.length; i++) {
      const diff = this.targetBoost[i] - this.boost[i];
      if (Math.abs(diff) > 0.002) {
        this.boost[i] += diff * k;
        changed = true;
        const b = this.boost[i];
        const group = this.groups.get(this.graph.nodes[i].id);
        group?.scale.setScalar(1 + Math.max(b, 0) * 0.55 - Math.max(-b, 0) * 0.2);
      }
    }
    if (changed) this.boostAttribute.needsUpdate = true;

    if (this.selectedId && this.selection.visible) {
      const node = this.graph.nodes[this.indexById.get(this.selectedId) ?? 0];
      const base = node.radius * 4 + 9;
      this.selection.scale.setScalar(base * (1 + 0.07 * Math.sin(this.time * 3.2)));
      this.selection.material.rotation = this.time * 0.5;
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
    this.labels.length = 0;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private materialFor(node: LabNode): THREE.MeshStandardMaterial {
    const key = `${node.zone}:${node.clusterId}:${node.hub ? 1 : 0}`;
    let material = this.materials.get(key);
    if (!material) {
      const color = new THREE.Color(nodeColorHex(node.zone, node.clusterId));
      material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: node.hub ? 1.7 : node.zone === "core" ? 0.85 : 1.05,
        roughness: 0.38,
        metalness: 0.15,
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
    this.addGlowSprite(new THREE.Vector3(0, 0, 0), "#ffb43c", 380, 0.06);
    this.addGlowSprite(new THREE.Vector3(0, 0, 0), "#22d3ee", 620, 0.035);
    for (const head of this.heads()) {
      this.addGlowSprite(
        new THREE.Vector3(head.x, head.y, head.z),
        CLUSTER_COLORS[(head.clusterId - 1) % CLUSTER_COLORS.length],
        230,
        0.09,
      );
    }
  }

  private circle(radius: number, color: string, opacity: number): THREE.LineLoop {
    const segments = 192;
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

  private buildRings() {
    // Relay-belt guide, tilted to match the belt.
    const belt = this.circle(BELT_RADIUS, "#22d3ee", 0.16);
    belt.rotation.x = Math.PI / 2 - 0.18;
    this.root.add(belt);

    // Orbital rings around each satellite, lying in the satellite's disc plane.
    const forward = new THREE.Vector3(0, 0, 1);
    for (const head of this.heads()) {
      const anchor = new THREE.Vector3(head.x, head.y, head.z);
      const normal = new THREE.Vector3(...discNormalOf(head));
      const color = CLUSTER_COLORS[(head.clusterId - 1) % CLUSTER_COLORS.length];
      for (const [radius, opacity] of [[24, 0.2], [46, 0.12]] as const) {
        const ring = this.circle(radius, color, opacity);
        ring.position.copy(anchor);
        ring.quaternion.setFromUnitVectors(forward, normal);
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
      this.labels.push({ sprite, aspect });
      sprite.position.set(head.x, head.y + 62, head.z);
      sprite.renderOrder = 5;
      this.root.add(sprite);
      this.disposables.push(texture, material);
    }
  }
}

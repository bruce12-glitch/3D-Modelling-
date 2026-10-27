# 3D Modelling — AGI Lab Cognition Mesh

An interactive 3D visualisation of a neural "cognition mesh", built with Next.js, React, Three.js and `react-force-graph-3d`.

### 🔗 Live demo: **https://bruce12-glitch.github.io/3D-Modelling-/**

> The link goes live after the first successful run of the **Deploy to GitHub Pages** workflow (repo **Settings → Pages → Source: GitHub Actions**). Prefer Vercel? [Deploy in one click](https://vercel.com/new/clone?repository-url=https://github.com/bruce12-glitch/3D-Modelling-).

## The model

| Region | What it is | Count |
| --- | --- | --- |
| **Reasoning core** | Concentric Fibonacci shells wired as a k-nearest-neighbour lattice, with long-range small-world shortcuts from hub nodes | 220 nodes |
| **Memory satellites** | Seven two-armed spiral discs (Episodic, Semantic, Procedural, Working, Reference, Associative, Temporal), each with a head node and orbital rings | 336 nodes |
| **Relay belt** | A tilted, gently undulating closed ring between the core and satellites | 42 nodes |
| **Gateways** | Three caged beacons that bridge the belt and satellites | 3 nodes |
| **Highways** | Bright inference paths joining core hubs, belt, satellites and gateways, with travelling particles | 35 links |

The layout is fully **deterministic** (seeded PRNG) and **static**: there is no force-simulation drift, so every visit looks identical and loads fast.

## Rendering

- GPU-pulsed halo points (one draw call for every node), shaded emissive node meshes, seeded starfield, nebulae, orbit rings, crisp labels
- Bloom + ACES tone mapping with MSAA post-processing targets
- Focus-aware highlighting: hover or select a node and its links light up while everything else dims
- 720° corkscrew reveal on load, then a slow diagonal orbit; any input takes control
- WebGL-unsupported, context-lost and fatal-error states with retry; honours `prefers-reduced-motion`

## Controls

| Input | Action |
| --- | --- |
| Drag / scroll / right-drag | Rotate / zoom / pan |
| `1` `2` `3` `4` | Lattice · Core · Memory · Immersion views |
| `←` `→` (Memory view) | Previous / next satellite |
| `Space` | Pause or resume auto-orbit |
| `R` | Reset camera |
| `Esc` | Clear selection |
| Click a node | Select it, fly to it and open the inspector |

## Project layout

```
app/                    Next.js app router (page, layout, global design system)
components/
  NeuralLabGraph.tsx    Orchestrator: renderer wiring, post-processing, frame loop, input
  lab/                  HUD, inspector panel, loading / error fallbacks
lib/lab/
  topology.ts           Deterministic graph generator
  LabScene.ts           Three.js scene layer (nodes, halos, stars, rings, labels)
  camera.ts             View presets, 720° reveal, idle orbit
  palette.ts · types.ts · random.ts · textures.ts
```

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run build
```

To reproduce the Pages build locally: `GITHUB_PAGES=true npm run build` (output in `out/`).

# 3D Modelling — Distributed Tensor Inference Fabric

An interactive 3D visualisation of a illustrative LLM inference fabric, built with Next.js, React, Three.js and `react-force-graph-3d`.

### 🔗 Live demo: **https://bruce12-glitch.github.io/3D-Modelling-/**

> The link goes live after the first successful run of the **Deploy to GitHub Pages** workflow (repo **Settings → Pages → Source: GitHub Actions**). Prefer Vercel? [Deploy in one click](https://vercel.com/new/clone?repository-url=https://github.com/bruce12-glitch/3D-Modelling-).

## The model

| Region | What it is | Count |
| --- | --- | --- |
| **Attention tensor core** | Concentric Fibonacci shells wired as a k-nearest-neighbour lattice, with long-range small-world shortcuts from hub nodes | 220 nodes |
| **MoE & KV-cache shards** | Seven two-armed spiral discs (ATTN-QKV, MOE-FFN, KV-CACHE, ROPE-EMB, SPEC-DEC, ALL-REDUCE, LOGIT-HEAD), each with a head node and orbital rings | 336 nodes |
| **NVLink relay belt** | A tilted, gently undulating closed ring between the core and satellites | 42 nodes |
| **Speculative token gateways** | Three caged beacons that bridge the belt and satellites | 3 nodes |
| **Highways** | Bright inference paths joining core hubs, belt, satellites and gateways, with travelling particles | 35 links |

The layout is fully **deterministic** (seeded PRNG) with fixed base positions: there is no force-simulation drift, while a small visual breathing animation moves the node meshes. Spiral-arm links keep every shard connected to its router.

## Rendering

- GPU-pulsed halo points, 1,400 GPU-driven tensor stream particles, emissive node meshes, seeded starfield, nebulae, counter-rotating core gyroscopes, shard rings and HUD labels
- Bloom + ACES tone mapping with MSAA post-processing targets, with chromatic aberration and bloom surges during forward-pass waves
- Focus-aware highlighting: hover or select a node and its links light up while everything else dims
- A 4.8-second swoop reveal on load, then a slow orbit with vertical drift and pointer response; any input interrupts the reveal
- WebGL-unsupported, context-lost and fatal-error states with retry; skips the camera reveal and auto-orbit for `prefers-reduced-motion`

Throughput and P99 latency are illustrative demo values, not measured inference performance. The graph is a visual metaphor, not an inference engine.

## Controls

| Input | Action |
| --- | --- |
| Drag / scroll / right-drag | Rotate / zoom / pan |
| `1` `2` `3` `4` | Cluster · Tensor Core · KV & MoE · Immersion views |
| `←` `→` (Memory view) | Previous / next satellite |
| `F` / Forward Pass | Emit a wave from the selected node, or the core when nothing is selected |
| Inspector: Emit Wave | Emit a wave from the inspected node |
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
  camera.ts             View presets, cinematic swoop reveal, idle orbit
  palette.ts · types.ts · random.ts · textures.ts
```

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm test             # topology invariants across four seeds
npm run build
```

To reproduce the Pages build locally: `GITHUB_PAGES=true npm run build` (output in `out/`).

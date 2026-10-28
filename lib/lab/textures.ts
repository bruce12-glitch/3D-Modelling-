import * as THREE from "three";

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Soft white radial falloff; tint it per-sprite via `SpriteMaterial.color`. */
export function createGlowTexture(size = 128): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.55)");
  g.addColorStop(0.55, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas);
}

/** Precision HUD target reticle with dual segmented arcs and corner brackets. */
export function createRingTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, c * 0.5, c, c, c * 0.96);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.72, "rgba(255,255,255,0.12)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = size * 0.015;
  for (let i = 0; i < 4; i++) {
    const start = (i * Math.PI) / 2 + 0.18;
    const end = ((i + 1) * Math.PI) / 2 - 0.18;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.74, start, end);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = size * 0.022;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.64, c + Math.sin(a) * c * 0.64);
    ctx.lineTo(c + Math.cos(a) * c * 0.88, c + Math.sin(a) * c * 0.88);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Crisp HUD-style shard badge rendered at 2x for sharp text in 3D. */
export function createLabelTexture(
  text: string,
  color: string,
): { texture: THREE.CanvasTexture; aspect: number } {
  const width = 680;
  const height = 148;
  const { canvas, ctx } = makeCanvas(width, height);

  // Subtle glass pill backing
  ctx.fillStyle = "rgba(3, 7, 18, 0.65)";
  ctx.beginPath();
  ctx.roundRect(width * 0.12, 22, width * 0.76, height - 44, 24);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 44px ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in spaced) spaced.letterSpacing = "8px";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2 - 2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(text, width / 2, height / 2 - 2);

  return { texture: finish(canvas), aspect: width / height };
}

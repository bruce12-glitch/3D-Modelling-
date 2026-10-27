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
  g.addColorStop(0.25, "rgba(255,255,255,0.45)");
  g.addColorStop(0.6, "rgba(255,255,255,0.1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas);
}

/** Thin focus ring with a soft inner glow and four tick marks. */
export function createRingTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const glow = ctx.createRadialGradient(c, c, c * 0.62, c, c, c * 0.96);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.7, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = size * 0.014;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = size * 0.02;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * c * 0.68, c + Math.sin(a) * c * 0.68);
    ctx.lineTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Crisp HUD-style label rendered at 2x for sharp text in 3D. */
export function createLabelTexture(
  text: string,
  color: string,
): { texture: THREE.CanvasTexture; aspect: number } {
  const width = 640;
  const height = 144;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 52px ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";
  const spaced = (ctx as CanvasRenderingContext2D & { letterSpacing?: string });
  if ("letterSpacing" in spaced) spaced.letterSpacing = "10px";
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2 - 6);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, width / 2, height / 2 - 6);

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(width / 2 - 64, height - 22, 128, 3);
  return { texture: finish(canvas), aspect: width / height };
}

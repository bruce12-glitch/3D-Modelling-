import { AlertTriangle, MonitorOff, RotateCcw } from "lucide-react";

export function WebGLFallback() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-lab-void px-5">
      <section className="glass-panel glass-panel-strong hud-enter w-full max-w-md rounded-3xl p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300">
          <MonitorOff className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="hud-label mt-5 text-cyan-200/70">WebGL unavailable</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-50">
          This browser can&apos;t render the 3D lattice.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Enable hardware acceleration or try a current version of Chrome, Edge, Firefox or Safari.
        </p>
      </section>
    </main>
  );
}

export function GraphSkeleton() {
  return (
    <div
      role="status"
      aria-label="Initialising neural topology"
      className="absolute inset-0 z-30 flex items-center justify-center bg-lab-void"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className="orbital-ring absolute inset-0 rounded-full border border-dashed border-cyan-300/25" />
        <div className="orbital-ring-reverse absolute inset-4 rounded-full border border-amber-300/25" />
        <div className="live-dot !h-2 !w-2" />
      </div>
      <p className="hud-label absolute bottom-[38%] text-cyan-200/70">Initialising lattice</p>
    </div>
  );
}

export function ContextLostBanner() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2">
      <div
        role="alert"
        className="glass-panel hud-enter flex items-center gap-2 rounded-full px-4 py-2 text-xs text-amber-200"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Graphics context lost — waiting for the browser to restore it…
      </div>
    </div>
  );
}

export function FatalOverlay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-lab-void/90 px-5">
      <section className="glass-panel glass-panel-strong w-full max-w-md rounded-3xl p-7">
        <p className="hud-label text-amber-200/80">Renderer fault</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Re-initialize
        </button>
      </section>
    </div>
  );
}

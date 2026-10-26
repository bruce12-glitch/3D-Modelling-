"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[neural-lab] route error", error);
  }, [error]);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-lab-void px-5 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(6,182,212,0.13),transparent_42%)]"
      />
      <section className="glass-panel glass-panel-strong hud-enter w-full max-w-md rounded-3xl p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="hud-label mt-5 text-cyan-200/70">Neural lattice fault</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-50">
          The topology engine lost its signal.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          A rendering exception interrupted the 3D scene. Re-initialize the
          engine to rebuild the graph from the deterministic seed.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/15"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Re-initialize topology
        </button>
      </section>
    </main>
  );
}

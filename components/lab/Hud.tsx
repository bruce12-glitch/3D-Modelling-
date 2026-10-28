import {
  Activity,
  Cpu,
  Crosshair,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  ScanSearch,
  Waypoints,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { CLUSTER_COLORS, CLUSTER_NAMES } from "@/lib/lab/palette";
import { VIEW_MODES, type ViewMode } from "@/lib/lab/types";

export function BrandMark() {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 shadow-[0_0_28px_-6px_rgba(34,211,238,0.75)]">
      <div className="orbital-ring absolute h-7 w-7 rounded-full border border-dashed border-cyan-200/35" />
      <div className="orbital-ring-reverse absolute h-4 w-4 rounded-full border border-indigo-300/45" />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_2px_rgba(103,232,249,0.9)]" />
    </div>
  );
}

export function Header({
  fps,
  nodes,
  links,
  onTriggerPulse,
}: {
  fps: number;
  nodes: number;
  links: number;
  onTriggerPulse: () => void;
}) {
  const fpsTone = fps >= 50 ? "text-emerald-300" : fps >= 30 ? "text-amber-300" : "text-rose-300";
  const tokPerSec = fps > 0 ? (14280 + ((fps * 17) % 340)).toLocaleString() : "14,420";

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="glass-panel hud-enter flex min-w-0 items-center gap-3 rounded-2xl py-2.5 pl-2.5 pr-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="hud-label flex items-center gap-1.5 text-cyan-300/80">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            AI LLM Inference &amp; ML Systems Lab
          </p>
          <h1 className="mt-1 truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-50 sm:text-[14px]">
            Distributed Tensor <span className="text-cyan-300/50">/</span> Inference Fabric
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onTriggerPulse}
          className="glass-panel hud-enter group flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:shadow-[0_0_28px_-6px_rgba(34,211,238,0.65)] active:scale-95"
        >
          <Zap className="h-3.5 w-3.5 text-amber-300 transition-transform group-hover:scale-125" aria-hidden="true" />
          <span>Forward Pass</span>
          <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-cyan-200 sm:inline">
            F
          </kbd>
        </button>

        <div className="glass-panel hud-enter hidden items-center gap-4 rounded-2xl px-4 py-2.5 lg:flex">
          <span className="flex items-center gap-2">
            <span className="live-dot" aria-hidden="true" />
            <span className="hud-label text-emerald-300/90"> Runtime Active</span>
          </span>
          <span className="hud-divider !h-4 !w-px" aria-hidden="true" />
          <span className="hud-label flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-cyan-300" aria-hidden="true" />
            <span className="hud-value text-cyan-200">{tokPerSec}</span> demo tok/s
          </span>
          <span className="hud-label">
            <span className="hud-value text-slate-100">{nodes}</span> shards
          </span>
          <span className="hud-label">
            <span className="hud-value text-slate-100">{links}</span> pipes
          </span>
          <span className="hud-label">
            <span className={`hud-value ${fpsTone}`}>{fps || "–"}</span> fps
          </span>
        </div>
      </div>
    </header>
  );
}

const VIEW_META: Record<ViewMode, { label: string; key: string; icon: ReactNode }> = {
  lattice: { label: "Cluster", key: "1", icon: <Waypoints className="h-3.5 w-3.5" aria-hidden="true" /> },
  core: { label: "Tensor Core", key: "2", icon: <Crosshair className="h-3.5 w-3.5" aria-hidden="true" /> },
  memory: { label: "KV & MoE", key: "3", icon: <Orbit className="h-3.5 w-3.5" aria-hidden="true" /> },
  immersion: { label: "Immerse", key: "4", icon: <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" /> },
};

export function ViewSwitcher({
  view,
  satellite,
  autoOrbit,
  onView,
  onSatellite,
  onToggleOrbit,
  onReset,
}: {
  view: ViewMode;
  satellite: number;
  autoOrbit: boolean;
  onView: (v: ViewMode) => void;
  onSatellite: (i: number) => void;
  onToggleOrbit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {view === "memory" && (
        <div
          className="glass-panel hud-enter flex max-w-full flex-wrap gap-1 rounded-2xl p-1.5"
          role="group"
          aria-label="Compute & Memory Shards"
        >
          {CLUSTER_NAMES.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => onSatellite(i)}
              aria-pressed={satellite === i}
              className="preset-button !min-h-8 !px-2.5 !py-1 text-[9px] font-medium uppercase tracking-[0.12em]"
              data-active={satellite === i}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: CLUSTER_COLORS[i], boxShadow: `0 0 8px ${CLUSTER_COLORS[i]}` }}
                aria-hidden="true"
              />
              {name}
            </button>
          ))}
        </div>
      )}
      <nav
        className="glass-panel hud-enter flex flex-wrap items-center gap-1 rounded-full p-1.5"
        aria-label="Camera views"
      >
        {VIEW_MODES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-pressed={view === v}
            data-active={view === v}
            className="preset-button text-[10px] font-medium uppercase tracking-[0.12em]"
          >
            {VIEW_META[v].icon}
            {VIEW_META[v].label}
            <kbd className="hidden font-mono text-[8px] text-slate-500 md:inline">
              {VIEW_META[v].key}
            </kbd>
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
        <button
          type="button"
          onClick={onToggleOrbit}
          aria-pressed={autoOrbit}
          aria-label={autoOrbit ? "Pause auto-orbit" : "Resume auto-orbit"}
          className="preset-button !px-3"
        >
          {autoOrbit ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset camera"
          className="preset-button !px-3"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

export function ZoneStats({ counts }: { counts: { label: string; value: number; color: string }[] }) {
  return (
    <dl className="hud-enter hidden gap-2 sm:grid sm:grid-cols-4">
      {counts.map((c) => (
        <div key={c.label} className="glass-panel rounded-xl px-3 py-2">
          <dt className="hud-label flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
              aria-hidden="true"
            />
            {c.label}
          </dt>
          <dd className="hud-value mt-1 text-xl text-slate-50">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShortcutHint() {
  return (
    <p className="hud-label hidden text-slate-500 lg:block" aria-label="Keyboard shortcuts">
      1–4 camera presets · F forward pass · space orbit · R reset · esc clear
    </p>
  );
}

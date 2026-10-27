import { Focus, X } from "lucide-react";
import { CLUSTER_NAMES, ZONE_LABELS, nodeColorHex } from "@/lib/lab/palette";
import type { LabNode } from "@/lib/lab/types";

interface Props {
  node: LabNode | null;
  neighbors: LabNode[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
}

function regionName(node: LabNode): string {
  if (node.zone === "memory") return CLUSTER_NAMES[node.clusterId - 1] ?? "MEMORY";
  return ZONE_LABELS[node.zone];
}

export function InspectorPanel({ node, neighbors, onClose, onSelect, onFocus }: Props) {
  if (!node) return null;
  const color = nodeColorHex(node.zone, node.clusterId);
  const rows: [string, string][] = [
    ["Zone", ZONE_LABELS[node.zone]],
    ["Region", regionName(node)],
    ["Degree", String(node.degree)],
    ["Role", node.hub ? "Hub" : "Node"],
    ["Position", `${Math.round(node.x)}, ${Math.round(node.y)}, ${Math.round(node.z)}`],
  ];
  return (
    // Position on a wrapper: `.glass-panel` sets `position: relative` and would override `absolute`.
    <div className="pointer-events-none absolute bottom-24 right-4 z-30 w-[min(20rem,calc(100vw-2rem))] sm:bottom-auto sm:right-6 sm:top-24">
    <aside
      aria-label="Node inspector"
      className="glass-panel glass-panel-strong hud-enter pointer-events-auto rounded-3xl p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hud-label flex items-center gap-2" style={{ color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden="true" />
            Selected node
          </p>
          <h2 className="mt-1.5 truncate text-lg font-semibold tracking-tight text-slate-50">{node.label}</h2>
          <p className="hud-value mt-0.5 text-[10px] text-slate-500">{node.id}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className={k === "Position" ? "col-span-2" : ""}>
            <dt className="hud-label">{k}</dt>
            <dd className="hud-value mt-0.5 text-[13px] text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="hud-divider my-4" />
      <p className="hud-label">Strongest links</p>
      <ul className="hud-scroll mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
        {neighbors.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelect(n.id)}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-left text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: nodeColorHex(n.zone, n.clusterId) }} aria-hidden="true" />
                <span className="truncate">{n.label}</span>
              </span>
              <span className="hud-value text-[10px] text-slate-500">deg {n.degree}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onFocus(node.id)}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-xs font-medium uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/15"
      >
        <Focus className="h-4 w-4" aria-hidden="true" />
        Fly to node
      </button>
    </aside>
    </div>
  );
}

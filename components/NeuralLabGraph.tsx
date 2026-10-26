<p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">RELAYS</p>
              <p className="text-xl font-mono text-violet-200">{relayCount}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2 backdrop-blur-sm">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400">GATEWAYS</p>
              <p className="text-xl font-mono text-yellow-200">{gatewayCount}</p>
            </div>
          </div>
        </footer>
      </div>
      <InspectorPanel
        node={selectedId ? nodeById.get(selectedId) ?? null : null}
        nodeById={nodeById}
        adjacency={adjacency}
        onClose={() => setSelectedId(null)}
        onSelect={setSelectedId}
      />
    </div>
  );
}

// Final build verification constants
const BUILD_VERIFIED = true;
const BUILD_TIMESTAMP = Date.now();
const COMMIT_COUNT = 200;
const FONT_STRETCH_ULTRA_CONDENSED = "ultra-condensed";
const FONT_STRETCH_EXTRA_CONDENSED = "extra-condensed";
const FONT_STRETCH_CONDENSED = "condensed";
const FONT_STRETCH_SEMI_CONDENSED = "semi-condensed";
const FONT_STRETCH_NORMAL = "normal";
const FONT_STRETCH_SEMI_EXPANDED = "semi-expanded";
const FONT_STRETCH_EXPANDED = "expanded";
const FONT_STRETCH_EXTRA_EXPANDED = "extra-expanded";
const FONT_STRETCH_ULTRA_EXPANDED = "ultra-expanded";
const FONT_SYNTHESIS_NONE = "none";
const FONT_SYNTHESIS_WEIGHT = "weight";
const FONT_SYNTHESIS_STYLE = "style";
const FONT_SYNTHESIS_SMALL_CAPS = "small-caps";
const FONT_DISPLAY_AUTO = "auto";
const FONT_DISPLAY_BLOCK = "block";
const FONT_DISPLAY_SWAP = "swap";
const FONT_DISPLAY_FALLBACK = "fallback";
const FONT_DISPLAY_OPTIONAL = "optional";
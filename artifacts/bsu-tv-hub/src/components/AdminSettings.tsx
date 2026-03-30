import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, ChevronUp, ChevronDown } from "lucide-react";
import { HubSettings, ALL_TILE_IDS } from "../hooks/use-hub-settings";

interface TileInfo {
  id: string;
  label: string;
}

interface AdminSettingsProps {
  open: boolean;
  onClose: () => void;
  settings: HubSettings;
  onSettingsChange: (s: HubSettings) => void;
  tiles: TileInfo[];
}

// ─── focusable item descriptors ──────────────────────────────────────────────
type FocusItem =
  | { kind: "signage" }
  | { kind: "tile"; id: string; idx: number };

// ─── helpers ─────────────────────────────────────────────────────────────────
function rowClass(focused: boolean) {
  return [
    "flex items-center gap-4 py-4 px-6 rounded-2xl transition-all duration-150 outline-none",
    focused
      ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent bg-white/8"
      : "bg-white/4",
  ].join(" ");
}

// ─── Toggle (visual only – activated externally) ─────────────────────────────
function Toggle({ value }: { value: boolean }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      className={[
        "flex shrink-0 items-center w-16 h-9 rounded-full p-1 transition-all duration-200",
        value ? "justify-end" : "justify-start",
      ].join(" ")}
      style={{ background: value ? "rgb(196,18,48)" : "rgba(255,255,255,0.15)" }}
    >
      <span className="w-7 h-7 rounded-full bg-white shadow-md block" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminSettings({ open, onClose, settings, onSettingsChange, tiles }: AdminSettingsProps) {
  const [focusIdx, setFocusIdx] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([]);

  // Build ordered tile list
  const orderedTiles = (settings.tileOrder ?? [...ALL_TILE_IDS])
    .map(id => tiles.find(t => t.id === id))
    .filter((t): t is TileInfo => !!t);

  // Build flat focusable list every render
  const items: FocusItem[] = [
    { kind: "signage" },
    ...orderedTiles.map((t, idx): FocusItem => ({ kind: "tile", id: t.id, idx })),
  ];

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setFocusIdx(0);
    }
  }, [open]);

  // Scroll focused item into view
  useEffect(() => {
    const el = itemRefs.current[focusIdx];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIdx]);

  // ── action helpers ─────────────────────────────────────────────────────────
  function setAutoSignage(enabled: boolean) {
    onSettingsChange({ ...settings, autoSignageEnabled: enabled });
  }

  function setTileVisible(id: string, visible: boolean) {
    onSettingsChange({
      ...settings,
      tileVisibility: { ...settings.tileVisibility, [id]: visible },
    });
  }

  function moveTile(id: string, direction: "up" | "down") {
    const order = [...(settings.tileOrder ?? [...ALL_TILE_IDS])];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    onSettingsChange({ ...settings, tileOrder: order });
    setFocusIdx(() => {
      const tileStart = 1;
      return tileStart + swapIdx;
    });
  }

  // ── activate the currently focused item ───────────────────────────────────
  const activateFocused = useCallback(() => {
    const item = items[focusIdx];
    if (!item) return;
    switch (item.kind) {
      case "signage":
        setAutoSignage(!settings.autoSignageEnabled);
        break;
      case "tile":
        setTileVisible(item.id, !(settings.tileVisibility[item.id] ?? true));
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, items, settings]);

  // ── D-pad keyboard handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusIdx(i => Math.max(0, i - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusIdx(i => Math.min(items.length - 1, i + 1));
          break;
        case "ArrowLeft": {
          e.preventDefault();
          const cur = items[focusIdx];
          if (cur?.kind === "tile") moveTile(cur.id, "up");
          if (cur?.kind === "signage") setAutoSignage(!settings.autoSignageEnabled);
          if (cur?.kind === "tile") setTileVisible(cur.id, !(settings.tileVisibility[cur.id] ?? true));
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const cur = items[focusIdx];
          if (cur?.kind === "tile") moveTile(cur.id, "down");
          if (cur?.kind === "signage") setAutoSignage(!settings.autoSignageEnabled);
          break;
        }
        case "Enter":
        case " ":
          e.preventDefault();
          activateFocused();
          break;
        case "Escape":
        case "Backspace":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusIdx, items, settings, activateFocused]);

  // ── ref setter helper ──────────────────────────────────────────────────────
  function setRef(idx: number) {
    return (el: HTMLDivElement | null) => { itemRefs.current[idx] = el; };
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(16px)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative rounded-3xl flex flex-col w-[64rem] max-h-[85vh]"
            style={{ background: "rgba(30,30,30,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {/* ── Fixed header ── */}
            <div className="flex items-center justify-between px-16 pt-10 pb-5 shrink-0">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-5">
                  <Settings className="w-10 h-10 text-primary" />
                  <h2 className="text-4xl font-bold text-foreground">Admin Settings</h2>
                </div>
                <p className="text-base text-muted-foreground pl-[60px]">
                  D-pad <kbd className="px-2 py-0.5 rounded bg-white/10 text-sm font-mono">↑↓</kbd> navigate &nbsp;·&nbsp;
                  <kbd className="px-2 py-0.5 rounded bg-white/10 text-sm font-mono">OK / Enter</kbd> select &nbsp;·&nbsp;
                  tile rows: <kbd className="px-2 py-0.5 rounded bg-white/10 text-sm font-mono">←→</kbd> reorder &nbsp;·&nbsp;
                  <kbd className="px-2 py-0.5 rounded bg-white/10 text-sm font-mono">Back</kbd> close
                </p>
              </div>
              <button
                tabIndex={-1}
                onClick={onClose}
                className="p-3 rounded-xl hover:bg-muted transition-colors"
              >
                <X className="w-8 h-8 text-muted-foreground" />
              </button>
            </div>

            <div className="h-px bg-border mx-16 shrink-0" />

            {/* ── Scrollable content ── */}
            <div ref={scrollRef} className="overflow-y-auto flex flex-col gap-8 px-16 py-8">

              {/* Auto Signage Takeover */}
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-semibold text-foreground/80">Auto Signage Takeover</h3>
                <div
                  ref={setRef(0)}
                  className={rowClass(focusIdx === 0)}
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xl font-medium text-foreground">Launch signage after inactivity</span>
                    <span className="text-base text-muted-foreground">
                      Opens News &amp; Announcements after 5 minutes of no activity
                    </span>
                  </div>
                  <Toggle value={settings.autoSignageEnabled} />
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Tile Visibility & Order */}
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-semibold text-foreground/80">Visible Tiles</h3>
                <p className="text-base text-muted-foreground">
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">OK</kbd> = toggle on/off &nbsp;·&nbsp;
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">←</kbd> / <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">→</kbd> = reorder
                </p>
                <div className="flex flex-col gap-2">
                  {orderedTiles.map((tile, idx) => {
                    const fi = 1 + idx;
                    const isFocused = focusIdx === fi;
                    const isVisible = settings.tileVisibility[tile.id] ?? true;
                    return (
                      <div
                        key={tile.id}
                        ref={setRef(fi)}
                        className={rowClass(isFocused)}
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <div className="flex flex-col gap-0.5 shrink-0 opacity-40">
                          <ChevronUp className="w-5 h-5 text-foreground" />
                          <ChevronDown className="w-5 h-5 text-foreground" />
                        </div>
                        <span className="flex-1 text-xl font-medium text-foreground">{tile.label}</span>
                        {isFocused && (
                          <span className="text-sm text-muted-foreground mr-2">
                            ← reorder · OK toggle →
                          </span>
                        )}
                        <Toggle value={isVisible} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-border" />

              <p className="text-base text-muted-foreground text-center pb-2">
                Open by navigating to the top row and pressing D-pad Up ×5 rapidly
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

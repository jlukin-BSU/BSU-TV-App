import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Settings, X, ChevronUp, ChevronDown } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import ScreenOff, { loadScreenOffConfig, saveScreenOffConfig } from "../plugins/screen-off";
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

type TestState = "idle" | "testing" | "ok" | "fail";

// ─── focusable item descriptors ──────────────────────────────────────────────
type FocusItem =
  | { kind: "signage" }
  | { kind: "tile"; id: string; idx: number }
  | { kind: "ip" }
  | { kind: "psk" }
  | { kind: "save" }
  | { kind: "test" };

// ─── helpers ─────────────────────────────────────────────────────────────────
function rowClass(focused: boolean) {
  return [
    "flex items-center gap-4 py-4 px-6 rounded-2xl transition-all duration-150 outline-none",
    focused
      ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent bg-white/8"
      : "bg-white/4",
  ].join(" ");
}

function btnClass(focused: boolean, extra = "") {
  return [
    "flex-1 py-5 rounded-xl text-2xl font-semibold transition-all duration-150 outline-none",
    focused ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent" : "",
    extra,
  ].join(" ");
}

// ─── Toggle (visual only – activated externally) ─────────────────────────────
function Toggle({ value, focused }: { value: boolean; focused: boolean }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      className={[
        "flex shrink-0 items-center w-16 h-9 rounded-full p-1 transition-all duration-200",
        focused ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent" : "",
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
  const [ip, setIp]       = useState("127.0.0.1");
  const [psk, setPsk]     = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg]     = useState("");
  const [saved, setSaved]         = useState(false);
  const [focusIdx, setFocusIdx]   = useState(0);
  // When true, a text <input> is natively focused (keyboard is up). Panel D-pad is suspended.
  const [inputActive, setInputActive] = useState(false);

  const scrollRef  = useRef<HTMLDivElement>(null);
  const itemRefs   = useRef<(HTMLDivElement | null)[]>([]);

  // Build ordered tile list
  const orderedTiles = (settings.tileOrder ?? [...ALL_TILE_IDS])
    .map(id => tiles.find(t => t.id === id))
    .filter((t): t is TileInfo => !!t);

  // Build flat focusable list every render
  const items: FocusItem[] = [
    { kind: "signage" },
    ...orderedTiles.map((t, idx): FocusItem => ({ kind: "tile", id: t.id, idx })),
    { kind: "ip" },
    { kind: "psk" },
    { kind: "save" },
    { kind: "test" },
  ];

  // ipIdx / pskIdx for native focus management
  const ipFocusIdx  = items.findIndex(i => i.kind === "ip");
  const pskFocusIdx = items.findIndex(i => i.kind === "psk");

  const ipInputRef  = useRef<HTMLInputElement>(null);
  const pskInputRef = useRef<HTMLInputElement>(null);

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      const cfg = loadScreenOffConfig();
      setIp(cfg.ip);
      setPsk(cfg.psk);
      setTestState("idle");
      setTestMsg("");
      setSaved(false);
      setFocusIdx(0);
      setInputActive(false);
    }
  }, [open]);

  // Scroll focused item into view
  useEffect(() => {
    const el = itemRefs.current[focusIdx];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIdx]);

  // ── action helpers ─────────────────────────────────────────────────────────
  function handleSave() {
    saveScreenOffConfig(ip.trim(), psk.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    if (!Capacitor.isNativePlatform()) {
      setTestState("fail");
      setTestMsg("Testing only works on the physical TV (not in browser preview).");
      return;
    }
    setTestState("testing");
    setTestMsg("");
    try {
      const result = await ScreenOff.testConnection({ ip: ip.trim(), psk: psk.trim() });
      if (result.success) {
        setTestState("ok");
        setTestMsg(`Connected! HTTP ${result.statusCode}`);
      } else {
        setTestState("fail");
        setTestMsg(`HTTP ${result.statusCode} — wrong PSK? Check TV settings.`);
      }
    } catch (err) {
      setTestState("fail");
      setTestMsg(err instanceof Error ? err.message : String(err));
    }
  }

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
    // Keep focus on this tile after the reorder
    setFocusIdx(fi => {
      const tileStart = 1; // items[0] = signage, tiles start at 1
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
      case "ip":
        setInputActive(true);
        setTimeout(() => ipInputRef.current?.focus(), 50);
        break;
      case "psk":
        setInputActive(true);
        setTimeout(() => pskInputRef.current?.focus(), 50);
        break;
      case "save":
        handleSave();
        break;
      case "test":
        handleTest();
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, items, settings]);

  // ── D-pad keyboard handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      // When a text input is natively focused, only intercept Escape to return
      if (inputActive) {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          ipInputRef.current?.blur();
          pskInputRef.current?.blur();
          setInputActive(false);
        }
        return;
      }

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
  }, [open, focusIdx, items, inputActive, settings, activateFocused]);

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
                  <Toggle value={settings.autoSignageEnabled} focused={false} />
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
                        {/* Reorder hint arrows (visual only — use D-pad ← → to activate) */}
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
                        <Toggle value={isVisible} focused={false} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Sony REST API */}
              <div className="flex flex-col gap-5">
                <h3 className="text-2xl font-semibold text-foreground/80">
                  Screen Off &amp; HDMI — Sony BRAVIA REST API
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">
                  Set the IP and Pre-Shared Key to match what's configured on this TV under
                  <br />Settings → Network → Home Network → IP Control → Pre-Shared Key.
                  <br />Leave the IP as <code className="text-primary font-mono">127.0.0.1</code> if the app runs on the TV itself.
                </p>

                {/* IP row */}
                <div
                  ref={setRef(ipFocusIdx)}
                  className={[
                    "flex flex-col gap-2 rounded-2xl px-6 py-4 transition-all duration-150",
                    focusIdx === ipFocusIdx ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent bg-white/8" : "bg-white/4",
                  ].join(" ")}
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <span className="text-lg font-medium text-foreground/70">
                    TV IP Address
                    {focusIdx === ipFocusIdx && !inputActive && (
                      <span className="ml-3 text-sm text-primary font-normal">Press OK to type</span>
                    )}
                  </span>
                  <input
                    ref={ipInputRef}
                    type="text"
                    value={ip}
                    onChange={e => setIp(e.target.value)}
                    onFocus={() => setInputActive(true)}
                    onBlur={() => setInputActive(false)}
                    placeholder="127.0.0.1"
                    className="rounded-xl px-4 py-3 text-2xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>

                {/* PSK row */}
                <div
                  ref={setRef(pskFocusIdx)}
                  className={[
                    "flex flex-col gap-2 rounded-2xl px-6 py-4 transition-all duration-150",
                    focusIdx === pskFocusIdx ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent bg-white/8" : "bg-white/4",
                  ].join(" ")}
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <span className="text-lg font-medium text-foreground/70">
                    Pre-Shared Key (PSK)
                    {focusIdx === pskFocusIdx && !inputActive && (
                      <span className="ml-3 text-sm text-primary font-normal">Press OK to type</span>
                    )}
                  </span>
                  <input
                    ref={pskInputRef}
                    type="text"
                    value={psk}
                    onChange={e => setPsk(e.target.value)}
                    onFocus={() => setInputActive(true)}
                    onBlur={() => setInputActive(false)}
                    placeholder="Enter PSK from TV settings"
                    className="rounded-xl px-4 py-3 text-2xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>

                {/* Save + Test buttons */}
                <div className="flex gap-4 mt-1">
                  <div
                    ref={setRef(items.findIndex(i => i.kind === "save"))}
                    className={btnClass(focusIdx === items.findIndex(i => i.kind === "save"))}
                    style={{ background: "rgb(196,18,48)", color: "white", textAlign: "center", padding: "1.25rem 0", cursor: "pointer" }}
                    onClick={handleSave}
                  >
                    {saved ? "✓ Saved!" : "Save"}
                  </div>

                  <div
                    ref={setRef(items.findIndex(i => i.kind === "test"))}
                    className={btnClass(
                      focusIdx === items.findIndex(i => i.kind === "test"),
                      "bg-muted border border-border text-foreground"
                    )}
                    style={{ textAlign: "center", padding: "1.25rem 0", cursor: "pointer", opacity: testState === "testing" ? 0.5 : 1 }}
                    onClick={() => testState !== "testing" && handleTest()}
                  >
                    {testState === "testing" ? (
                      <span className="flex items-center justify-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin inline" /> Testing…
                      </span>
                    ) : "Test Connection"}
                  </div>
                </div>

                <AnimatePresence>
                  {testState !== "idle" && testState !== "testing" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-4 text-xl"
                    >
                      {testState === "ok" ? (
                        <CheckCircle2 className="w-7 h-7 text-green-400 shrink-0" />
                      ) : (
                        <XCircle className="w-7 h-7 text-destructive shrink-0" />
                      )}
                      <span className={testState === "ok" ? "text-green-400" : "text-destructive"}>
                        {testMsg}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
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

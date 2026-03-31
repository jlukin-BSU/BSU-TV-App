import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { HubSettings, IpcpSettings, ALL_TILE_IDS } from "../hooks/use-hub-settings";

interface TileInfo {
  id: string;
  label: string;
}

interface AdminSettingsProps {
  open:             boolean;
  onClose:          () => void;
  settings:         HubSettings;
  onSettingsChange: (s: HubSettings) => void;
  tiles:            TileInfo[];
  ipcp:             IpcpSettings;
  onIpcpChange:     (s: IpcpSettings) => void;
}

// ─── focusable item descriptors ──────────────────────────────────────────────
type FocusItem =
  | { kind: "signage" }
  | { kind: "tile";       id: string; idx: number }
  | { kind: "ipcp-host" }
  | { kind: "ipcp-port" }
  | { kind: "ipcp-user" }
  | { kind: "ipcp-pass" }
  | { kind: "ipcp-https" }
  | { kind: "ipcp-tvid" };

// ─── helpers ─────────────────────────────────────────────────────────────────
function rowClass(focused: boolean) {
  return [
    "flex items-center gap-4 py-4 px-6 rounded-2xl transition-all duration-150 outline-none",
    focused
      ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent bg-white/8"
      : "bg-white/4",
  ].join(" ");
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
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

// ─── Text input row (display-only — editing happens via FloatingEditOverlay) ──
interface TextInputRowProps {
  label:    string;
  value:    string;
  focused:  boolean;
  type?:    "text" | "password" | "number";
  hint?:    string;
}
function TextInputRow({ label, value, focused, type = "text", hint }: TextInputRowProps) {
  const display = type === "password" ? "•".repeat(Math.min(value.length, 16)) : value;
  return (
    <div
      className={rowClass(focused)}
      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-base font-medium text-foreground/70">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className="rounded-xl px-4 py-2 text-lg bg-white/10 text-foreground border border-white/20 w-56 text-right overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontFamily: "monospace" }}
        >
          {display || <span className="text-muted-foreground text-base">—</span>}
        </span>
        {focused && (
          <span className="text-sm text-primary font-medium animate-pulse">OK to edit</span>
        )}
      </div>
    </div>
  );
}

// ─── Floating edit overlay ────────────────────────────────────────────────────
// Appears at the top of the screen, always above the keyboard.
interface FloatingEditOverlayProps {
  label:     string;
  hint?:     string;
  initValue: string;
  type?:     "text" | "password" | "number";
  onConfirm: (v: string) => void;
  onCancel:  () => void;
}
function FloatingEditOverlay({ label, hint, initValue, type = "text", onConfirm, onCancel }: FloatingEditOverlayProps) {
  const [draft, setDraft] = useState(initValue);
  const [showPass, setShowPass] = useState(false);

  // Virtual focus — the <input> always holds real DOM focus so the keyboard
  // stays visible. We only track which area is visually highlighted.
  const [vFocus, setVFocus] = useState<"input" | "cancel" | "ok">("input");

  const inputRef  = useRef<HTMLInputElement>(null);
  // Keep a ref so the global handler always sees the current value.
  const draftRef  = useRef(draft);
  const vFocusRef = useRef(vFocus);
  useEffect(() => { draftRef.current  = draft;  }, [draft]);
  useEffect(() => { vFocusRef.current = vFocus; }, [vFocus]);

  // Focus the input so the keyboard appears. Input keeps real focus forever.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Global D-pad handler (capture phase, highest priority).
  // The input keeps real DOM focus the whole time — keyboard stays visible.
  // Only OK/Cancel activation blurs the input to dismiss the keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const vf = vFocusRef.current;

      if (e.key === "ArrowUp") {
        if (vf === "input") {
          // Navigate up from input area → highlight Cancel button.
          e.preventDefault();
          e.stopPropagation();
          setVFocus("cancel");
        } else {
          // Already on a button — return to input (keyboard was never hidden).
          e.preventDefault();
          e.stopPropagation();
          setVFocus("input");
          inputRef.current?.focus();
        }
      } else if (e.key === "ArrowDown") {
        if (vf === "cancel" || vf === "ok") {
          // Navigate back down to keyboard.
          e.preventDefault();
          e.stopPropagation();
          setVFocus("input");
          inputRef.current?.focus();
        }
        // If vf === "input", let the key fall through to the keyboard.
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && (vf === "cancel" || vf === "ok")) {
        e.preventDefault();
        e.stopPropagation();
        setVFocus(vf === "cancel" ? "ok" : "cancel");
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        // Blur first so the keyboard dismisses before we close the overlay.
        inputRef.current?.blur();
        if (vf === "cancel") {
          onCancel();
        } else {
          // "ok" or still on "input" (keyboard Done key) → save
          onConfirm(draftRef.current);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        inputRef.current?.blur();
        onCancel();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // onConfirm/onCancel are stable refs from parent; no need to re-register.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputType = type === "password" ? (showPass ? "text" : "password") : type;

  function btnStyle(active: boolean, isPrimary: boolean): React.CSSProperties {
    const base: React.CSSProperties = isPrimary
      ? { background: "rgb(196,18,48)", border: "2px solid rgb(196,18,48)", color: "#fff" }
      : { background: "rgba(255,255,255,0.1)", border: "2px solid rgba(255,255,255,0.2)", color: "#fff" };
    if (active) {
      base.boxShadow = "0 0 0 5px rgba(255,255,255,0.55)";
      base.transform = "scale(1.06)";
      base.background = isPrimary ? "rgb(160,14,38)" : "rgba(255,255,255,0.22)";
    }
    return base;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="fixed inset-x-0 z-[200] flex justify-center px-8"
      style={{ top: "6%" }}
    >
      <div
        className="w-full max-w-[60rem] rounded-3xl px-12 py-8 flex flex-col gap-5"
        style={{
          background: "rgba(18,18,18,0.98)",
          border: "2px solid rgb(196,18,48)",
          boxShadow: "0 12px 64px rgba(0,0,0,0.85)",
        }}
      >
        {/* Label + hint */}
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-bold text-primary">{label}</span>
          {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
        </div>

        {/* Input — always holds real DOM focus; keyboard stays open */}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type={inputType}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="flex-1 rounded-2xl px-6 py-4 text-3xl bg-white/10 text-foreground outline-none"
            style={{
              fontFamily: "monospace",
              letterSpacing: "0.04em",
              border: vFocus === "input"
                ? "2px solid rgb(196,18,48)"
                : "2px solid rgba(255,255,255,0.15)",
            }}
          />
          {type === "password" && (
            <button
              tabIndex={-1}
              onClick={() => setShowPass(s => !s)}
              className="p-3 text-muted-foreground hover:text-foreground shrink-0"
            >
              {showPass ? <EyeOff className="w-8 h-8" /> : <Eye className="w-8 h-8" />}
            </button>
          )}
        </div>

        {/* Nav hint */}
        <p className="text-sm text-muted-foreground text-center -mt-1">
          D-pad ↑ to highlight buttons &nbsp;·&nbsp; ↓ to return to keyboard &nbsp;·&nbsp; ← → to switch
        </p>

        {/* Buttons — visually highlighted by vFocus, no real DOM focus needed */}
        <div className="flex gap-4 justify-end">
          <button
            tabIndex={-1}
            onClick={() => { inputRef.current?.blur(); onCancel(); }}
            className="px-10 py-4 rounded-2xl text-xl font-semibold transition-all duration-100 outline-none"
            style={btnStyle(vFocus === "cancel", false)}
          >
            Cancel
          </button>
          <button
            tabIndex={-1}
            onClick={() => { inputRef.current?.blur(); onConfirm(draft); }}
            className="px-10 py-4 rounded-2xl text-xl font-semibold transition-all duration-100 outline-none"
            style={btnStyle(vFocus === "ok", true)}
          >
            OK
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AdminSettings({
  open, onClose, settings, onSettingsChange, tiles, ipcp, onIpcpChange,
}: AdminSettingsProps) {
  const [focusIdx, setFocusIdx] = useState(0);

  // When non-null, a FloatingEditOverlay is shown for this IPCP field.
  const [editingField, setEditingField] = useState<{
    kind:  string;
    label: string;
    hint?: string;
    value: string;
    type:  "text" | "password" | "number";
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([]);

  const orderedTiles = (settings.tileOrder ?? [...ALL_TILE_IDS])
    .map(id => tiles.find(t => t.id === id))
    .filter((t): t is TileInfo => !!t);

  const IPCP_ITEMS: FocusItem[] = [
    { kind: "ipcp-host" },
    { kind: "ipcp-port" },
    { kind: "ipcp-user" },
    { kind: "ipcp-pass" },
    { kind: "ipcp-https" },
    { kind: "ipcp-tvid" },
  ];

  const items: FocusItem[] = [
    { kind: "signage" },
    ...orderedTiles.map((t, idx): FocusItem => ({ kind: "tile", id: t.id, idx })),
    ...IPCP_ITEMS,
  ];

  useEffect(() => {
    if (open) setFocusIdx(0);
  }, [open]);

  useEffect(() => {
    const el = itemRefs.current[focusIdx];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIdx]);

  // ── action helpers ─────────────────────────────────────────────────────────
  function setAutoSignage(enabled: boolean) {
    onSettingsChange({ ...settings, autoSignageEnabled: enabled });
  }
  function setTileVisible(id: string, visible: boolean) {
    onSettingsChange({ ...settings, tileVisibility: { ...settings.tileVisibility, [id]: visible } });
  }
  function moveTile(id: string, direction: "up" | "down") {
    const order = [...(settings.tileOrder ?? [...ALL_TILE_IDS])];
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
    onSettingsChange({ ...settings, tileOrder: order });
    setFocusIdx(1 + swapIdx);
  }

  // Opens the FloatingEditOverlay for the given IPCP text field.
  function openEdit(kind: string, label: string, value: string, type: "text"|"password"|"number" = "text", hint?: string) {
    setEditingField({ kind, label, hint, value, type });
  }

  function confirmEdit(newVal: string) {
    if (!editingField) return;
    switch (editingField.kind) {
      case "ipcp-host": onIpcpChange({ ...ipcp, ipcpHost: newVal }); break;
      case "ipcp-port": onIpcpChange({ ...ipcp, ipcpPort: Number(newVal) || 80 }); break;
      case "ipcp-user": onIpcpChange({ ...ipcp, ipcpUsername: newVal }); break;
      case "ipcp-pass": onIpcpChange({ ...ipcp, ipcpPassword: newVal }); break;
      case "ipcp-tvid": onIpcpChange({ ...ipcp, ipcpTvId: newVal }); break;
    }
    setEditingField(null);
  }

  // ── activate focused item ─────────────────────────────────────────────────
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
      case "ipcp-https":
        onIpcpChange({ ...ipcp, ipcpUseHttps: !ipcp.ipcpUseHttps });
        break;
      case "ipcp-host":
        openEdit("ipcp-host", "IPCP Host", ipcp.ipcpHost, "text", "IP address or hostname of the IPCP server");
        break;
      case "ipcp-port":
        openEdit("ipcp-port", "Port", String(ipcp.ipcpPort), "number", "Default: 80 (HTTP) or 443 (HTTPS)");
        break;
      case "ipcp-user":
        openEdit("ipcp-user", "Username", ipcp.ipcpUsername);
        break;
      case "ipcp-pass":
        openEdit("ipcp-pass", "Password", ipcp.ipcpPassword, "password");
        break;
      case "ipcp-tvid":
        openEdit("ipcp-tvid", "TV Identifier", ipcp.ipcpTvId, "text", `Sent as "tv" in every command. Leave blank to use device hostname.`);
        break;
      default:
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, items, settings, ipcp]);

  // ── D-pad handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // When the floating edit overlay is open it captures Enter/Escape itself
      // in the capture phase; block all D-pad navigation here too.
      if (editingField) return;

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
          if (cur?.kind === "ipcp-https") onIpcpChange({ ...ipcp, ipcpUseHttps: !ipcp.ipcpUseHttps });
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const cur = items[focusIdx];
          if (cur?.kind === "tile") moveTile(cur.id, "down");
          if (cur?.kind === "signage") setAutoSignage(!settings.autoSignageEnabled);
          if (cur?.kind === "ipcp-https") onIpcpChange({ ...ipcp, ipcpUseHttps: !ipcp.ipcpUseHttps });
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
  }, [open, focusIdx, items, settings, ipcp, activateFocused, editingField]);

  function setRef(idx: number) {
    return (el: HTMLDivElement | null) => { itemRefs.current[idx] = el; };
  }

  const tileStart = 1;
  const ipcpStart = 1 + orderedTiles.length;

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
          {/* Floating text-edit overlay — always above keyboard */}
          <AnimatePresence>
            {editingField && (
              <FloatingEditOverlay
                key={editingField.kind}
                label={editingField.label}
                hint={editingField.hint}
                initValue={editingField.value}
                type={editingField.type}
                onConfirm={confirmEdit}
                onCancel={() => setEditingField(null)}
              />
            )}
          </AnimatePresence>

          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative rounded-3xl flex flex-col w-[64rem] max-h-[85vh]"
            style={{ background: "rgba(30,30,30,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {/* Fixed header */}
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
              <button tabIndex={-1} onClick={onClose} className="p-3 rounded-xl hover:bg-muted transition-colors">
                <X className="w-8 h-8 text-muted-foreground" />
              </button>
            </div>

            <div className="h-px bg-border mx-16 shrink-0" />

            {/* Scrollable content */}
            <div ref={scrollRef} className="overflow-y-auto flex flex-col gap-8 px-16 py-8">

              {/* ── Auto Signage ── */}
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

              {/* ── Tile Visibility & Order ── */}
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-semibold text-foreground/80">Visible Tiles</h3>
                <p className="text-base text-muted-foreground">
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">OK</kbd> = toggle on/off &nbsp;·&nbsp;
                  <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">←</kbd> / <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono">→</kbd> = reorder
                </p>
                <div className="flex flex-col gap-2">
                  {orderedTiles.map((tile, idx) => {
                    const fi = tileStart + idx;
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

              {/* ── IPCP Configuration ── */}
              <div className="flex flex-col gap-3">
                <h3 className="text-2xl font-semibold text-foreground/80">IPCP Configuration</h3>
                <p className="text-base text-muted-foreground">
                  Connection settings for sending control commands (HDMI switch, Cast, AirPlay, Screen Off).
                  Navigate to a field and press OK/Enter to edit.
                </p>

                <div ref={setRef(ipcpStart + 0)} onClick={() => { setFocusIdx(ipcpStart + 0); openEdit("ipcp-host", "IPCP Host", ipcp.ipcpHost, "text", "IP address or hostname of the IPCP server"); }}>
                  <TextInputRow label="IPCP Host" hint="IP address or hostname of the IPCP server" value={ipcp.ipcpHost} focused={focusIdx === ipcpStart + 0} />
                </div>

                <div ref={setRef(ipcpStart + 1)} onClick={() => { setFocusIdx(ipcpStart + 1); openEdit("ipcp-port", "Port", String(ipcp.ipcpPort), "number", "Default: 80 (HTTP) or 443 (HTTPS)"); }}>
                  <TextInputRow label="Port" hint="Default: 80 (HTTP) or 443 (HTTPS)" value={String(ipcp.ipcpPort)} focused={focusIdx === ipcpStart + 1} type="number" />
                </div>

                <div ref={setRef(ipcpStart + 2)} onClick={() => { setFocusIdx(ipcpStart + 2); openEdit("ipcp-user", "Username", ipcp.ipcpUsername); }}>
                  <TextInputRow label="Username" value={ipcp.ipcpUsername} focused={focusIdx === ipcpStart + 2} />
                </div>

                <div ref={setRef(ipcpStart + 3)} onClick={() => { setFocusIdx(ipcpStart + 3); openEdit("ipcp-pass", "Password", ipcp.ipcpPassword, "password"); }}>
                  <TextInputRow label="Password" value={ipcp.ipcpPassword} focused={focusIdx === ipcpStart + 3} type="password" />
                </div>

                <div
                  ref={setRef(ipcpStart + 4)}
                  onClick={() => {
                    setFocusIdx(ipcpStart + 4);
                    onIpcpChange({ ...ipcp, ipcpUseHttps: !ipcp.ipcpUseHttps });
                  }}
                  className={rowClass(focusIdx === ipcpStart + 4)}
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex flex-col gap-0.5 flex-1">
                    <span className="text-xl font-medium text-foreground">Use HTTPS</span>
                    <span className="text-base text-muted-foreground">
                      Enable for TLS-secured connections (port 443 recommended)
                    </span>
                  </div>
                  <Toggle value={ipcp.ipcpUseHttps} />
                </div>

                <div ref={setRef(ipcpStart + 5)} onClick={() => { setFocusIdx(ipcpStart + 5); openEdit("ipcp-tvid", "TV Identifier", ipcp.ipcpTvId, "text", `Sent as "tv" in every command. Leave blank to use device hostname.`); }}>
                  <TextInputRow label="TV Identifier" hint={`Sent as "tv" in every command. Leave blank to use device hostname.`} value={ipcp.ipcpTvId} focused={focusIdx === ipcpStart + 5} />
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

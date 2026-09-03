import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import {
  adminGetSettings,
  adminSaveSettings,
  ApiError,
  type AdminTile,
} from "../lib/api";

/**
 * Server-side admin panel for the calling display. Opened by the gear button.
 * Prompts for the shared admin password (remembered for the browser session),
 * then edits tile visibility, order and auto-signage -- all saved server-side,
 * keyed by this display's hostname.
 */

const PW_KEY = "bravia_admin_pw";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Phase = "auth" | "loading" | "editing" | "saving";

export function AdminPanel({ open, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<Phase>("auth");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [tiles, setTiles] = useState<AdminTile[]>([]);
  const [autoSignage, setAutoSignage] = useState(true);

  const load = useCallback(async (pw: string) => {
    setPhase("loading");
    setError(null);
    try {
      const s = await adminGetSettings(pw);
      setDeviceLabel(s.device.label);
      setTiles(s.tiles);
      setAutoSignage(s.autoSignage);
      setPhase("editing");
      try {
        sessionStorage.setItem(PW_KEY, pw);
      } catch {
        /* sessionStorage may be unavailable; not fatal */
      }
    } catch (err) {
      setPhase("auth");
      if (err instanceof ApiError && err.status === 401) setError("Incorrect password.");
      else if (err instanceof ApiError && err.status === 503)
        setError("Admin is not configured on the server.");
      else setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // On open, try a remembered password so the prompt is skipped when possible.
  useEffect(() => {
    if (!open) return;
    setError(null);
    let remembered = "";
    try {
      remembered = sessionStorage.getItem(PW_KEY) ?? "";
    } catch {
      /* ignore */
    }
    if (remembered) {
      setPassword(remembered);
      void load(remembered);
    } else {
      setPhase("auth");
      setPassword("");
    }
  }, [open, load]);

  const move = (index: number, dir: -1 | 1) => {
    setTiles((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const toggle = (key: string) => {
    setTiles((prev) => prev.map((t) => (t.key === key ? { ...t, enabled: !t.enabled } : t)));
  };

  const save = async () => {
    setPhase("saving");
    setError(null);
    try {
      const enabled: Record<string, boolean> = {};
      for (const t of tiles) enabled[t.key] = t.enabled;
      await adminSaveSettings(password, {
        enabled,
        order: tiles.map((t) => t.key),
        autoSignage,
      });
      onSaved();
      onClose();
    } catch (err) {
      setPhase("editing");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col rounded-3xl"
            style={{
              background: "rgba(32,32,32,0.98)",
              border: "1px solid rgba(255,255,255,0.10)",
              width: "min(90vw, 44rem)",
              maxHeight: "86vh",
              padding: "2.5rem",
            }}
          >
            <button
              onClick={onClose}
              className="absolute right-6 top-6 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-8 h-8" />
            </button>

            {phase === "auth" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password) void load(password);
                }}
                className="flex flex-col gap-6"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-8 h-8 text-primary" />
                  <h2 className="text-3xl font-bold text-foreground">Admin</h2>
                </div>
                <p className="text-lg text-muted-foreground">
                  Enter the admin password to configure this display.
                </p>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="rounded-xl px-5 py-4 text-xl text-foreground outline-none"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                />
                {error && <p className="text-lg" style={{ color: "rgb(240,90,110)" }}>{error}</p>}
                <button
                  type="submit"
                  className="rounded-xl px-6 py-4 text-xl font-semibold text-white"
                  style={{ background: "rgb(196,18,48)" }}
                >
                  Unlock
                </button>
              </form>
            )}

            {phase === "loading" && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              </div>
            )}

            {(phase === "editing" || phase === "saving") && (
              <div className="flex flex-col gap-6 min-h-0">
                <div>
                  <h2 className="text-3xl font-bold text-foreground">Admin — {deviceLabel}</h2>
                  <p className="text-base text-muted-foreground mt-1">
                    Show/hide tiles and set their order for this display.
                  </p>
                </div>

                <label
                  className="flex items-center justify-between rounded-xl px-5 py-4 cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <span className="text-xl text-foreground">Return to signage when idle</span>
                  <input
                    type="checkbox"
                    checked={autoSignage}
                    onChange={(e) => setAutoSignage(e.target.checked)}
                    className="w-6 h-6 accent-[rgb(196,18,48)]"
                  />
                </label>

                <div className="flex flex-col gap-2 overflow-y-auto" style={{ minHeight: 0 }}>
                  {tiles.map((tile, idx) => (
                    <div
                      key={tile.key}
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{
                        background: tile.enabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                        opacity: tile.enabled ? 1 : 0.55,
                      }}
                    >
                      <div className="flex flex-col">
                        <button
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="text-white/50 hover:text-white disabled:opacity-20"
                          aria-label="Move up"
                        >
                          <ChevronUp className="w-6 h-6" />
                        </button>
                        <button
                          onClick={() => move(idx, 1)}
                          disabled={idx === tiles.length - 1}
                          className="text-white/50 hover:text-white disabled:opacity-20"
                          aria-label="Move down"
                        >
                          <ChevronDown className="w-6 h-6" />
                        </button>
                      </div>

                      <span className="flex-1 text-xl text-foreground">{tile.label}</span>
                      <span className="text-sm text-muted-foreground uppercase tracking-wide">{tile.kind}</span>

                      <button
                        onClick={() => toggle(tile.key)}
                        className="text-white/70 hover:text-white"
                        aria-label={tile.enabled ? "Hide" : "Show"}
                      >
                        {tile.enabled ? <Eye className="w-7 h-7" /> : <EyeOff className="w-7 h-7" />}
                      </button>
                    </div>
                  ))}
                </div>

                {error && <p className="text-lg" style={{ color: "rgb(240,90,110)" }}>{error}</p>}

                <div className="flex justify-end gap-4">
                  <button
                    onClick={onClose}
                    className="rounded-xl px-6 py-3 text-lg font-medium text-foreground"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void save()}
                    disabled={phase === "saving"}
                    className="rounded-xl px-8 py-3 text-lg font-semibold text-white flex items-center gap-2"
                    style={{ background: "rgb(196,18,48)" }}
                  >
                    {phase === "saving" && <Loader2 className="w-5 h-5 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

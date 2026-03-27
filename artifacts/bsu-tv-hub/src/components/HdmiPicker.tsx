import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertCircle } from "lucide-react";
import hdmiIcon from "@assets/Hdmi-Port--Streamline-Lucide_1774491136778.png";
import ScreenOff, { loadScreenOffConfig } from "../plugins/screen-off";
import { Capacitor } from "@capacitor/core";

// Port numbers match the physical HDMI labels printed on the Sony BZ30L panel.
// The Sony REST API (avContent/setPlayContent) uses 1-indexed port numbers
// that map directly to those labels — no HW0/HW1 translation needed.
const INPUTS = [
  { label: "Wall HDMI 1", port: 3 },
  { label: "Wall HDMI 2", port: 4 },
] as const;

type InputEntry = (typeof INPUTS)[number];

interface HdmiPickerProps {
  open: boolean;
  onClose: () => void;
}

type State = "idle" | "switching" | "error";

export function HdmiPicker({ open, onClose }: HdmiPickerProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [state, setState] = useState<State>("idle");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setState("idle");
      setSelectedLabel(null);
      setErrorMsg("");
      setFocusIndex(0);
    }
  }, [open]);

  async function handleSelect(entry: InputEntry) {
    setSelectedLabel(entry.label);
    setState("switching");

    if (!Capacitor.isNativePlatform()) {
      // In browser: just close after a moment (no real switching)
      setTimeout(() => onClose(), 2000);
      return;
    }

    // Use the Sony BRAVIA REST API (avContent/setPlayContent).
    // This is the same REST API used by Screen Off and is reliable on all
    // Sony Bravia displays — no TvContract channel setup required.
    const { ip, psk } = loadScreenOffConfig();
    try {
      const result = await ScreenOff.switchHdmi({ ip, psk, port: entry.port });
      if (result.success) {
        setTimeout(() => onClose(), 1500);
      } else {
        setErrorMsg(`API returned HTTP ${result.statusCode}. Check that the TV IP and PSK are set in Admin Settings.`);
        setState("error");
        setTimeout(() => onClose(), 5000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Could not reach Sony API: ${msg}. Set the TV IP and PSK in Admin Settings.`);
      setState("error");
      setTimeout(() => onClose(), 5000);
    }
  }

  useEffect(() => {
    if (!open || state !== "idle") return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(INPUTS.length - 1, i + 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleSelect(INPUTS[focusIndex]);
      } else if (
        e.key === "Escape" ||
        e.key === "Backspace" ||
        e.key === "GoBack"
      ) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, focusIndex, state, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(20,20,20,0.85)", backdropFilter: "blur(12px)" }}
          onClick={state === "idle" ? onClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col items-center gap-12"
            onClick={(e) => e.stopPropagation()}
          >
            {state === "idle" && (
              <>
                <h2 className="text-5xl font-bold text-foreground tracking-tight">
                  Select TV Input
                </h2>

                <div className="flex gap-10">
                  {INPUTS.map((entry, idx) => {
                    const focused = focusIndex === idx;
                    return (
                      <button
                        key={entry.label}
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setFocusIndex(idx)}
                        className="flex flex-col items-center justify-center gap-6 rounded-2xl px-16 py-10 transition-all duration-200 outline-none cursor-pointer"
                        style={{
                          background: focused
                            ? "rgba(55,55,55,0.9)"
                            : "rgba(38,38,38,0.75)",
                          boxShadow: focused
                            ? "0 0 0 3px rgb(220,40,65), 0 1rem 2.5rem rgba(0,0,0,0.5), 0 0 2.5rem 0.6rem rgba(220,40,65,0.25)"
                            : "0 0.5rem 1.5rem rgba(0,0,0,0.3)",
                          transform: focused ? "scale(1.04)" : "scale(1)",
                        }}
                      >
                        <img
                          src={hdmiIcon}
                          alt=""
                          className="w-24 h-24 object-contain brightness-0 invert"
                          style={{ opacity: focused ? 1 : 0.6 }}
                        />
                        <span
                          className="text-3xl font-semibold tracking-wide"
                          style={{
                            color: focused ? "white" : "rgba(255,255,255,0.65)",
                          }}
                        >
                          {entry.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="flex items-center gap-3 text-xl text-muted-foreground">
                  Press
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-6 h-6 text-foreground"
                      aria-hidden="true"
                    >
                      <path d="M9 14L4 9l5-5" />
                      <path d="M4 9h10.5a4.5 4.5 0 0 1 0 9H11" />
                    </svg>
                  </span>
                  to cancel
                </p>
              </>
            )}

            {state === "switching" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <Loader2 className="w-20 h-20 text-primary animate-spin" />
                <h2 className="text-5xl font-bold text-foreground">
                  Switching to {selectedLabel}…
                </h2>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6 max-w-3xl text-center"
              >
                <AlertCircle className="w-20 h-20 text-destructive" />
                <h2 className="text-4xl font-bold text-foreground">
                  Could not switch input
                </h2>
                <p className="text-xl text-muted-foreground">{errorMsg}</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

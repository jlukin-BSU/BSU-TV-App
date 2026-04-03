import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import hdmiIcon from "@assets/Hdmi-Port--Streamline-Lucide_1774491136778.png";
import { sendRelayCommand } from "../relay";
import type { RelaySettings } from "../hooks/use-hub-settings";

const INPUTS = [
  { label: "Wall HDMI 1", action: "HDMI1" },
  { label: "Wall HDMI 2", action: "HDMI2" },
] as const;

interface HdmiPickerProps {
  open:      boolean;
  onClose:   () => void;
  relayCfg:  RelaySettings;
}

type State = "idle" | "switching" | "error";

export function HdmiPicker({ open, onClose, relayCfg }: HdmiPickerProps) {
  const [focusIndex, setFocusIndex]       = useState(0);
  const [state, setState]                 = useState<State>("idle");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setState("idle");
      setSelectedLabel(null);
      setErrorMsg(null);
      setFocusIndex(0);
    }
  }, [open]);

  async function handleSelect(entry: (typeof INPUTS)[number]) {
    setSelectedLabel(entry.label);
    setState("switching");
    setErrorMsg(null);

    try {
      await sendRelayCommand(relayCfg.tvHostname, entry.action);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Relay command failed:", msg);
      setErrorMsg(msg);
      setState("error");
      setTimeout(() => {
        setState("idle");
        setErrorMsg(null);
      }, 3000);
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
      } else if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        className="flex flex-col items-center gap-6 p-10 rounded-3xl transition-all duration-200 outline-none"
                        style={{
                          background: focused ? "rgb(196,18,48)" : "rgba(255,255,255,0.08)",
                          border: focused
                            ? "2px solid rgb(196,18,48)"
                            : "2px solid rgba(255,255,255,0.12)",
                          transform: focused ? "scale(1.06)" : "scale(1)",
                          boxShadow: focused ? "0 8px 40px rgba(196,18,48,0.4)" : "none",
                          minWidth: "220px",
                        }}
                      >
                        <img
                          src={hdmiIcon}
                          alt=""
                          className="w-24 h-24 object-contain brightness-0 invert"
                          style={{ opacity: focused ? 1 : 0.65 }}
                        />
                        <span className="text-2xl font-bold text-foreground">{entry.label}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-muted-foreground text-lg flex items-center gap-2">
                  <span className="text-sm opacity-60">press</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-foreground" aria-hidden="true">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10.5a4.5 4.5 0 0 1 0 9H11" />
                  </svg>
                  to cancel
                </p>
              </>
            )}

            {state === "switching" && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6">
                <img src={hdmiIcon} alt="" className="w-28 h-28 object-contain brightness-0 invert opacity-60" />
                <h2 className="text-5xl font-bold text-foreground">Switching to {selectedLabel}…</h2>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6 text-center">
                <h2 className="text-4xl font-bold" style={{ color: "rgb(220,40,65)" }}>Could not switch input</h2>
                <p className="text-xl text-muted-foreground max-w-xl">{errorMsg}</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

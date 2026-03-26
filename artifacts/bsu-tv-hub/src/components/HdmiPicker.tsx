import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import hdmiIcon from "@assets/Hdmi-Port--Streamline-Lucide_1774491136778.png";

const INPUTS = ["Wall HDMI 1", "Wall HDMI 2"] as const;
type HdmiInput = typeof INPUTS[number];

interface HdmiPickerProps {
  open: boolean;
  onClose: () => void;
}

export function HdmiPicker({ open, onClose }: HdmiPickerProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const [selected, setSelected] = useState<HdmiInput | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setFocusIndex(0);
      return;
    }

    const handleKey = (e: KeyboardEvent) => {
      if (selected) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex(i => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex(i => Math.min(INPUTS.length - 1, i + 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelected(INPUTS[focusIndex]);
      } else if (e.key === "Escape" || e.key === "Backspace" || e.key === "GoBack") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, focusIndex, selected, onClose]);

  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => onClose(), 2000);
    return () => clearTimeout(t);
  }, [selected, onClose]);

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
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col items-center gap-12"
            onClick={e => e.stopPropagation()}
          >
            {!selected ? (
              <>
                <h2 className="text-5xl font-bold text-foreground tracking-tight">
                  Select TV Input
                </h2>

                <div className="flex gap-10">
                  {INPUTS.map((input, idx) => {
                    const focused = focusIndex === idx;
                    return (
                      <button
                        key={input}
                        onClick={() => setSelected(input)}
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
                          style={{ color: focused ? "white" : "rgba(255,255,255,0.65)" }}
                        >
                          {input}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xl text-muted-foreground">
                  Press <kbd className="font-sans font-semibold text-foreground bg-muted px-2 py-0.5 rounded border border-border">Esc</kbd> or Back to cancel
                </p>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <Loader2 className="w-20 h-20 text-primary animate-spin" />
                <h2 className="text-5xl font-bold text-foreground">
                  Switching to {selected}...
                </h2>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Settings, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import ScreenOff, { loadScreenOffConfig, saveScreenOffConfig } from "../plugins/screen-off";

interface AdminSettingsProps {
  open: boolean;
  onClose: () => void;
}

type TestState = "idle" | "testing" | "ok" | "fail";

export function AdminSettings({ open, onClose }: AdminSettingsProps) {
  const [ip, setIp]   = useState("127.0.0.1");
  const [psk, setPsk] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMsg, setTestMsg]     = useState("");
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    if (open) {
      const cfg = loadScreenOffConfig();
      setIp(cfg.ip);
      setPsk(cfg.psk);
      setTestState("idle");
      setTestMsg("");
      setSaved(false);
    }
  }, [open]);

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
        setTestMsg(`Unexpected status ${result.statusCode} — check PSK.`);
      }
    } catch (err) {
      setTestState("fail");
      setTestMsg(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative rounded-3xl p-16 flex flex-col gap-10 min-w-[56rem]"
            style={{ background: "rgba(30,30,30,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <Settings className="w-10 h-10 text-primary" />
                <h2 className="text-4xl font-bold text-foreground">Admin Settings</h2>
              </div>
              <button
                onClick={onClose}
                className="p-3 rounded-xl hover:bg-muted transition-colors"
              >
                <X className="w-8 h-8 text-muted-foreground" />
              </button>
            </div>

            <div className="h-px bg-border" />

            {/* Sony REST API section */}
            <div className="flex flex-col gap-6">
              <h3 className="text-2xl font-semibold text-foreground/80">
                Screen Off — Sony BRAVIA REST API
              </h3>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Set the Pre-Shared Key to match what's configured on this TV under
                Settings → Network → Home Network → IP Control → Pre-Shared Key.
                Leave the IP as <code className="text-primary font-mono">127.0.0.1</code> (default — the TV talks to itself).
              </p>

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xl font-medium text-foreground/70">TV IP Address</span>
                  <input
                    type="text"
                    value={ip}
                    onChange={e => setIp(e.target.value)}
                    placeholder="127.0.0.1"
                    className="rounded-xl px-6 py-4 text-2xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xl font-medium text-foreground/70">Pre-Shared Key (PSK)</span>
                  <input
                    type="password"
                    value={psk}
                    onChange={e => setPsk(e.target.value)}
                    placeholder="Enter PSK from TV settings"
                    className="rounded-xl px-6 py-4 text-2xl bg-muted border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                </label>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 mt-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-5 rounded-xl text-2xl font-semibold transition-colors"
                  style={{ background: "rgb(196,18,48)", color: "white" }}
                >
                  {saved ? "Saved!" : "Save"}
                </button>

                <button
                  onClick={handleTest}
                  disabled={testState === "testing"}
                  className="flex-1 py-5 rounded-xl text-2xl font-semibold bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  {testState === "testing" ? (
                    <span className="flex items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin" /> Testing…
                    </span>
                  ) : "Test Connection"}
                </button>
              </div>

              {/* Test result */}
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

            <p className="text-lg text-muted-foreground text-center">
              Access this panel by pressing the Back / Return button 5 times rapidly on the main screen.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

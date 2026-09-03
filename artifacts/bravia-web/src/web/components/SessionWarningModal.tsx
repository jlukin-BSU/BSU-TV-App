import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

const STORAGE_KEY = "bsu_session_warning_last";
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const COUNTDOWN_S = 5;

export function shouldShowSessionWarning(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return true;
  const last = parseInt(raw, 10);
  return isNaN(last) || Date.now() - last > COOLDOWN_MS;
}

export function recordSessionWarningShown(): void {
  localStorage.setItem(STORAGE_KEY, String(Date.now()));
}

interface Props {
  appName: string;
  onProceed: () => void;
}

export function SessionWarningModal({ appName, onProceed }: Props) {
  const [count, setCount] = useState(COUNTDOWN_S);

  useEffect(() => {
    recordSessionWarningShown();

    const interval = setInterval(() => {
      setCount(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onProceed();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onProceed]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="flex flex-col items-center gap-8 rounded-3xl px-16 py-12 text-center shadow-2xl"
        style={{
          background: "rgba(40,40,40,0.97)",
          border: "1px solid rgba(255,255,255,0.10)",
          maxWidth: "780px",
          width: "90%",
        }}
      >
        <AlertTriangle
          className="shrink-0"
          style={{ width: 64, height: 64, color: "rgb(196,18,48)" }}
          strokeWidth={1.5}
        />

        <div className="flex flex-col gap-4">
          <p
            className="text-white font-semibold leading-snug"
            style={{ fontSize: "1.75rem" }}
          >
            Shared TV — Accounts Not Saved
          </p>
          <p
            className="text-white leading-relaxed"
            style={{ fontSize: "1.25rem", opacity: 0.75 }}
          >
            Any accounts or logins you use in{" "}
            <span className="text-white font-semibold" style={{ opacity: 1 }}>
              {appName}
            </span>{" "}
            will be signed out when the TV is turned off. Do not save passwords
            or personal information on this device.
          </p>
        </div>

        {/* Countdown ring */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex items-center justify-center rounded-full font-bold text-white"
            style={{
              width: 72,
              height: 72,
              fontSize: "2rem",
              border: "4px solid rgba(196,18,48,0.7)",
              background: "rgba(196,18,48,0.15)",
            }}
          >
            {count}
          </div>
          <span style={{ fontSize: "1rem", color: "rgba(255,255,255,0.5)" }}>
            Opening {appName} in {count} second{count !== 1 ? "s" : ""}…
          </span>
        </div>
      </div>
    </div>
  );
}

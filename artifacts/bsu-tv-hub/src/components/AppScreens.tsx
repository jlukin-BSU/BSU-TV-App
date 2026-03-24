import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Tv, HdmiPort, MonitorOff, Loader2 } from "lucide-react";
import { useEffect } from "react";

export type AppId = "signage" | "livetv" | "youtube" | "hdmi" | "screenoff";

interface AppDef {
  id: AppId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  overlayText: string;
}

export const APPS: AppDef[] = [
  { id: "signage",   label: "News & Announcements", icon: Monitor, overlayText: "Launching News & Announcements..." },
  { id: "livetv",    label: "Live TV",    icon: Tv,        overlayText: "Opening Live TV..."       },
  { id: "youtube",   label: "YouTube",    icon: Monitor,   overlayText: "Opening YouTube..."       },
  { id: "hdmi",      label: "TV Inputs",  icon: HdmiPort,  overlayText: "Switching to TV Inputs..."  },
  { id: "screenoff", label: "Screen Off", icon: MonitorOff, overlayText: "Going to sleep..."       },
];

interface TransitionOverlayProps {
  appId: AppId | null;
}

export function TransitionOverlay({ appId }: TransitionOverlayProps) {
  const app = APPS.find(a => a.id === appId);

  return (
    <AnimatePresence>
      {app && app.id !== "screenoff" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center"
        >
          <Loader2 className="w-20 h-20 text-primary animate-spin mb-8" />
          <h2 className="text-5xl font-bold text-foreground">
            {app.overlayText}
          </h2>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ActiveAppScreenProps {
  appId: AppId | null;
  onExit: () => void;
}

export function ActiveAppScreen({ appId, onExit }: ActiveAppScreenProps) {
  const app = APPS.find(a => a.id === appId);

  useEffect(() => {
    if (!appId) return;

    const handleKey = (e: KeyboardEvent) => {
      if (appId === "screenoff") {
        e.preventDefault();
        onExit();
      } else {
        if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          onExit();
        }
      }
    };

    const handleMouse = () => {
      if (appId === "screenoff") onExit();
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("click", handleMouse);
    window.addEventListener("mousemove", handleMouse);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("click", handleMouse);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, [appId, onExit]);

  if (!app) return null;

  if (app.id === "screenoff") {
    return <div className="fixed inset-0 z-50 bg-black cursor-none" />;
  }

  const Icon = app.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center"
    >
      <Icon className="w-40 h-40 text-primary/50 mb-10" strokeWidth={1} />

      <h1 className="text-6xl font-bold text-foreground mb-4">
        {app.label}
      </h1>

      <p className="text-2xl text-muted-foreground">
        Placeholder view simulating launched application
      </p>

      <div className="absolute bottom-16 flex items-center gap-3 text-muted-foreground bg-card/50 px-8 py-4 rounded-full border border-border/50">
        <kbd className="font-sans font-semibold text-foreground bg-muted px-3 py-1 rounded-md border border-border">Esc</kbd>
        <span className="text-xl">or Back to return to hub</span>
      </div>
    </motion.div>
  );
}

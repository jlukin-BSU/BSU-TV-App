import { motion, AnimatePresence } from "framer-motion";
import { Power, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { YouTubeLogo } from "./YouTubeLogo";
import { HuluLogo, NetflixLogo, TubiLogo } from "./StreamingLogos";
import marketingIcon from "@assets/marketing_1774373576874.png";
import tvIcon from "@assets/tv_1774374146860.png";
import inputsIcon from "@assets/INPUTS_1774373576874.png";

export type AppId = "signage" | "livetv" | "youtube" | "hdmi" | "poweron" | "screenoff" | "hulu" | "netflix" | "tubi" | "cast" | "airplay";

interface AppDef {
  id: AppId;
  label: string;
  renderIcon: () => React.ReactNode;
  overlayText: string;
}

const pngIcon = (src: string) => (
  <img src={src} className="w-32 h-32 object-contain brightness-0 invert opacity-40 mb-10" alt="" />
);

export const APPS: AppDef[] = [
  {
    id: "signage",
    label: "News & Announcements",
    renderIcon: () => pngIcon(marketingIcon),
    overlayText: "Launching News & Announcements...",
  },
  {
    id: "livetv",
    label: "Live TV",
    renderIcon: () => pngIcon(tvIcon),
    overlayText: "Opening Live TV...",
  },
  {
    id: "youtube",
    label: "YouTube",
    renderIcon: () => <YouTubeLogo className="w-44 h-auto opacity-60 mb-10" focused={false} />,
    overlayText: "Opening YouTube...",
  },
  {
    id: "hdmi",
    label: "TV Inputs",
    renderIcon: () => pngIcon(inputsIcon),
    overlayText: "Switching to TV Inputs...",
  },
  {
    id: "screenoff",
    label: "Screen Off",
    renderIcon: () => <Power className="w-32 h-32 text-foreground/40 mb-10" strokeWidth={1.5} />,
    overlayText: "Going to sleep...",
  },
  {
    id: "hulu",
    label: "Hulu",
    renderIcon: () => <HuluLogo focused={false} />,
    overlayText: "Opening Hulu...",
  },
  {
    id: "netflix",
    label: "Netflix",
    renderIcon: () => <NetflixLogo focused={false} />,
    overlayText: "Opening Netflix...",
  },
  {
    id: "tubi",
    label: "Tubi",
    renderIcon: () => <TubiLogo focused={false} />,
    overlayText: "Opening Tubi...",
  },
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center"
    >
      {app.renderIcon()}

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

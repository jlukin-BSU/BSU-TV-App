import { useState, useCallback, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Power } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { TransitionOverlay, ActiveAppScreen, AppId } from "./components/AppScreens";
import { HdmiPicker } from "./components/HdmiPicker";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";
import AppLauncher, { OPTISIGNS_PACKAGE, XFINITY_INTENT_URI } from "./plugins/app-launcher";
import { Capacitor } from "@capacitor/core";

import marketingIcon from "@assets/marketing_1774373576874.png";
import tvIcon from "@assets/tv_1774374146860.png";
import inputsIcon from "@assets/INPUTS_1774373576874.png";
import cupolaWatermark from "@assets/BSU_watermark_red_1774490194557.png";

const queryClient = new QueryClient();

interface TileConfig {
  id: AppId;
  label: string;
  renderIcon: (focused: boolean) => React.ReactNode;
}

const iconClass = (focused: boolean) =>
  `w-20 h-20 object-contain transition-all duration-300 ${focused ? "brightness-0 invert opacity-100" : "brightness-0 invert opacity-70"}`;

const TILES: TileConfig[] = [
  {
    id: "signage",
    label: "News & Announcements",
    renderIcon: (focused) => (
      <img src={marketingIcon} alt="News & Announcements" className={iconClass(focused)} />
    ),
  },
  {
    id: "livetv",
    label: "Live TV",
    renderIcon: (focused) => (
      <img src={tvIcon} alt="Live TV" className={iconClass(focused)} />
    ),
  },
  {
    id: "hdmi",
    label: "TV Inputs",
    renderIcon: (focused) => (
      <img src={inputsIcon} alt="TV Inputs" className={iconClass(focused)} />
    ),
  },
  {
    id: "youtube",
    label: "YouTube",
    renderIcon: (focused) => (
      <YouTubeLogo className="w-28 h-auto" focused={focused} />
    ),
  },
  {
    id: "screenoff",
    label: "Screen Off",
    renderIcon: (focused) => (
      <Power
        className={`w-20 h-20 transition-all duration-300 ${focused ? "text-white opacity-100" : "text-white opacity-70"}`}
        strokeWidth={2}
      />
    ),
  },
];

/** Apps that hand off to an external Android application rather than showing
 *  an in-app screen. The hub stays alive underneath; pressing Home returns.
 *  Provide either packageName (default launch intent) or intentUri (Android intent URI). */
interface ExternalApp {
  packageName?: string;
  intentUri?: string;
}

const EXTERNAL_APPS: Partial<Record<AppId, ExternalApp>> = {
  signage: { packageName: OPTISIGNS_PACKAGE },
  livetv:  { intentUri: XFINITY_INTENT_URI },
};

function HubScreen() {
  const [focusIndex, setFocusIndex] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<AppId | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [hdmiPickerOpen, setHdmiPickerOpen] = useState(false);

  const columns = 3;

  /** Reset hub state when we come back into focus from an external app. */
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        setTransitioningTo(null);
        setActiveApp(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const launchApp = useCallback(async (appId: AppId) => {
    if (transitioningTo || activeApp || hdmiPickerOpen) return;

    if (appId === "hdmi") {
      setHdmiPickerOpen(true);
      return;
    }

    if (appId === "screenoff") {
      setActiveApp("screenoff");
      return;
    }

    const externalPackage = EXTERNAL_APPS[appId];

    if (externalPackage) {
      // Show the launching overlay for a moment, then hand off to the external app.
      // The hub remains alive underneath; Home button brings it back.
      setTransitioningTo(appId);

      if (Capacitor.isNativePlatform()) {
        try {
          if (externalPackage.intentUri) {
            await AppLauncher.launchUri({ uri: externalPackage.intentUri });
          } else if (externalPackage.packageName) {
            await AppLauncher.launch({ packageName: externalPackage.packageName });
          }
        } catch (err) {
          console.warn("AppLauncher failed:", err);
        }
        // Clear overlay — OptiSigns is now in the foreground
        setTransitioningTo(null);
      } else {
        // In the browser (dev/preview), fall through to the placeholder screen
        setTimeout(() => {
          setActiveApp(appId);
          setTransitioningTo(null);
        }, 2500);
      }
      return;
    }

    // All other in-app screens (livetv, youtube, etc.)
    setTransitioningTo(appId);
    setTimeout(() => {
      setActiveApp(appId);
      setTransitioningTo(null);
    }, 2500);
  }, [transitioningTo, activeApp, hdmiPickerOpen]);

  useTvIdle(
    300000,
    () => launchApp("signage"),
    activeApp === null && transitioningTo === null && !hdmiPickerOpen
  );

  useDPad({
    isActive: activeApp === null && transitioningTo === null && !hdmiPickerOpen,
    currentIndex: focusIndex,
    maxIndex: TILES.length - 1,
    columns,
    onNavigate: (idx) => setFocusIndex(idx),
    onEnter: () => launchApp(TILES[focusIndex].id),
    onBack: () => {},
  });

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">

      {/* Cupola watermark */}
      <img
        src={cupolaWatermark}
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{
          right: "-4%",
          bottom: "-5%",
          height: "80%",
          width: "auto",
          opacity: 0.35,
        }}
      />

      <TopBar />

      <div className="w-full max-w-7xl mx-auto px-16 mt-36 z-10">
        <div className="grid grid-cols-3 gap-10">
          {TILES.map((tile, idx) => (
            <TvTile
              key={tile.id}
              id={tile.id}
              label={tile.label}
              icon={tile.renderIcon(focusIndex === idx)}
              isFocused={focusIndex === idx}
              onClick={() => {
                setFocusIndex(idx);
                launchApp(tile.id);
              }}
              onHover={() => {
                if (activeApp === null && transitioningTo === null) {
                  setFocusIndex(idx);
                }
              }}
            />
          ))}
        </div>
      </div>

      <HdmiPicker open={hdmiPickerOpen} onClose={() => setHdmiPickerOpen(false)} />
      <TransitionOverlay appId={transitioningTo} />
      <ActiveAppScreen appId={activeApp} onExit={() => setActiveApp(null)} />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HubScreen />
    </QueryClientProvider>
  );
}

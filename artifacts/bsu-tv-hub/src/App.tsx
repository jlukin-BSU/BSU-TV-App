import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Power } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { NetflixLogo, HuluLogo, TubiLogo } from "./components/StreamingLogos";
import { TransitionOverlay, ActiveAppScreen, AppId } from "./components/AppScreens";
import { HdmiPicker } from "./components/HdmiPicker";
import { AdminSettings } from "./components/AdminSettings";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";
import { useHubSettings } from "./hooks/use-hub-settings";
import AppLauncher, { OPTISIGNS_PACKAGE } from "./plugins/app-launcher";
import ScreenOff, { loadScreenOffConfig } from "./plugins/screen-off";
import { Capacitor } from "@capacitor/core";

import marketingIcon from "@assets/marketing_1774373576874.png";
import tvIcon from "@assets/tv_1774374146860.png";
import inputsIcon from "@assets/INPUTS_1774373576874.png";
import cupolaWatermark from "@assets/BSU_watermark_red_1774490194557.png";

const queryClient = new QueryClient();

interface TileConfig {
  id: AppId;
  label: string;
  /** When true the text label is omitted on the home screen tile (logo is the wordmark). */
  logoOnly?: boolean;
  renderIcon: (focused: boolean) => React.ReactNode;
}

const iconClass = (focused: boolean) =>
  `w-20 h-20 object-contain transition-all duration-300 ${focused ? "brightness-0 invert opacity-100" : "brightness-0 invert opacity-70"}`;

const ALL_TILES: TileConfig[] = [
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
  {
    id: "hulu",
    label: "Hulu",
    logoOnly: true,
    renderIcon: (focused) => <HuluLogo focused={focused} />,
  },
  {
    id: "netflix",
    label: "Netflix",
    logoOnly: true,
    renderIcon: (focused) => <NetflixLogo focused={focused} />,
  },
  {
    id: "tubi",
    label: "Tubi",
    logoOnly: true,
    renderIcon: (focused) => <TubiLogo focused={focused} />,
  },
];

interface ExternalApp {
  packageName?: string;
  intentUri?: string;
}

const EXTERNAL_APPS: Partial<Record<AppId, ExternalApp>> = {
  signage:  { packageName: OPTISIGNS_PACKAGE },
  livetv:   { packageName: "com.xfinity.cloudtvr" },
  youtube:  { packageName: "com.google.android.youtube.tv" },
  hulu:     { packageName: "com.hulu.plus" },
  netflix:  { packageName: "com.netflix.ninja" },
  tubi:     { packageName: "com.tubitv" },
};

/** Number of Back/Return key presses within the time window to open admin settings. */
const ADMIN_CLICK_COUNT = 5;
const ADMIN_CLICK_WINDOW_MS = 3000;

function HubScreen() {
  const [settings, updateSettings] = useHubSettings();
  const [focusIndex, setFocusIndex] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<AppId | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [hdmiPickerOpen, setHdmiPickerOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const adminKeyTimes = useRef<number[]>([]);

  const visibleTiles = useMemo(() => {
    const order = settings.tileOrder ?? ALL_TILES.map(t => t.id);
    return order
      .map(id => ALL_TILES.find(t => t.id === id))
      .filter((t): t is TileConfig => !!t && settings.tileVisibility[t.id] !== false);
  }, [settings.tileVisibility, settings.tileOrder]);

  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  /** Keep focusIndex in bounds when tile list changes. */
  useEffect(() => {
    if (focusIndex >= visibleTiles.length) {
      setFocusIndex(Math.max(0, visibleTiles.length - 1));
    }
  }, [visibleTiles.length, focusIndex]);

  /** Scroll focused tile into view when navigating with D-pad. */
  useEffect(() => {
    const el = tileRefs.current[focusIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusIndex]);

  /**
   * Admin trigger: press the Back / Return button 5 times rapidly while the
   * main hub screen is showing (no overlays open).  On Android TV the back
   * button arrives as an Escape keydown event inside the WebView.
   */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (activeApp !== null || transitioningTo !== null || hdmiPickerOpen || adminOpen) return;

      const now = Date.now();
      const times = adminKeyTimes.current.filter(t => now - t < ADMIN_CLICK_WINDOW_MS);
      times.push(now);
      adminKeyTimes.current = times;

      if (times.length >= ADMIN_CLICK_COUNT) {
        adminKeyTimes.current = [];
        setAdminOpen(true);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeApp, transitioningTo, hdmiPickerOpen, adminOpen]);

  /** Logo click still works for mouse/touch access during development. */
  const handleLogoClick = useCallback(() => {
    const now = Date.now();
    const times = adminKeyTimes.current.filter(t => now - t < ADMIN_CLICK_WINDOW_MS);
    times.push(now);
    adminKeyTimes.current = times;
    if (times.length >= ADMIN_CLICK_COUNT) {
      adminKeyTimes.current = [];
      setAdminOpen(true);
    }
  }, []);

  const launchApp = useCallback(async (appId: AppId) => {
    if (transitioningTo || activeApp || hdmiPickerOpen || adminOpen) return;

    if (appId === "hdmi") {
      setHdmiPickerOpen(true);
      return;
    }

    if (appId === "screenoff") {
      if (Capacitor.isNativePlatform()) {
        const { ip, psk } = loadScreenOffConfig();
        try {
          await ScreenOff.powerOff({ ip, psk });
        } catch (err) {
          console.warn("Screen off API failed, falling back to black screen:", err);
          setActiveApp("screenoff");
        }
      } else {
        setActiveApp("screenoff");
      }
      return;
    }

    const externalApp = EXTERNAL_APPS[appId];

    if (externalApp) {
      setTransitioningTo(appId);

      if (Capacitor.isNativePlatform()) {
        try {
          if (externalApp.intentUri) {
            await AppLauncher.launchUri({ uri: externalApp.intentUri });
          } else if (externalApp.packageName) {
            await AppLauncher.launch({ packageName: externalApp.packageName });
          }
        } catch (err) {
          console.warn("AppLauncher failed:", err);
        }
        setTransitioningTo(null);
      } else {
        setTimeout(() => {
          setActiveApp(appId);
          setTransitioningTo(null);
        }, 2500);
      }
      return;
    }

    setTransitioningTo(appId);
    setTimeout(() => {
      setActiveApp(appId);
      setTransitioningTo(null);
    }, 2500);
  }, [transitioningTo, activeApp, hdmiPickerOpen, adminOpen]);

  const hubIsIdle = activeApp === null && transitioningTo === null && !hdmiPickerOpen && !adminOpen;

  useTvIdle(
    300000,
    () => launchApp("signage"),
    hubIsIdle && settings.autoSignageEnabled
  );

  useDPad({
    isActive: hubIsIdle,
    currentIndex: focusIndex,
    maxIndex: visibleTiles.length - 1,
    columns,
    onNavigate: (idx) => setFocusIndex(idx),
    onEnter: () => launchApp(visibleTiles[focusIndex].id),
    onBack: () => {},
  });

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden">

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

      <TopBar onLogoClick={handleLogoClick} />

      {/* Scrollable tile area — mask fades content behind the header, pt keeps tiles fully visible at rest */}
      <div
        className="flex-1 overflow-y-auto z-10"
        style={{
          paddingTop: "14rem",
          paddingBottom: "2rem",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, transparent 8rem, black 11rem)",
          maskImage: "linear-gradient(to bottom, transparent 0, transparent 8rem, black 11rem)",
        }}
      >
        <div className="w-full max-w-7xl mx-auto px-16">
          <div className="grid grid-cols-3 gap-8">
            {visibleTiles.map((tile, idx) => (
              <div key={tile.id} ref={el => { tileRefs.current[idx] = el; }}>
                <TvTile
                  id={tile.id}
                  label={tile.logoOnly ? undefined : tile.label}
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
              </div>
            ))}
          </div>
        </div>
      </div>

      <HdmiPicker open={hdmiPickerOpen} onClose={() => setHdmiPickerOpen(false)} />
      <TransitionOverlay appId={transitioningTo} />
      <ActiveAppScreen appId={activeApp} onExit={() => setActiveApp(null)} />
      <AdminSettings
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        settings={settings}
        onSettingsChange={updateSettings}
        tiles={ALL_TILES.map(t => ({ id: t.id, label: t.label }))}
      />
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

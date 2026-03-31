import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Power, AlertCircle } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { NetflixLogo, HuluLogo, TubiLogo } from "./components/StreamingLogos";
import { TransitionOverlay, ActiveAppScreen, AppId } from "./components/AppScreens";
import { AdminSettings } from "./components/AdminSettings";
import { HdmiPicker } from "./components/HdmiPicker";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";
import { useHubSettings, useIpcpSettings } from "./hooks/use-hub-settings";
import AppLauncher, { OPTISIGNS_PACKAGE } from "./plugins/app-launcher";
import { sendIpcpCommand, IpcpAction } from "./ipcp";
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

/** Material Symbols icon — cast or airplay */
function MaterialIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <span
      style={{
        fontFamily: "'Material Symbols Outlined'",
        fontWeight: "normal",
        fontStyle: "normal",
        fontSize: "80px",
        lineHeight: 1,
        letterSpacing: "normal",
        textTransform: "none",
        whiteSpace: "nowrap",
        display: "inline-block",
        direction: "ltr",
        userSelect: "none",
        fontFeatureSettings: "'liga'",
        WebkitFontSmoothing: "antialiased",
        fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48",
        color: "white",
        opacity: focused ? 1 : 0.7,
        transition: "opacity 0.3s",
      } as React.CSSProperties}
    >
      {name}
    </span>
  );
}

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
    id: "cast",
    label: "Cast",
    renderIcon: (focused) => <MaterialIcon name="cast" focused={focused} />,
  },
  {
    id: "airplay",
    label: "AirPlay",
    renderIcon: (focused) => <MaterialIcon name="airplay" focused={focused} />,
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
  livetv:   { packageName: "com.plexapp.android" },
  youtube:  { packageName: "com.google.android.youtube.tv" },
  hulu:     { packageName: "com.hulu.plus" },
  netflix:  { packageName: "com.netflix.ninja" },
  tubi:     { packageName: "com.tubitv" },
};

/** AppIds that dispatch an IPCP command instead of launching an Android app. */
const IPCP_TILE_ACTIONS: Partial<Record<AppId, IpcpAction>> = {
  screenoff: IpcpAction.PWROFF,
  cast:      IpcpAction.CAST,
  airplay:   IpcpAction.AIRPLAY,
};

/** Number of Back/Return key presses within the time window to open admin settings. */
const ADMIN_CLICK_COUNT = 5;
const ADMIN_CLICK_WINDOW_MS = 3000;

function HubScreen() {
  const [settings, updateSettings] = useHubSettings();
  const [ipcp, updateIpcp]         = useIpcpSettings();
  const [focusIndex, setFocusIndex] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<AppId | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [hdmiPickerOpen, setHdmiPickerOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [topBarOpacity, setTopBarOpacity] = useState(1);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const adminKeyTimes = useRef<number[]>([]);
  const adminLastPress = useRef<number>(0);

  const visibleTiles = useMemo(() => {
    const order = settings.tileOrder ?? ALL_TILES.map(t => t.id);
    return order
      .map(id => ALL_TILES.find(t => t.id === id))
      .filter((t): t is TileConfig => !!t && settings.tileVisibility[t.id] !== false);
  }, [settings.tileVisibility, settings.tileOrder]);

  const tileRefs    = useRef<(HTMLDivElement | null)[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

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

  /** Scroll focused tile into view. Top row → scroll to top so banner is fully visible. */
  useEffect(() => {
    if (focusIndex < columns) {
      const scroller = scrollerRef.current;
      if (scroller) {
        scroller.scrollTo({ top: 0, behavior: "smooth" });
        setTopBarOpacity(1);
      }
    } else {
      const el = tileRefs.current[focusIndex];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusIndex, columns]);

  /**
   * Shared admin-trigger counter.
   * Three channels: D-pad Up ×5 (top row), RED button ×5 (Java), Escape ×5 (browser).
   * 100 ms dedup prevents double-counting a single physical press.
   */
  const recordAdminPress = useCallback(() => {
    if (activeApp !== null || transitioningTo !== null || hdmiPickerOpen || adminOpen) return;
    const now = Date.now();
    if (now - adminLastPress.current < 100) return;
    adminLastPress.current = now;
    const times = adminKeyTimes.current.filter(t => now - t < ADMIN_CLICK_WINDOW_MS);
    times.push(now);
    adminKeyTimes.current = times;
    if (times.length >= ADMIN_CLICK_COUNT) {
      adminKeyTimes.current = [];
      setAdminOpen(true);
    }
  }, [activeApp, transitioningTo, hdmiPickerOpen, adminOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") recordAdminPress();
    };
    const handleColorBtn = (e: Event) => {
      const detail = (e as CustomEvent<{ color: string }>).detail;
      if (detail?.color === "red") recordAdminPress();
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("tv:color", handleColorBtn);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("tv:color", handleColorBtn);
    };
  }, [recordAdminPress]);

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

    // IPCP tiles: screenoff, cast, airplay
    const ipcpAction = IPCP_TILE_ACTIONS[appId];
    if (ipcpAction) {
      setLaunchError(null);
      try {
        await sendIpcpCommand(ipcpAction, ipcp);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`IPCP ${ipcpAction} failed:`, msg);
        setLaunchError(msg);
        setTimeout(() => setLaunchError(null), 5000);
      }
      return;
    }

    const externalApp = EXTERNAL_APPS[appId];

    if (externalApp) {
      setTransitioningTo(appId);
      setLaunchError(null);

      if (Capacitor.isNativePlatform()) {
        try {
          if (externalApp.intentUri) {
            await AppLauncher.launchUri({ uri: externalApp.intentUri });
          } else if (externalApp.packageName) {
            await AppLauncher.launch({ packageName: externalApp.packageName });
          }
          setTransitioningTo(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("AppLauncher failed:", msg);
          setTransitioningTo(null);
          setLaunchError(msg);
          setTimeout(() => setLaunchError(null), 5000);
        }
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
  }, [transitioningTo, activeApp, hdmiPickerOpen, adminOpen, ipcp]);

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
    onBounceUp: recordAdminPress,
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

      <TopBar onLogoClick={handleLogoClick} opacity={topBarOpacity} />

      {/* Scrollable tile area */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto z-10"
        style={{ paddingTop: "12rem", paddingBottom: "2rem" }}
        onScroll={(e) => {
          const scrollY = (e.currentTarget as HTMLDivElement).scrollTop;
          const opacity = Math.max(0, 1 - scrollY / 80);
          setTopBarOpacity(opacity);
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

      {/* App-launch error toast */}
      {launchError && (
        <div
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-8 py-5 rounded-2xl text-white text-xl font-medium shadow-2xl"
          style={{ background: "rgba(196,18,48,0.92)", backdropFilter: "blur(8px)", maxWidth: "72rem" }}
        >
          <AlertCircle className="shrink-0 w-8 h-8" />
          <span>{launchError}</span>
        </div>
      )}

      <HdmiPicker
        open={hdmiPickerOpen}
        onClose={() => setHdmiPickerOpen(false)}
        ipcpCfg={ipcp}
      />
      <TransitionOverlay appId={transitioningTo} />
      <ActiveAppScreen appId={activeApp} onExit={() => setActiveApp(null)} />
      <AdminSettings
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        settings={settings}
        onSettingsChange={updateSettings}
        tiles={ALL_TILES.map(t => ({ id: t.id, label: t.label }))}
        ipcp={ipcp}
        onIpcpChange={updateIpcp}
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

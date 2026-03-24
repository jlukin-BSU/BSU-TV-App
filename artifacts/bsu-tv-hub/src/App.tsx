import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Power } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { TransitionOverlay, ActiveAppScreen, AppId } from "./components/AppScreens";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";

import marketingIcon from "@assets/marketing_1774373576874.png";
import tvIcon from "@assets/tv_1774374146860.png";
import inputsIcon from "@assets/INPUTS_1774373576874.png";

const queryClient = new QueryClient();

interface TileConfig {
  id: AppId;
  label: string;
  renderIcon: (focused: boolean) => React.ReactNode;
}

const iconClass = (focused: boolean) =>
  `w-28 h-28 object-contain transition-all duration-300 ${focused ? "brightness-0 invert opacity-100" : "brightness-0 invert opacity-70"}`;

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
    id: "youtube",
    label: "YouTube",
    renderIcon: (focused) => (
      <YouTubeLogo className="w-36 h-auto" focused={focused} />
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
    id: "screenoff",
    label: "Screen Off",
    renderIcon: (focused) => (
      <Power
        className={`w-28 h-28 transition-all duration-300 ${focused ? "text-white opacity-100" : "text-white opacity-70"}`}
        strokeWidth={2}
      />
    ),
  },
];

function HubScreen() {
  const [focusIndex, setFocusIndex] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<AppId | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);

  const columns = 3;

  const launchApp = useCallback((appId: AppId) => {
    if (transitioningTo || activeApp) return;

    if (appId === "screenoff") {
      setActiveApp("screenoff");
      return;
    }

    setTransitioningTo(appId);
    setTimeout(() => {
      setActiveApp(appId);
      setTransitioningTo(null);
    }, 2500);
  }, [transitioningTo, activeApp]);

  useTvIdle(
    300000,
    () => launchApp("signage"),
    activeApp === null && transitioningTo === null
  );

  useDPad({
    isActive: activeApp === null && transitioningTo === null,
    currentIndex: focusIndex,
    maxIndex: TILES.length - 1,
    columns,
    onNavigate: (idx) => setFocusIndex(idx),
    onEnter: () => launchApp(TILES[focusIndex].id),
    onBack: () => {},
  });

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">

      {/* BSU brand background — diagonal panels inspired by brand lockscreen */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Crimson red upper-left panel */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgb(196,18,48)",
          clipPath: "polygon(0 0, 60% 0, 30% 100%, 0 100%)",
        }} />
        {/* Dark blade 1 — cuts through red, creates depth */}
        <div style={{
          position: "absolute", inset: 0,
          background: "#1c1c1c",
          clipPath: "polygon(37% 0, 50% 0, 19% 100%, 7% 100%)",
        }} />
        {/* Dark blade 2 */}
        <div style={{
          position: "absolute", inset: 0,
          background: "#181818",
          clipPath: "polygon(46% 0, 60% 0, 29% 100%, 17% 100%)",
        }} />
        {/* Vignette overlay — keeps lower half dark and tiles legible */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(150deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.68) 100%)",
        }} />
      </div>

      <TopBar />

      <div className="w-full max-w-7xl mx-auto px-16 mt-24 z-10">
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

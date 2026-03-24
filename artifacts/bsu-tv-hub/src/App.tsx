import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Monitor, Tv, Cast, MonitorOff } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { TransitionOverlay, ActiveAppScreen, AppId } from "./components/AppScreens";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";

const queryClient = new QueryClient();

interface TileConfig {
  id: AppId;
  label: string;
  renderIcon: (focused: boolean) => React.ReactNode;
}

const TILES: TileConfig[] = [
  {
    id: "signage",
    label: "Signage",
    renderIcon: (focused) => (
      <Monitor
        className={`w-28 h-28 transition-colors duration-300 ${focused ? "text-primary" : "text-foreground/70"}`}
        strokeWidth={1.25}
      />
    ),
  },
  {
    id: "livetv",
    label: "Live TV",
    renderIcon: (focused) => (
      <Tv
        className={`w-28 h-28 transition-colors duration-300 ${focused ? "text-primary" : "text-foreground/70"}`}
        strokeWidth={1.25}
      />
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
      <Cast
        className={`w-28 h-28 transition-colors duration-300 ${focused ? "text-primary" : "text-foreground/70"}`}
        strokeWidth={1.25}
      />
    ),
  },
  {
    id: "screenoff",
    label: "Screen Off",
    renderIcon: (focused) => (
      <MonitorOff
        className={`w-28 h-28 transition-colors duration-300 ${focused ? "text-primary" : "text-foreground/70"}`}
        strokeWidth={1.25}
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
    <div className="relative min-h-screen w-full bg-background flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />

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

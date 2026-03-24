import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { TransitionOverlay, ActiveAppScreen, APPS, AppId } from "./components/AppScreens";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";

const queryClient = new QueryClient();

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
    maxIndex: APPS.length - 1,
    columns,
    onNavigate: (idx) => setFocusIndex(idx),
    onEnter: () => launchApp(APPS[focusIndex].id),
    onBack: () => {},
  });

  return (
    <div className="relative min-h-screen w-full bg-background flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />

      <TopBar />

      <div className="w-full max-w-7xl mx-auto px-16 mt-20 z-10">
        <div className="grid grid-cols-3 gap-10">
          {APPS.map((app, idx) => {
            const Icon = app.icon;
            const isYouTube = app.id === "youtube";

            return (
              <TvTile
                key={app.id}
                id={app.id}
                label={isYouTube ? undefined : app.label}
                icon={
                  <Icon
                    className={`
                      ${isYouTube ? 'w-48 h-48 text-[#FF0000]' : 'w-24 h-24'}
                      ${isYouTube && focusIndex === idx ? 'drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]' : ''}
                    `}
                    strokeWidth={isYouTube ? 2 : 1.5}
                  />
                }
                isFocused={focusIndex === idx}
                onClick={() => {
                  setFocusIndex(idx);
                  launchApp(app.id);
                }}
                onHover={() => {
                  if (activeApp === null && transitioningTo === null) {
                    setFocusIndex(idx);
                  }
                }}
              />
            );
          })}
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

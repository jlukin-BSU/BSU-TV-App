import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Power, AlertCircle, MonitorPlay } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { TvTile } from "./components/TvTile";
import { YouTubeLogo } from "./components/YouTubeLogo";
import { NetflixLogo, HuluLogo, TubiLogo } from "./components/StreamingLogos";
import { TransitionOverlay, ActiveAppScreen, type AppId } from "./components/AppScreens";
import { BrandLogo, hasBrandLogo } from "./components/BrandLogos";
import { HdmiPicker } from "./components/HdmiPicker";
import { SessionWarningModal } from "./components/SessionWarningModal";
import { AdminPanel } from "./components/AdminPanel";
import { useDPad } from "./hooks/use-dpad";
import { useTvIdle } from "./hooks/use-idle";
import { useConfig } from "./hooks/use-config";
import { launchApp as apiLaunchApp, sendCommand as apiSendCommand } from "./lib/api";
import type { ClientConfig, ClientTile } from "../shared/catalog";

import marketingIcon from "@assets/marketing_1774373576874.png";
import tvIcon from "@assets/tv_1774374146860.png";
import inputsIcon from "@assets/INPUTS_1774373576874.png";
import cupolaWatermark from "@assets/BSU_watermark_red_1774490194557.png";

const queryClient = new QueryClient();

const iconClass = (focused: boolean) =>
  `w-20 h-20 object-contain transition-all duration-300 ${focused ? "brightness-0 invert opacity-100" : "brightness-0 invert opacity-70"}`;

/**
 * A tile in the grid. `kind` decides what activating it does:
 *   app     -> POST /api/app {id}
 *   inputs  -> open the HDMI picker (which POSTs /api/input)
 *   command -> POST /api/command {id}
 */
interface TileDef {
  key: string;
  kind: "app" | "inputs" | "command";
  serverId?: string;
  label: string;
  logoOnly?: boolean;
  overlayId?: AppId;
  renderIcon: (focused: boolean) => React.ReactNode;
}

/**
 * Every streaming/Android app shows the "accounts not saved" warning on each
 * open. Only signage (internal News & Announcements) is exempt among apps;
 * inputs and screen commands never warn.
 */
const NO_WARNING_APP_IDS = new Set(["signage"]);

const powerIcon = (focused: boolean) => (
  <Power className={`w-20 h-20 transition-all duration-300 ${focused ? "text-white opacity-100" : "text-white opacity-70"}`} strokeWidth={2} />
);

function appTile(id: string, label: string): TileDef {
  const base = { key: id, kind: "app" as const, serverId: id, label, overlayId: id as AppId };
  switch (id) {
    case "signage":
      return { ...base, renderIcon: (f) => <img src={marketingIcon} alt="" className={iconClass(f)} /> };
    case "livetv":
      return { ...base, renderIcon: (f) => <img src={tvIcon} alt="" className={iconClass(f)} /> };
    case "youtube":
      return { ...base, renderIcon: (f) => <YouTubeLogo className="w-28 h-auto" focused={f} /> };
    case "hulu":
      return { ...base, logoOnly: true, renderIcon: (f) => <HuluLogo focused={f} /> };
    case "netflix":
      return { ...base, logoOnly: true, renderIcon: (f) => <NetflixLogo focused={f} /> };
    case "tubi":
      return { ...base, logoOnly: true, renderIcon: (f) => <TubiLogo focused={f} /> };
    default:
      // Apps with an uploaded official logo (Prime, Disney+, Max, ...) render it
      // on a chip; anything still lacking art falls back to a neutral glyph +
      // label until its logo is added.
      if (hasBrandLogo(id)) {
        return { ...base, logoOnly: true, renderIcon: (f) => <BrandLogo appKey={id} focused={f} /> };
      }
      return {
        ...base,
        renderIcon: (f) => (
          <MonitorPlay
            className={`w-16 h-16 transition-all duration-300 ${f ? "text-white opacity-100" : "text-white opacity-70"}`}
            strokeWidth={1.5}
          />
        ),
      };
  }
}

/** Map the server's ordered, enabled tiles to renderable tile defs. */
function buildTiles(clientTiles: ClientTile[]): TileDef[] {
  return clientTiles.map((t) => {
    if (t.kind === "input") {
      return {
        key: t.key,
        kind: "inputs",
        label: t.label,
        overlayId: "hdmi",
        renderIcon: (f: boolean) => <img src={inputsIcon} alt="" className={iconClass(f)} />,
      };
    }
    if (t.kind === "command") {
      return {
        key: t.key,
        kind: "command",
        serverId: t.key,
        label: t.label,
        overlayId: t.key === "screenoff" ? ("screenoff" as AppId) : undefined,
        renderIcon: powerIcon,
      };
    }
    return appTile(t.key, t.label);
  });
}

const ADMIN_CLICK_COUNT = 5;
const ADMIN_CLICK_WINDOW_MS = 3000;
const COLUMNS = 3;

function HubScreen({ config, reload }: { config: ClientConfig; reload: () => void }) {
  const tiles = useMemo(() => buildTiles(config.tiles), [config.tiles]);

  const [focusIndex, setFocusIndex] = useState(0);
  const [transitioningTo, setTransitioningTo] = useState<AppId | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [hdmiPickerOpen, setHdmiPickerOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [sessionWarning, setSessionWarning] = useState<{ tile: TileDef; appName: string } | null>(null);
  const [topBarOpacity, setTopBarOpacity] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const adminKeyTimes = useRef<number[]>([]);
  const adminLastPress = useRef<number>(0);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const signagePresent = tiles.some((t) => t.key === "signage");

  const showToast = useCallback((msg: string, ms = 5000) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), ms);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        setTransitioningTo(null);
        setActiveApp(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (focusIndex >= tiles.length) setFocusIndex(Math.max(0, tiles.length - 1));
  }, [tiles.length, focusIndex]);

  useEffect(() => {
    if (focusIndex < COLUMNS) {
      scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      setTopBarOpacity(1);
    } else {
      tileRefs.current[focusIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusIndex]);

  const hubIsIdle =
    activeApp === null && transitioningTo === null && !hdmiPickerOpen && !adminOpen && sessionWarning === null;

  const openAdmin = useCallback(() => setAdminOpen(true), []);

  /** Hidden trigger: 5x D-pad Up at the top row, 5x Esc/Back, or the logo, opens admin. */
  const recordAdminPress = useCallback(() => {
    if (!hubIsIdle) return;
    const now = Date.now();
    if (now - adminLastPress.current < 100) return;
    adminLastPress.current = now;
    const times = adminKeyTimes.current.filter((t) => now - t < ADMIN_CLICK_WINDOW_MS);
    times.push(now);
    adminKeyTimes.current = times;
    if (times.length >= ADMIN_CLICK_COUNT) {
      adminKeyTimes.current = [];
      openAdmin();
    }
  }, [hubIsIdle, openAdmin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") recordAdminPress();
    };
    const onColor = (e: Event) => {
      if ((e as CustomEvent<{ color: string }>).detail?.color === "red") recordAdminPress();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("tv:color", onColor);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tv:color", onColor);
    };
  }, [recordAdminPress]);

  const activateTile = useCallback(
    async (tile: TileDef) => {
      if (tile.kind === "inputs") {
        setHdmiPickerOpen(true);
        return;
      }
      if (tile.kind === "command") {
        if (tile.serverId === "screenoff") {
          try {
            await apiSendCommand("screenoff");
            setActiveApp("screenoff");
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
          return;
        }
        try {
          await apiSendCommand(tile.serverId!);
          showToast(`${tile.label} sent`, 2500);
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      setTransitioningTo(tile.overlayId ?? null);
      try {
        await apiLaunchApp(tile.serverId!);
      } catch (err) {
        setTransitioningTo(null);
        showToast(err instanceof Error ? err.message : String(err));
      }
    },
    [showToast],
  );

  const onTileActivate = useCallback(
    (tile: TileDef) => {
      if (!hubIsIdle) return;
      if (tile.kind === "app" && tile.serverId && !NO_WARNING_APP_IDS.has(tile.serverId)) {
        setSessionWarning({ tile, appName: tile.label });
        return;
      }
      void activateTile(tile);
    },
    [hubIsIdle, activateTile],
  );

  const wakeScreen = useCallback(() => {
    setActiveApp(null);
    apiSendCommand("screenon").catch(() => {
      /* remote power key still works if REST wake is unavailable */
    });
  }, []);

  useTvIdle(
    config.idleMs,
    () => {
      const signage = tiles.find((t) => t.key === "signage");
      if (signage) onTileActivate(signage);
    },
    hubIsIdle && signagePresent && config.autoSignage,
  );

  useDPad({
    isActive: hubIsIdle,
    currentIndex: focusIndex,
    maxIndex: tiles.length - 1,
    columns: COLUMNS,
    onNavigate: setFocusIndex,
    onEnter: () => {
      const t = tiles[focusIndex];
      if (t) onTileActivate(t);
    },
    onBack: () => {},
    onBounceUp: recordAdminPress,
  });

  return (
    <div className="relative h-screen w-full flex flex-col overflow-hidden">
      <img
        src={cupolaWatermark}
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{ right: "-4%", bottom: "-5%", height: "80%", width: "auto", opacity: 0.35 }}
      />

      <TopBar onLogoClick={recordAdminPress} opacity={topBarOpacity} />

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto z-10"
        style={{ paddingTop: "12rem", paddingBottom: "2rem" }}
        onScroll={(e) => {
          const y = (e.currentTarget as HTMLDivElement).scrollTop;
          setTopBarOpacity(Math.max(0, 1 - y / 80));
        }}
      >
        <div className="w-full max-w-7xl mx-auto px-16">
          <div className="grid grid-cols-3 gap-8">
            {tiles.map((tile, idx) => (
              <div key={tile.key} ref={(el) => { tileRefs.current[idx] = el; }}>
                <TvTile
                  id={tile.key}
                  label={tile.logoOnly ? undefined : tile.label}
                  icon={tile.renderIcon(focusIndex === idx)}
                  isFocused={focusIndex === idx}
                  onClick={() => {
                    setFocusIndex(idx);
                    onTileActivate(tile);
                  }}
                  onHover={() => {
                    if (hubIsIdle) setFocusIndex(idx);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-8 py-5 rounded-2xl text-white text-xl font-medium shadow-2xl"
          style={{ background: "rgba(196,18,48,0.92)", backdropFilter: "blur(8px)", maxWidth: "72rem" }}
        >
          <AlertCircle className="shrink-0 w-8 h-8" />
          <span>{toast}</span>
        </div>
      )}

      {sessionWarning && (
        <SessionWarningModal
          appName={sessionWarning.appName}
          onProceed={() => {
            const tile = sessionWarning.tile;
            setSessionWarning(null);
            void activateTile(tile);
          }}
        />
      )}

      <HdmiPicker open={hdmiPickerOpen} onClose={() => setHdmiPickerOpen(false)} inputs={config.inputs} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} onSaved={reload} />
      <TransitionOverlay appId={transitioningTo} />
      <ActiveAppScreen appId={activeApp} onExit={wakeScreen} />
    </div>
  );
}

function Gate() {
  const { state, reload } = useConfig();

  if (state.status === "loading") {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <p className="text-2xl text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="h-screen w-full flex items-center justify-center px-16">
        <div
          className="flex flex-col items-center gap-6 rounded-3xl px-16 py-12 text-center"
          style={{ background: "rgba(40,40,40,0.97)", border: "1px solid rgba(196,18,48,0.6)", maxWidth: "780px" }}
        >
          <h1 className="text-4xl font-bold text-foreground">Display not registered</h1>
          <p className="text-xl text-muted-foreground leading-relaxed">{state.message}</p>
        </div>
      </div>
    );
  }

  return <HubScreen config={state.config} reload={reload} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
    </QueryClientProvider>
  );
}

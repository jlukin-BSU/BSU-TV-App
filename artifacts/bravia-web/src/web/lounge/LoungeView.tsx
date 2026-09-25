import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Cloud, CloudLightning, CloudRain, Moon, Snowflake, Sun } from "lucide-react";
import { useTime } from "@/hooks/use-time";
import { useWeather } from "@/hooks/use-weather";
import { revealInScroller } from "@/hooks/use-spatial-nav";
import type { HelpCard, LayoutId } from "../../shared/catalog";
import bsuLogo from "@assets/BSU_Logo_No_Cupola_trans_1774372116116.png";
import cupolaWatermark from "@assets/BSU_watermark_red_1774490194557.png";
import marketingIcon from "@assets/marketing_1774373576874.png";
import "./lounge.css";

/**
 * The windowed-signage home screens. Signage plays in a window on the home
 * screen next to the apps and short how-to text; selecting the window (or the
 * idle timeout) grows it to full screen, and Back shrinks it again.
 *
 * The window is one full-screen layer scaled down into a placeholder "slot" in
 * the layout, rather than an element resized between two boxes: the signage
 * page renders once at full resolution, and growing it is a transform the TV
 * can animate without re-laying-out the page inside the iframe.
 */

export const SIGNAGE_KEY = "__signage__";

export type LoungeLayout = Exclude<LayoutId, "hub">;

export interface LoungeTile {
  key: string;
  label: string;
  logoOnly?: boolean;
  renderIcon: (focused: boolean) => ReactNode;
}

interface Props {
  layout: LoungeLayout;
  rootRef: RefObject<HTMLDivElement | null>;
  deviceLabel: string;
  help: HelpCard;
  signageUrl: string | null;
  tiles: LoungeTile[];
  focusKey: string | null;
  onFocus: (key: string) => void;
  /** A tile key, or SIGNAGE_KEY for the window. */
  onActivate: (key: string) => void;
  signageFull: boolean;
  onCollapse: () => void;
  onLogoClick: () => void;
}

const STEPS_SHORT = ["Use the arrows to pick an app and press OK", "Sign in with your own account", "Press Home to return to this screen", "Accounts sign out when the TV is idle"];

const TIPS: ReactNode[] = [
  <>Press <kbd>Home</kbd> on the remote at any time to return to this screen.</>,
  <>Signed in to a streaming app? You are signed out automatically when the TV is idle.</>,
  <>Connect a console or laptop to the HDMI port on the wall plate, then choose TV Inputs.</>,
];

/** "Scan to contact IT Support" -> "Contact IT Support", for the ticker. */
function helpLine(help: HelpCard): string {
  const msg = help.message.replace(/^scan (to|for)\s+/i, "");
  return `${help.title} ${msg.charAt(0).toUpperCase()}${msg.slice(1)}`;
}

export function LoungeView(props: Props) {
  const { layout, rootRef, tiles, focusKey, onFocus, onActivate, signageFull, onCollapse } = props;
  const slotRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Keep the focused item visible inside its scroller.
  useEffect(() => {
    if (!focusKey) return;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(focusKey)}"]`);
    if (el) revealInScroller(el);
  }, [focusKey, rootRef]);

  const tileEls = (menu: boolean) =>
    tiles.map((t) => (
      <Tile key={t.key} tile={t} showLabel={menu || !t.logoOnly} focused={focusKey === t.key} onFocus={onFocus} onActivate={onActivate} />
    ));

  const slot = (
    <div
      ref={slotRef}
      data-nav={SIGNAGE_KEY}
      className={`lx-slot${focusKey === SIGNAGE_KEY && !signageFull ? " focus" : ""}`}
    />
  );

  const ticker = (
    <div className="lx-ticker">
      <div className="tag">How to</div>
      <Ticker items={props.help.show ? [...STEPS_SHORT, helpLine(props.help)] : STEPS_SHORT} />
    </div>
  );

  return (
    <div ref={rootRef} className={`lx lx-${layout}${signageFull ? " clean" : ""}`}>
      {layout !== "backdrop" && <img className="lx-wm" src={cupolaWatermark} alt="" aria-hidden="true" />}
      <TopBar label={props.deviceLabel} help={props.help} onLogoClick={props.onLogoClick} />

      {layout === "guide" && (
        <>
          {slot}
          <GuideColumn />
          <ScrollBox axis="x" className="lx-row">{tileEls(false)}</ScrollBox>
        </>
      )}

      {layout === "menu" && (
        <>
          <ScrollBox axis="y" className="lx-menu-list">{tileEls(true)}</ScrollBox>
          {slot}
          {ticker}
        </>
      )}

      {layout === "grid" && (
        <>
          <ScrollBox axis="y" className="lx-grid-tiles" boxRef={gridRef}>
            {slot}
            {tileEls(false)}
          </ScrollBox>
          {ticker}
        </>
      )}

      {layout === "backdrop" && (
        <>
          {slot}
          <div className="lx-scrim" />
          <div className="lx-dsteps">
            <span><b>1</b>Pick an app and press OK</span>
            <span><b>2</b>Sign in if the app asks</span>
            <span><b>3</b>Press Home to come back here</span>
          </div>
          <ScrollBox axis="x" className="lx-row">{tileEls(false)}</ScrollBox>
        </>
      )}

      <SignageLayer
        slotRef={slotRef}
        clipRef={layout === "grid" ? gridRef : undefined}
        url={props.signageUrl}
        full={signageFull}
        fill={layout === "backdrop"}
        focused={focusKey === SIGNAGE_KEY}
        zIndex={signageFull && layout !== "backdrop" ? 40 : layout === "backdrop" ? 10 : 27}
        onClick={() => (signageFull ? onCollapse() : onActivate(SIGNAGE_KEY))}
        onHover={() => {
          if (!signageFull) onFocus(SIGNAGE_KEY);
        }}
      />
    </div>
  );
}

function Tile({
  tile,
  showLabel,
  focused,
  onFocus,
  onActivate,
}: {
  tile: LoungeTile;
  showLabel: boolean;
  focused: boolean;
  onFocus: (key: string) => void;
  onActivate: (key: string) => void;
}) {
  return (
    <div
      data-nav={tile.key}
      className={`lx-tile${focused ? " focus" : ""}`}
      onMouseEnter={() => onFocus(tile.key)}
      onClick={() => {
        onFocus(tile.key);
        onActivate(tile.key);
      }}
    >
      <div className="ico">{tile.renderIcon(focused)}</div>
      {showLabel && <div className="lbl">{tile.label}</div>}
    </div>
  );
}

/** A scroller whose edges fade only on the side that has more to scroll to. */
function ScrollBox({
  axis,
  className,
  children,
  boxRef,
}: {
  axis: "x" | "y";
  className: string;
  children: ReactNode;
  boxRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = boxRef ?? ownRef;
  const [fade, setFade] = useState({ start: false, end: false });

  const edges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = axis === "y" ? el.scrollTop : el.scrollLeft;
    const max = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const next = { start: pos > 2, end: pos < max - 2 };
    setFade((cur) => (cur.start === next.start && cur.end === next.end ? cur : next));
  }, [axis, ref]);

  useEffect(() => {
    edges();
    window.addEventListener("resize", edges);
    return () => window.removeEventListener("resize", edges);
  }, [edges, children]);

  return (
    <div
      ref={ref}
      data-scroller
      className={`lx-scroll ${axis} ${className}${fade.start ? " fs" : ""}${fade.end ? " fe" : ""}`}
      onScroll={edges}
      onWheel={(e) => {
        // A mouse wheel scrolls vertically; turn it sideways for the app row.
        if (axis === "x" && ref.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current.scrollLeft += e.deltaY;
      }}
    >
      {children}
    </div>
  );
}

function SignageLayer({
  slotRef,
  clipRef,
  url,
  full,
  fill,
  focused,
  zIndex,
  onClick,
  onHover,
}: {
  slotRef: RefObject<HTMLDivElement | null>;
  clipRef?: RefObject<HTMLDivElement | null>;
  url: string | null;
  full: boolean;
  /** Always cover the whole screen (backdrop); the slot is then only a focus target. */
  fill?: boolean;
  focused: boolean;
  zIndex: number;
  onClick: () => void;
  onHover: () => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [anim, setAnim] = useState(false);
  const [hint, setHint] = useState(false);
  const firstRun = useRef(true);

  /** Map the full-screen layer onto the slot (or the whole screen when full). */
  const place = useCallback(() => {
    const layer = layerRef.current;
    const slot = slotRef.current;
    if (!layer || !slot) return;
    if (full || fill) {
      layer.style.transform = "translate(0px, 0px) scale(1)";
      layer.style.clipPath = "inset(0px 0px 0px 0px round 0px)";
      layer.style.setProperty("--inv", "1");
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = slot.getBoundingClientRect();
    const s = r.width / vw || 1;
    let clipTop = -Infinity;
    let clipBottom = Infinity;
    if (clipRef?.current) {
      const c = clipRef.current.getBoundingClientRect();
      clipTop = c.top;
      clipBottom = c.bottom;
    }
    const insetTop = Math.max(0, clipTop - r.top) / s;
    const visibleBottom = (Math.min(r.bottom, clipBottom) - r.top) / s;
    const insetBottom = Math.max(0, vh - visibleBottom);
    const radius = parseFloat(getComputedStyle(slot).borderTopLeftRadius) || 0;
    layer.style.transform = `translate(${r.left}px, ${r.top}px) scale(${s})`;
    layer.style.clipPath = `inset(${insetTop}px 0px ${insetBottom}px 0px round ${radius / s}px)`;
    layer.style.setProperty("--inv", String(1 / s));
  }, [full, fill, slotRef, clipRef]);

  useLayoutEffect(() => {
    place();
  });

  // Animate only the grow/shrink, never scroll-driven repositioning.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setAnim(true);
    const t = window.setTimeout(() => setAnim(false), 600);
    let h: number | undefined;
    if (full) {
      setHint(true);
      h = window.setTimeout(() => setHint(false), 3500);
    } else {
      setHint(false);
    }
    return () => {
      window.clearTimeout(t);
      if (h) window.clearTimeout(h);
    };
  }, [full]);

  useEffect(() => {
    const clip = clipRef?.current;
    const ro = typeof ResizeObserver !== "undefined" && slotRef.current ? new ResizeObserver(place) : null;
    if (ro && slotRef.current) ro.observe(slotRef.current);
    window.addEventListener("resize", place);
    clip?.addEventListener("scroll", place, { passive: true });
    const poll = window.setInterval(place, 1000); // late layout shifts (fonts, images)
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
      clip?.removeEventListener("scroll", place);
      window.clearInterval(poll);
    };
  }, [place, clipRef, slotRef]);

  return (
    <div
      ref={layerRef}
      className={`lx-sig${anim ? " anim" : ""}${full ? " full" : ""}${hint ? " hint" : ""}${focused && !full ? " focus" : ""}`}
      style={{ zIndex }}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      {url ? (
        <iframe
          src={url}
          title="News and announcements"
          tabIndex={-1}
          allow="autoplay; fullscreen"
          // No allow-top-navigation: the signage page can never navigate the hub away.
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="ph">
          <img src={marketingIcon} alt="" />
          <b>News &amp; Announcements</b>
        </div>
      )}
      <div className="chip" style={{ fontSize: "calc(0.625rem * var(--inv, 1))" }}>Select for full screen</div>
      <div className="back">Press Back to return</div>
    </div>
  );
}

function TopBar({ label, help, onLogoClick }: { label: string; help: HelpCard; onLogoClick: () => void }) {
  const { timeDisplay, dateDisplay } = useTime();
  const { data: weather } = useWeather();
  const condition = weather?.condition ?? "sunny";
  const Icon =
    condition === "sunny" && weather && !weather.isDay
      ? Moon
      : { sunny: Sun, cloudy: Cloud, rainy: CloudRain, snowy: Snowflake, thunderstorm: CloudLightning }[condition];

  return (
    <div className="lx-top">
      <div className="lx-brand">
        <img src={bsuLogo} alt="Bridgewater State University" onClick={onLogoClick} />
        <i />
        <b>{label}</b>
      </div>
      {help.show && (
        <div className={`lx-help${help.qrUrl ? "" : " noqr"}`}>
          {help.qrUrl && <img src={help.qrUrl} alt="" />}
          <div>
            <b>{help.title}</b>
            <span>{help.message}</span>
          </div>
        </div>
      )}
      <div className="lx-clock">
        <div className="t">{timeDisplay}</div>
        <div className="d">
          <span>{dateDisplay}</span>
          {weather && (
            <>
              <i />
              <em>
                <Icon strokeWidth={2.5} />
                {weather.temperature}°F
              </em>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideColumn() {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 12000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="lx-col">
      <div className="lx-panel">
        <h3>Using this TV</h3>
        <ol className="lx-steps">
          <li><span>1</span><div>Use the arrows to pick an app, then press <kbd>OK</kbd>.</div></li>
          <li><span>2</span><div>Sign in with your own account if the app asks.</div></li>
          <li><span>3</span><div>Press <kbd>Home</kbd> to come back here.<small>Accounts sign out when the TV is idle.</small></div></li>
        </ol>
      </div>
      <div className="lx-panel lx-tip">
        <h3>Tip</h3>
        <div className="tx">{TIPS[tip]}</div>
        <div className="ct">{tip + 1} of {TIPS.length}</div>
      </div>
    </div>
  );
}

function Ticker({ items }: { items: string[] }) {
  const row = items.map((t, i) => <span key={i}>{t}</span>);
  return (
    <div className="run">
      {row}
      {items.map((t, i) => <span key={`b${i}`}>{t}</span>)}
    </div>
  );
}

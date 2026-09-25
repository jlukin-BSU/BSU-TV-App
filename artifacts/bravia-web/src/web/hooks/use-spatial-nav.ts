import { useEffect, useRef, type RefObject } from "react";

export type NavDir = "up" | "down" | "left" | "right";

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The best neighbour of `cur` in direction `dir`, by on-screen geometry.
 *
 * The windowed layouts mix a signage window, rows, lists and grids, so an
 * index-based grid walk (useDPad) doesn't fit. Instead: only boxes wholly past
 * `cur`'s edge in that direction qualify (within a few pixels, for the focused
 * tile's lift), and the nearest wins, with sideways offset weighted so a box
 * straight ahead beats a closer one off to the side.
 *
 * Left/right also require the boxes to share some height, so Right from the
 * signage window doesn't drop diagonally into the app row. Up/down don't, so
 * a tile under the guide column can still reach the window above-left of it.
 */
const EDGE_SLACK = 8;

export function pickNeighbor<T extends Box>(cur: Box, candidates: T[], dir: NavDir): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    let primary: number;
    let lo: number, hi: number, clo: number, chi: number;
    if (dir === "right" || dir === "left") {
      primary = dir === "right" ? c.left - cur.right : cur.left - c.right;
      if (primary < -EDGE_SLACK) continue;
      [lo, hi, clo, chi] = [cur.top, cur.bottom, c.top, c.bottom];
    } else {
      primary = dir === "down" ? c.top - cur.bottom : cur.top - c.bottom;
      if (primary < -EDGE_SLACK) continue;
      [lo, hi, clo, chi] = [cur.left, cur.right, c.left, c.right];
    }
    // Sideways gap between the two boxes' spans (0 when they overlap).
    const side = Math.max(0, clo - hi, lo - chi);
    if ((dir === "left" || dir === "right") && side > 0) continue;
    // Ties (e.g. every item in a list beside a tall window) go to the one
    // nearest the current box's centre line.
    const drift = Math.abs((clo + chi) / 2 - (lo + hi) / 2) / 1000;
    const score = Math.max(0, primary) + side * 3 + drift;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

const KEY_DIR: Record<string, NavDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const OPPOSITE: Record<NavDir, NavDir> = { up: "down", down: "up", left: "right", right: "left" };

interface Options {
  isActive: boolean;
  /** Container whose [data-nav] descendants are focusable. */
  rootRef: RefObject<HTMLElement | null>;
  focusKey: string | null;
  onNavigate: (key: string) => void;
  onEnter: () => void;
  /** ArrowUp with nothing above -- the hidden admin gesture, as on the grid. */
  onBounceUp?: () => void;
}

export function useSpatialNav({ isActive, rootRef, focusKey, onNavigate, onEnter, onBounceUp }: Options) {
  // The last move, so pressing the opposite arrow goes back where you came from.
  const lastMove = useRef<{ from: string; to: string; dir: NavDir } | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onEnter();
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      const root = rootRef.current;
      if (!root) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>("[data-nav]"));
      const cur = els.find((el) => el.dataset.nav === focusKey);
      if (!cur) {
        if (els[0]?.dataset.nav) onNavigate(els[0].dataset.nav);
        return;
      }
      const boxes = els
        .filter((el) => el !== cur)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
      const last = lastMove.current;
      const back =
        last && last.to === focusKey && last.dir === OPPOSITE[dir] ? boxes.find((b) => b.el.dataset.nav === last.from) : undefined;
      const next = back ?? pickNeighbor(cur.getBoundingClientRect(), boxes, dir);
      const key = next?.el.dataset.nav;
      if (key && focusKey) {
        lastMove.current = { from: focusKey, to: key, dir };
        onNavigate(key);
      } else if (dir === "up") onBounceUp?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive, rootRef, focusKey, onNavigate, onEnter, onBounceUp]);
}

/**
 * Scroll `el` into view within its nearest [data-scroller] only. Element
 * scrollIntoView would also scroll overflow:hidden ancestors, which shifts the
 * whole fixed layout on some TV browsers.
 */
export function revealInScroller(el: HTMLElement, margin = 48): void {
  const sc = el.closest<HTMLElement>("[data-scroller]");
  if (!sc) return;
  const r = el.getBoundingClientRect();
  const s = sc.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  if (r.left < s.left + margin) dx = r.left - s.left - margin;
  else if (r.right > s.right - margin) dx = r.right - s.right + margin;
  if (r.top < s.top + margin) dy = r.top - s.top - margin;
  else if (r.bottom > s.bottom - margin) dy = r.bottom - s.bottom + margin;
  if (!dx && !dy) return;
  const before = [sc.scrollLeft, sc.scrollTop];
  sc.scrollBy({ left: dx, top: dy, behavior: "smooth" });
  // Some embedded browsers ignore smooth scrolling; jump if nothing moved.
  window.setTimeout(() => {
    if (sc.scrollLeft === before[0] && sc.scrollTop === before[1]) sc.scrollBy({ left: dx, top: dy });
  }, 400);
}

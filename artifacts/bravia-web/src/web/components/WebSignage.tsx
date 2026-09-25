import { useEffect, useState } from "react";

/**
 * Full-screen web signage for the tile grid: what News & Announcements (and
 * the idle timeout) open when the display has a signage URL, in place of the
 * OptiSigns Android app. The windowed layouts grow their own window instead.
 *
 * Mounted only while open, so hidden signage never keeps playing (or playing
 * audio) behind the grid. The web player keeps its pairing in browser storage,
 * so reopening it doesn't ask to pair again.
 */
export function WebSignage({ url, open, onClose }: { url: string | null; open: boolean; onClose: () => void }) {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 3500);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || !url) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black cursor-pointer" onClick={onClose}>
      <iframe
        src={url}
        title="News and announcements"
        tabIndex={-1}
        allow="autoplay; fullscreen"
        // No allow-top-navigation: the signage page can never navigate the hub away.
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full border-0 pointer-events-none"
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-12 px-6 py-3 rounded-full text-2xl font-medium text-white pointer-events-none transition-opacity duration-500"
        style={{ background: "rgba(0,0,0,0.6)", opacity: hint ? 1 : 0 }}
      >
        Press Back to return
      </div>
    </div>
  );
}

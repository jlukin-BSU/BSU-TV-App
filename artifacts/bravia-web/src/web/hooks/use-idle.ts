import { useEffect, useRef } from "react";

export function useTvIdle(
  timeoutMs: number,
  onIdle: () => void,
  isActive: boolean // Only track idle when in the hub
) {
  const timeoutRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onIdle();
      }, timeoutMs);
    };

    // Initial set
    resetTimer();

    // TV OS equivalents: mousemove (air mouse), keydown (d-pad), click
    const events = ["mousemove", "keydown", "click", "touchstart", "wheel"];
    
    events.forEach(event => window.addEventListener(event, resetTimer));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [timeoutMs, onIdle, isActive]);
}

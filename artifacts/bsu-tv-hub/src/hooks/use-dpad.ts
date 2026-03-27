import { useEffect } from "react";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

interface DPadConfig {
  isActive: boolean;
  currentIndex: number;
  maxIndex: number;
  columns: number;
  onNavigate: (newIndex: number) => void;
  onEnter: () => void;
  onBack: () => void;
  /** Called when ArrowUp is pressed but focus is already on the top row (no movement possible). */
  onBounceUp?: () => void;
}

export function useDPad({ isActive, currentIndex, maxIndex, columns, onNavigate, onEnter, onBack, onBounceUp }: DPadConfig) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let newIndex = currentIndex;
      let handled = false;

      switch (e.key) {
        case "ArrowRight":
          // Prevent wrapping to next row if on right edge
          if (currentIndex % columns < columns - 1 && currentIndex + 1 <= maxIndex) {
            newIndex = currentIndex + 1;
          }
          handled = true;
          break;
        case "ArrowLeft":
          // Prevent wrapping to prev row if on left edge
          if (currentIndex % columns > 0) {
            newIndex = currentIndex - 1;
          }
          handled = true;
          break;
        case "ArrowUp":
          if (currentIndex - columns >= 0) {
            newIndex = currentIndex - columns;
          } else {
            // Already at top row — no movement, but fire the bounce callback.
            onBounceUp?.();
          }
          handled = true;
          break;
        case "ArrowDown":
          if (currentIndex + columns <= maxIndex) {
            newIndex = currentIndex + columns;
          } else if (currentIndex + columns > maxIndex && currentIndex < columns && maxIndex >= columns) {
            // Fall to the last item if pushing down from top row into a partial bottom row
            newIndex = maxIndex;
          }
          handled = true;
          break;
        case "Enter":
        case " ":
          onEnter();
          handled = true;
          break;
        case "Escape":
        case "Backspace":
          onBack();
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        if (newIndex !== currentIndex) {
          onNavigate(newIndex);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, currentIndex, maxIndex, columns, onNavigate, onEnter, onBack, onBounceUp]);
}

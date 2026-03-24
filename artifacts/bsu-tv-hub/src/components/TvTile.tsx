import { ReactNode } from "react";
import { motion } from "framer-motion";

interface TvTileProps {
  id: string;
  label?: string;
  icon: ReactNode;
  isFocused: boolean;
  onClick: () => void;
  onHover: () => void;
  className?: string;
}

export function TvTile({ label, icon, isFocused, onClick, onHover, className = "" }: TvTileProps) {
  return (
    <motion.div
      onMouseEnter={onHover}
      onClick={onClick}
      animate={{
        scale: isFocused ? 1.06 : 1,
        y: isFocused ? -6 : 0,
      }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      style={{
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: isFocused
          ? "0 20px 48px rgba(0,0,0,0.45), 0 0 50px 10px rgba(196,18,48,0.28)"
          : "0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.09)",
        background: isFocused
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,255,255,0.07)",
      }}
      className={`
        relative flex flex-col items-center justify-center cursor-pointer
        rounded-2xl h-[280px] w-full transition-colors duration-200
        ${isFocused ? "z-10" : "z-0"}
        ${className}
      `}
    >
      <div className={`transition-all duration-200 ${isFocused ? "opacity-100 scale-105" : "opacity-85"}`}>
        {icon}
      </div>

      {label && (
        <p className={`
          mt-5 text-xl font-medium tracking-wide text-center leading-snug px-4
          transition-all duration-200
          ${isFocused ? "text-white opacity-100" : "text-white/75"}
        `}>
          {label}
        </p>
      )}
    </motion.div>
  );
}

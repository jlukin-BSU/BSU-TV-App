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
        backdropFilter: "blur(20px) brightness(0.9)",
        WebkitBackdropFilter: "blur(20px) brightness(0.9)",
        boxShadow: isFocused
          ? "0 1rem 2.5rem rgba(0,0,0,0.5), 0 0 2.5rem 0.6rem rgba(220,40,65,0.22)"
          : "0 0.4rem 1.2rem rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.13)",
        background: isFocused
          ? "rgba(80,82,86,0.82)"
          : "rgba(58,60,63,0.76)",
      }}
      className={`
        relative flex flex-col items-center justify-center cursor-pointer
        rounded-2xl h-[13rem] w-full transition-colors duration-200
        ${isFocused ? "z-10" : "z-0"}
        ${className}
      `}
    >
      <div className={`transition-all duration-200 ${isFocused ? "opacity-100 scale-105" : "opacity-85"}`}>
        {icon}
      </div>

      {label && (
        <p className={`
          mt-3 text-xl font-medium tracking-wide text-center leading-snug px-4
          transition-all duration-200
          ${isFocused ? "text-white opacity-100" : "text-white/75"}
        `}>
          {label}
        </p>
      )}
    </motion.div>
  );
}

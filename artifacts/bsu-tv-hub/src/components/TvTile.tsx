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
      layout
      onMouseEnter={onHover}
      onClick={onClick}
      animate={{
        scale: isFocused ? 1.05 : 1,
        y: isFocused ? -8 : 0,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`
        relative flex flex-col items-center justify-center cursor-pointer
        rounded-3xl border-2 transition-colors duration-300
        tv-tile-shadow h-[280px] w-full
        ${isFocused 
          ? 'bg-card border-primary tv-tile-focused z-10' 
          : 'bg-card/60 border-border/40 hover:bg-card/80 hover:border-border/80 z-0'
        }
        ${className}
      `}
    >
      <div className={`transition-transform duration-300 ${isFocused ? 'scale-110 text-primary' : 'text-foreground/80'}`}>
        {icon}
      </div>
      
      {label && (
        <h3 className={`mt-6 text-3xl font-semibold transition-colors duration-300 ${isFocused ? 'text-foreground' : 'text-foreground/80'}`}>
          {label}
        </h3>
      )}

      {/* Focus Glow Indicator */}
      {isFocused && (
        <motion.div
          layoutId="focus-glow"
          className="absolute -inset-1 bg-primary/20 blur-2xl rounded-3xl -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}
    </motion.div>
  );
}

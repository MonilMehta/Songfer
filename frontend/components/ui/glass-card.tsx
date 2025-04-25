"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className,
  hover = true,
  onClick,
}: GlassCardProps) {
  const CardWrapper = hover ? motion.div : "div";

  return (
    <CardWrapper
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl",
        "before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-b before:from-white/10 before:to-transparent",
        "after:absolute after:inset-0 after:-z-10 after:bg-gradient-to-t after:from-black/10 after:to-transparent",
        hover && "transition-transform hover:scale-[1.02] hover:shadow-lg",
        className
      )}
      whileHover={hover ? { scale: 1.02 } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
    >
      <div className="relative z-10 p-6">{children}</div>
    </CardWrapper>
  );
} 
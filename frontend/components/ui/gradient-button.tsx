"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const baseStyles = "relative inline-flex items-center justify-center font-medium transition-all duration-200 rounded-lg";
    
    const variants = {
      primary: "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700",
      secondary: "bg-gradient-to-r from-gray-600 to-gray-700 text-white hover:from-gray-700 hover:to-gray-800",
      outline: "border-2 border-purple-600 text-purple-600 hover:bg-purple-600/10"
    };

    const sizes = {
      sm: "text-sm px-4 py-2",
      md: "text-base px-6 py-3",
      lg: "text-lg px-8 py-4"
    };

    const Comp = asChild ? Slot : motion.button;

    return (
      <Comp
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        disabled={disabled || isLoading}
        {...(asChild ? {} : {
          whileHover: { scale: 1.02 },
          whileTap: { scale: 0.98 }
        })}
        {...props}
      >
        {isLoading && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-inherit rounded-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </motion.div>
        )}
        <span className={cn("flex items-center gap-2", isLoading && "invisible")}>
          {leftIcon}
          {children}
          {rightIcon}
        </span>
      </Comp>
    );
  }
);

GradientButton.displayName = "GradientButton"; 
"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { InputHTMLAttributes, forwardRef, useState } from "react";

interface GradientInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const GradientInput = forwardRef<HTMLInputElement, GradientInputProps>(
  ({ className, label, error, leftIcon, rightIcon, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
      <div className="relative w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <motion.div
            className={cn(
              "absolute inset-0 rounded-lg",
              isFocused
                ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20"
                : "bg-gray-100"
            )}
            initial={false}
            animate={{
              scale: isFocused ? 1.02 : 1,
              opacity: isFocused ? 1 : 0.5,
            }}
            transition={{ duration: 0.2 }}
          />
          <div className="relative flex items-center">
            {leftIcon && (
              <div className="absolute left-3 text-gray-400">{leftIcon}</div>
            )}
            <input
              ref={ref}
              className={cn(
                "w-full px-4 py-2 bg-transparent border-2 rounded-lg outline-none transition-colors duration-200",
                "placeholder:text-gray-400",
                leftIcon && "pl-10",
                rightIcon && "pr-10",
                error
                  ? "border-red-500 focus:border-red-500"
                  : "border-transparent focus:border-purple-500",
                className
              )}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              {...props}
            />
            {rightIcon && (
              <div className="absolute right-3 text-gray-400">{rightIcon}</div>
            )}
          </div>
        </div>
        {error && (
          <motion.p
            className="mt-1 text-sm text-red-500"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {error}
          </motion.p>
        )}
      </div>
    );
  }
);

GradientInput.displayName = "GradientInput"; 
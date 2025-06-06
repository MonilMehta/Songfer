/* eslint-disable */
"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";

const VinylPlayer = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const [showRipple, setShowRipple] = useState(false);
  
    const togglePlay = () => {
      setIsPlaying(!isPlaying);
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 700);
    };

    useEffect(() => {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.play().catch(error => {
            console.error("Audio playback error:", error);
            setIsPlaying(false);
          });
        } else {
          audioRef.current.pause();
        }
      }
    }, [isPlaying]);
    
    // Add automatic ripple effect every 30-40 seconds
    useEffect(() => {
      // Generate a random time between 30 and 40 seconds
      const getRandomTime = () => Math.floor(Math.random() * 10000) + 30000;
      let timerId;
      
      const triggerRipple = () => {
        setShowRipple(true);
        setTimeout(() => setShowRipple(false), 700);
        // Schedule next ripple
        timerId = setTimeout(triggerRipple, getRandomTime());
      };
      
      // Start the first automatic ripple after a random time
      timerId = setTimeout(triggerRipple, getRandomTime());
      
      // Clean up timer when component unmounts
      return () => clearTimeout(timerId);
    }, []);
  
    return (
      <div className="relative w-12 h-12 cursor-pointer group" onClick={togglePlay}>
        {/* Player base/platter */}
        <div className={cn(
          "absolute w-full h-full rounded-full shadow-md transition-all duration-300",
          isDark ? "bg-gray-800" : "bg-gray-200",
          "group-hover:shadow-lg"
        )} />
        
        {/* Vinyl disc */}
        <motion.div
          className="absolute top-[10%] left-[10%] transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full overflow-hidden"
          animate={{ rotate: isPlaying ? 360 : 0 }}
          transition={{ duration: 6, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
        >
          <div className={cn(
            "w-full h-full rounded-full",
            isDark ? "bg-gray-900" : "bg-gray-800"
          )}>
            {/* Vinyl grooves - more detailed and realistic */}
            {[...Array(8)].map((_, i) => (
              <div key={i} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-700 opacity-60" 
                   style={{ width: `${9 - i*0.8}px`, height: `${9 - i*0.8}px` }} />
            ))}
            
            {/* Reflective highlights */}
            <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-white opacity-50 rounded-full" />
            <div className="absolute bottom-1/3 right-1/3 w-0.5 h-2 bg-white opacity-30 rounded-full" />
            
            {/* Record label */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-700">
              {/* Label details */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-gray-900" />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-red-800" />
            </div>
          </div>
        </motion.div>
        
        {/* Tonearm */}
        <motion.div
          className="absolute top-1/2 right-0 w-6 h-1 origin-right"
          animate={{ rotate: isPlaying ? -30 : -45 }}
          transition={{ duration: 0.8 }}
        >
          <div className={cn(
            "h-full rounded-full",
            isDark ? "bg-gray-600" : "bg-gray-500"
          )} />
          {/* Tonearm head */}
          <div className={cn(
            "absolute w-1.5 h-1.5 rounded-sm -rotate-45 top-0 left-0 -mt-0.5 -ml-0.5",
            isDark ? "bg-gray-500" : "bg-gray-400"
          )} />
        </motion.div>
        
        {/* Hidden audio element */}
        <audio 
          ref={audioRef} 
          src="songs/Low Life feat. The Weeknd - Future.aac" 
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }} 
        />

        {/* Ripple effect */}
        <AnimatePresence>
          {showRipple && (
            <motion.div
              className="absolute inset-0 rounded-full bg-purple-400 dark:bg-purple-600 opacity-30"
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

export default VinylPlayer;
"use client";

import { motion } from 'framer-motion'

export default function WaveformAnimation() {
  const bars = 30
  
  return (
    <div className="flex items-end justify-center space-x-1 h-16">
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-5 bg-primary"
          animate={{
            height: [10, 40, 10],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  )
}


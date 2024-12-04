import { motion } from 'framer-motion'

export default function WaveformAnimation() {
  const bars = 20
  
  return (
    <div className="flex items-end justify-center space-x-1 h-16">
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-primary"
          animate={{
            height: [10, 40, 10],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  )
}


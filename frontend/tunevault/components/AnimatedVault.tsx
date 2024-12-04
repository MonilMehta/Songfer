import { motion } from 'framer-motion'
import { Music } from 'lucide-react'

export default function AnimatedVault() {
  return (
    <motion.div
      className="w-64 h-64 bg-primary rounded-lg flex items-center justify-center shadow-lg"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="w-48 h-48 bg-background rounded-full flex items-center justify-center"
        animate={{ rotate: [0, 90, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="w-32 h-32 bg-primary rounded-lg flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Music className="w-16 h-16 text-background" />
        </motion.div>
      </motion.div>
    </motion.div>
  )
}


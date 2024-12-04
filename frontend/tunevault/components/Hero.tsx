'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Input } from './ui'

export default function Hero() {
  const [url, setUrl] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement download logic
    console.log('Downloading from:', url)
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-background to-primary/10 py-20 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center">
          <motion.h1 
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Unlock Your
            <span className="bg-gradient-to-r from-primary to-purple-600 text-transparent bg-clip-text"> Musical Vault</span>
          </motion.h1>
          <motion.p 
            className="text-xl text-muted-foreground mb-8 max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Download, discover, and enjoy your favorite tunes from YouTube and Spotify. Your personal music treasure trove awaits!
          </motion.p>
          <motion.form 
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Input 
              placeholder="Enter YouTube or Spotify URL" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-grow"
            />
            <Button type="submit" size="lg">Start Downloading</Button>
          </motion.form>
        </div>
      </div>
    </div>
  )
}


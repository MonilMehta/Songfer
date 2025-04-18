'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

export interface Song {
  id: string
  title: string
  artist: string | string[]
  artists?: string
  album?: string
  popularity: number
  spotify_id?: string
  thumbnail_url?: string | null
  image_url?: string | null
  genre?: string
}

interface PlayerContextType {
  currentSong: Song | null
  isPlaying: boolean
  showPlayerBar: boolean
  play: (song: Song) => void
  pause: () => void
  togglePlay: (song: Song) => void
  closePlayer: () => void
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPlayerBar, setShowPlayerBar] = useState(false)

  const play = (song: Song) => {
    setCurrentSong(song)
    setIsPlaying(true)
    setShowPlayerBar(true)
  }

  const pause = () => {
    setIsPlaying(false)
  }

  const togglePlay = (song: Song) => {
    if (currentSong?.id === song.id) {
      setIsPlaying(!isPlaying)
      if (!isPlaying && !showPlayerBar) {
        setShowPlayerBar(true)
      }
    } else {
      setCurrentSong(song)
      setIsPlaying(true)
      setShowPlayerBar(true)
    }
  }

  const closePlayer = () => {
    setShowPlayerBar(false)
    setIsPlaying(false)
  }

  return (
    <PlayerContext.Provider value={{ 
      currentSong, 
      isPlaying, 
      showPlayerBar,
      play, 
      pause, 
      togglePlay,
      closePlayer
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const context = useContext(PlayerContext)
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider')
  }
  return context
} 
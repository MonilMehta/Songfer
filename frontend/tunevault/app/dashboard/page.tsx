'use client'

import { useState } from 'react'
import SongCard from '../components/SongCard'

// Mock data for downloaded songs and recommendations
const mockDownloadedSongs = [
  { id: 1, title: 'Song 1', artist: 'Artist 1', coverUrl: '/placeholder.svg?height=400&width=400' },
  { id: 2, title: 'Song 2', artist: 'Artist 2', coverUrl: '/placeholder.svg?height=400&width=400' },
]

const mockRecommendations = [
  { id: 3, title: 'Song 3', artist: 'Artist 3', coverUrl: '/placeholder.svg?height=400&width=400' },
  { id: 4, title: 'Song 4', artist: 'Artist 4', coverUrl: '/placeholder.svg?height=400&width=400' },
]

export default function Dashboard() {
  const [downloadedSongs] = useState(mockDownloadedSongs)
  const [recommendations] = useState(mockRecommendations)

  const handlePlay = (songId: number) => {
    console.log('Playing song:', songId)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Your Dashboard</h1>
      
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Your Downloaded Songs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {downloadedSongs.map((song) => (
            <SongCard
              key={song.id}
              title={song.title}
              artist={song.artist}
              coverUrl={song.coverUrl}
              onPlay={() => handlePlay(song.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Recommended for You</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {recommendations.map((song) => (
            <SongCard
              key={song.id}
              title={song.title}
              artist={song.artist}
              coverUrl={song.coverUrl}
              onPlay={() => handlePlay(song.id)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}


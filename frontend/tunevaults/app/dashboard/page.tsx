'use client'

import { useEffect, useState } from 'react'
import apiCaller from '@/utils/apiCaller'

export default function Dashboard() {
  const [songs, setSongs] = useState([])

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const response = await apiCaller('songs/', 'GET')
        if (response && response.status === 200) {
          const data = response.data
          setSongs(data)
        } else {
          console.error('Failed to fetch songs')
        }
      } catch (error) {
        console.error('Error:', error)
      }
    }

    fetchSongs()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <ul className="space-y-4">
        {songs.map((song) => (
          <li key={song.id} className="p-4 bg-gray-100 rounded">
            <p className="font-bold">{song.title}</p>
            <p>{song.artist}</p>
            {/* Add more song details and expand functionality here */}
          </li>
        ))}
      </ul>
    </div>
  )
}


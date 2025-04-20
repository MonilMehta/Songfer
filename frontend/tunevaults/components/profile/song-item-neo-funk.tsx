'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Download, Music } from 'lucide-react'

// Define the Song interface (ensure it matches the one in page.tsx)
interface Song {
  id: number
  title: string
  artist: string
  album?: string 
  song_url: string
  thumbnail_url?: string | null
  image_url?: string | null
  source: string
  created_at: string
  file_url: string 
}

interface SongItemNeoFunkProps {
  song: Song // Use the defined Song interface
}

// Neo Funk Song Item Component
export function SongItemNeoFunk({ song }: SongItemNeoFunkProps) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors group relative overflow-hidden">
      {/* Album Art / Thumbnail */}
      <div className="h-14 w-14 rounded bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex-shrink-0 relative overflow-hidden shadow-md">
        {song.thumbnail_url || song.image_url ? (
          <img 
            src={song.thumbnail_url || song.image_url} 
            alt={song.title} 
            className="h-full w-full object-cover"
            // Consider adding onError fallback like in the original SongItem
            // onError={(e) => (e.currentTarget.style.display = 'none')} 
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-black/40">
            <Music className="h-6 w-6 text-[#FF0099]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {/* Simple Play Icon */}
          <div className="h-8 w-8 rounded-full bg-[#FF0099]/80 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 3L19 12L5 21V3Z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Song Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white truncate" title={song.title}>{song.title}</h3>
        <p className="text-sm text-white/60 truncate" title={song.artist}>{song.artist}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 bg-white/5 text-white/60 border-white/10 hover:bg-white/10 capitalize">
            {song.source}
          </Badge>
          <span className="text-xs text-white/40">
            {new Date(song.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      
      {/* Download Button */}
      <a 
        href={song.file_url} 
        download 
        aria-label="Download song"
        // Tooltip might be nice here
        className="flex-shrink-0 h-8 w-8 rounded-full bg-black/40 text-white/60 hover:text-white flex items-center justify-center transition-colors border border-white/10 hover:border-white/30"
        // Prevent hover effect from triggering when clicking download
        onClick={(e) => e.stopPropagation()} 
      >
        <Download className="h-4 w-4" />
      </a>
      
      {/* Neon light effect on hover */}
      <div className="absolute -left-20 group-hover:left-full w-20 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 transition-all duration-700 ease-in-out transform -translate-x-full group-hover:translate-x-0 pointer-events-none"></div>
    </div>
  )
} 
'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Play, Pause, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import apiCaller from '@/utils/apiCaller'

interface SongCardProps {
  song: {
    id: number
    title: string
    artist: string
    album?: string
    duration?: string
    cover_url?: string
    download_url?: string
  }
  onDownload?: (song: any) => void
}

export default function SongCard({ song, onDownload }: SongCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const handlePlay = () => {
    setIsPlaying(!isPlaying)
    // Here you would implement actual audio playback
    console.log('Playing song:', song.title)
  }

  const handleDownload = async () => {
    try {
      setIsDownloading(true)
      // Here you would implement actual download functionality
      console.log('Downloading song:', song.title)
      
      // If onDownload prop is provided, call it with the song
      if (onDownload) {
        onDownload(song)
        return
      }
      
      // Simulate download delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // If the song has a download URL, you could trigger the download
      if (song.download_url) {
        window.open(song.download_url, '_blank')
      }
    } catch (error) {
      console.error('Error downloading song:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden">
        {song.cover_url ? (
          <img 
            src={song.cover_url} 
            alt={`${song.title} cover`} 
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="text-4xl">🎵</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white/30"
            onClick={handlePlay}
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>
        </div>
      </div>
      
      <CardHeader className="p-4">
        <h3 className="font-semibold truncate">{song.title}</h3>
        <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
        {song.album && (
          <p className="text-xs text-muted-foreground truncate">{song.album}</p>
        )}
      </CardHeader>
      
      <CardContent className="p-4 pt-0">
        {song.duration && (
          <p className="text-xs text-muted-foreground">{song.duration}</p>
        )}
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              <span>Downloading...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>Download</span>
            </>
          )}
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Add to Playlist</DropdownMenuItem>
            <DropdownMenuItem>Share</DropdownMenuItem>
            <DropdownMenuItem>View Details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  )
} 
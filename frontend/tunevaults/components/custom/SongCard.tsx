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
}

export default function SongCard({ song }: SongCardProps) {
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
          className="w-full mr-2"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <span className="flex items-center">
              <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
              Downloading...
            </span>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download
            </>
          )}
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Add to playlist</DropdownMenuItem>
            <DropdownMenuItem>Share</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  )
} 
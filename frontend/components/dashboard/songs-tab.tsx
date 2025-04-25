'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Music } from 'lucide-react'
import { SongCard } from '@/components/song-card'

interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration: string
  thumbnail: string
  cover_url?: string
  download_url?: string
  spotify_id?: string
  youtube_id?: string
}

interface SongsTabProps {
  songs: Song[]
  isLoading: boolean
}

export function SongsTab({ songs, isLoading }: SongsTabProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!songs.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Music className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No downloads yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Download your first song to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {songs.map((song) => (
        <SongCard
          key={song.id}
          song={song}
        />
      ))}
    </div>
  );
} 
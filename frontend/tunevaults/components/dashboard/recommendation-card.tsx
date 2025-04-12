'use client'

import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Heart, Music, PlayCircle, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface RecommendationCardProps {
  song: {
    id: string
    title: string
    artist: string
    artists?: string
    album?: string
    popularity: number
    spotify_id?: string
    thumbnail_url?: string
    image_url?: string
    genre?: string
  }
}

export function RecommendationCard({ song }: RecommendationCardProps) {
  return (
    <Card className="overflow-hidden group">
      <div className="aspect-square relative bg-muted">
        {song.thumbnail_url ? (
          <Image 
            src={song.thumbnail_url} 
            alt={song.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Music className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="icon" variant="secondary" className="h-9 w-9 rounded-full">
            <PlayCircle className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="secondary" className="h-9 w-9 rounded-full">
            <Download className="h-4 w-4" />
          </Button>
        </div>
        
        {song.genre && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="bg-black/50 hover:bg-black/50 text-white border-none text-xs">
              {song.genre}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <div className="space-y-1">
          <h3 className="font-medium truncate">{song.title}</h3>
          <p className="text-sm text-muted-foreground truncate">{song.artist || song.artists}</p>
        </div>
        <div className="flex items-center mt-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary" 
              style={{ width: `${song.popularity || 50}%` }}
            ></div>
          </div>
          <span className="text-xs ml-2">{song.popularity || 50}%</span>
        </div>
      </CardContent>
      <CardFooter className="p-0 flex">
        <Button variant="ghost" className="w-full rounded-none h-9 text-xs gap-1 text-primary border-r">
          <Heart className="h-3 w-3" />
          Save
        </Button>
        <Button variant="ghost" className="w-full rounded-none h-9 text-xs gap-1 border-l">
          <Plus className="h-3 w-3" />
          Queue
        </Button>
      </CardFooter>
    </Card>
  )
} 
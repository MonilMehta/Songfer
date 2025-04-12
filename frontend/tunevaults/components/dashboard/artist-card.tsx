'use client'

import Image from 'next/image'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Music, Clock, PlayCircle } from 'lucide-react'

interface ArtistCardProps {
  artist: {
    name: string
    count: number
    image?: string
    lastDownloaded?: string
  }
}

export function ArtistCard({ artist }: ArtistCardProps) {
  // Helper function to format date
  const formatDateFromNow = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square relative">
        <Image 
          src={artist.image || "/placeholder-artist.jpg"} 
          alt={artist.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end">
          <div className="p-3 text-white">
            <h3 className="font-semibold truncate">{artist.name}</h3>
          </div>
        </div>
      </div>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Music className="h-3 w-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{artist.count} {artist.count === 1 ? 'song' : 'songs'}</p>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {formatDateFromNow(artist.lastDownloaded)}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-0">
        <Button variant="ghost" className="w-full rounded-none h-9 text-xs gap-1 text-primary">
          <PlayCircle className="h-3 w-3" />
          Play All
        </Button>
      </CardFooter>
    </Card>
  )
} 
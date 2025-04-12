'use client'

import { Button } from '@/components/ui/button'
import { UserIcon } from 'lucide-react'
import { ArtistCard } from './artist-card'

interface Artist {
  name: string
  count: number
  image?: string
  lastDownloaded?: string
}

interface ArtistGridProps {
  artists: Artist[]
  isLoading?: boolean
}

export function ArtistGrid({ artists, isLoading = false }: ArtistGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!artists.length) {
    return null;
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <UserIcon className="w-5 h-5 mr-2 text-blue-500" />
          <h2 className="text-xl font-bold">Your Top Artists</h2>
        </div>
        <Button variant="outline" size="sm" className="text-xs">
          View All
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {artists.map((artist, index) => (
          <ArtistCard key={index} artist={artist} />
        ))}
      </div>
    </div>
  );
} 
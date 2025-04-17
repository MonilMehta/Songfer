'use client'

import { Button } from '@/components/ui/button'
import { UserIcon } from 'lucide-react'
import { ArtistCard } from './artist-card'
import { useEffect, useState } from 'react'

// This should match what ArtistCard expects
interface ProcessedArtist {
  name: string
  count: number
  image?: string
  lastDownloaded?: string
}

// This matches the backend response
interface ArtistFromBackend {
  artist?: string
  name?: string
  count: number
  image?: string
  lastDownloaded?: string
}

interface ArtistGridProps {
  artists: ArtistFromBackend[]
  isLoading?: boolean
}

export function ArtistGrid({ artists, isLoading = false }: ArtistGridProps) {
  const [processedArtists, setProcessedArtists] = useState<ProcessedArtist[]>([]);

  useEffect(() => {
    // Process artists to clean names and add images if missing
    if (artists && artists.length > 0) {
      const processed = artists.map(artist => {
        // Determine artist name, prioritizing 'name' field if it exists
        const artistName = 
          (artist.name ? artist.name : artist.artist ? artist.artist : 'Unknown Artist')
            .replace(/['"]/g, '');
        
        return {
          name: artistName,
          count: artist.count,
          lastDownloaded: artist.lastDownloaded || new Date().toISOString(),
          image: artist.image || getArtistImage(artistName)
        };
      });
      
      setProcessedArtists(processed);
    }
  }, [artists]);

  // Helper function to get artist image
  const getArtistImage = (artistName: string) => {
    // This would be replaced with actual images from your backend
    const hash = artistName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://source.unsplash.com/random/200x200/?musician&sig=${hash}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!processedArtists.length) {
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
        {processedArtists.map((artist, index) => (
          <ArtistCard key={index} artist={artist} />
        ))}
      </div>
    </div>
  );
} 
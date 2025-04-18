'use client'

import { Button } from '@/components/ui/button'
import { Headphones, PlusCircle } from 'lucide-react'
import { ArtistCard } from './artist-card'
import { useEffect, useState } from 'react'

// This matches the backend response
interface ArtistFromBackend {
  artist?: string
  name?: string
  count: number
  image?: string
  artist_img?: string
  lastDownloaded?: string
  country?: string
  artist_genre?: string
}

// This should match what ArtistCard expects
interface ProcessedArtist {
  name: string
  count: number
  image?: string
  lastDownloaded?: string
  country?: string
  artist_genre?: string
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
          image: artist.artist_img || artist.image || getArtistImage(artistName),
          country: artist.country,
          artist_genre: artist.artist_genre
        };
      });
      
      setProcessedArtists(processed);
    }
  }, [artists]);

  // Helper function to get artist image
  const getArtistImage = (artistName: string) => {
    // This would be replaced with actual images from your backend
    const hash = artistName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://source.unsplash.com/random/400x400/?musician&sig=${hash}`;
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
    <div className="py-8 relative">
      {/* Decorative Elements */}
      <div className="absolute -z-10 -left-16 top-20 w-32 h-32 rounded-full bg-primary/5 blur-xl" />
      <div className="absolute -z-10 right-10 bottom-10 w-40 h-40 rounded-full bg-secondary/5 blur-xl" />
      
      {/* Header Section with Funky Typography */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10">
        <div>
          <h2 className="flex items-center text-3xl font-black">
            <span className="inline-block transform -rotate-2 text-primary mr-2">YOUR</span>
            <span className="inline-block transform rotate-1 mr-2">TOP</span>
            <span className="inline-block transform -rotate-1">ARTISTS</span>
          </h2>
          <div className="flex items-center mt-2 text-muted-foreground">
            <Headphones className="h-4 w-4 mr-2" />
            <span>{processedArtists.length} artists on rotation</span>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          className="group mt-4 md:mt-0 rounded-full border-dashed border-primary/30"
        >
          <PlusCircle className="h-4 w-4 mr-2 group-hover:text-primary" />
          <span>EXPLORE ARTISTS</span>
        </Button>
      </div>
      
      {/* Artist Grid with even spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {processedArtists.map((artist, idx) => (
          <div key={idx} className="h-full">
            <ArtistCard artist={artist} />
          </div>
        ))}
      </div>
    </div>
  );
}
/* eslint-disable */
'use client'

import { Button } from '@/components/ui/button'
import { Headphones, PlusCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { ArtistCard } from './artist-card'
import { useEffect, useState, useMemo } from 'react'

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
  const [showAll, setShowAll] = useState(false);
  
  // Funky loading messages for rotation
  const loadingMessages = [
    "Discovering your music taste...",
    "Finding your rhythm heroes...",
    "Tuning into your vibe...",
    "Calculating your sonic preferences...",
    "Analyzing your musical DNA..."
  ];

  const randomLoadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  // Helper function to get artist image (can remain outside useMemo)
  const getArtistImage = (artistName: string) => {
    // This would be replaced with actual images from your backend
    const hash = artistName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://source.unsplash.com/random/400x400/?musician&sig=${hash}`;
  };

  // Process artists using useMemo
  const processedArtists = useMemo(() => {
    if (!artists || artists.length === 0) {
      return [];
    }

    return artists.map(artist => {
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
  }, [artists]); // Dependency array

  // Determine which artists to display based on showAll state
  const displayArtists = showAll ? processedArtists : processedArtists.slice(0, 4);

  // Skeleton loader component for artist card
  const ArtistCardSkeleton = () => (
    <div className="relative overflow-hidden rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-30"></div>
      <div className="animate-pulse">
        <div className="aspect-square w-full bg-muted/40 rounded-t-lg"></div>
        <div className="p-4">
          <div className="h-5 bg-muted/60 rounded-md w-2/3 mb-2"></div>
          <div className="h-4 bg-muted/40 rounded-md w-1/3"></div>
          <div className="flex justify-between items-center mt-3">
            <div className="h-8 bg-muted/50 rounded-full w-16"></div>
            <div className="h-8 bg-muted/30 rounded-full w-8"></div>
          </div>
        </div>
      </div>
    </div>
  );

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
            {isLoading ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-pulse text-primary" />
                <span className="inline-flex items-center">
                  {randomLoadingMessage}
                  <span className="ml-1 animate-pulse">•••</span>
                </span>
              </>
            ) : (
              <>
                <Headphones className="h-4 w-4 mr-2" />
                <span>{processedArtists.length} artists on rotation</span>
              </>
            )}
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          className="group mt-4 md:mt-0 rounded-full border-dashed border-primary/30"
          disabled={isLoading}
        >
          <PlusCircle className="h-4 w-4 mr-2 group-hover:text-primary" />
          <span>EXPLORE ARTISTS</span>
        </Button>

        {/* Conditionally render the "Show All" / "Show Less" button if more than 4 artists */} 
        {!isLoading && processedArtists.length > 4 && (
          <Button 
            variant="ghost" 
            size="sm"
            className="ml-auto mt-4 md:mt-0 text-primary hover:bg-primary/10"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show All ({processedArtists.length})
              </>
            )}
          </Button>
        )}
      </div>
      
      {/* Artist Grid - with loading state or actual content */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          // Show skeleton loaders while loading
          Array(4).fill(0).map((_, idx) => (
            <div key={idx} className="h-full">
              <ArtistCardSkeleton />
            </div>
          ))
        ) : (
          // Show actual artist cards when loaded
          displayArtists.map((artist, idx) => (
            <div key={idx} className="h-full">
              <ArtistCard artist={artist} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
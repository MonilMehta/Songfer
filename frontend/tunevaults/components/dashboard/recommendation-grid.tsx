'use client'

import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { RecommendationCard } from './recommendation-card'
import { useEffect, useState } from 'react'

// For the processed recommendations that the card component expects
interface ProcessedRecommendation {
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

// What comes from the backend
interface RecommendationFromBackend {
  id?: string
  title: string
  artist: string | string[]
  artists?: string
  album?: string
  popularity: number
  spotify_id?: string
  thumbnail_url?: string | null
  image_url?: string | null
  genre?: string
  source?: string
  created_at?: string
  song_url?: string | null
  file_url?: string | null
}

interface RecommendationGridProps {
  recommendations: RecommendationFromBackend[]
  isLoading?: boolean
  onRefresh?: () => void
}

export function RecommendationGrid({ 
  recommendations, 
  isLoading = false,
  onRefresh
}: RecommendationGridProps) {
  const [processedRecommendations, setProcessedRecommendations] = useState<ProcessedRecommendation[]>([]);

  useEffect(() => {
    if (recommendations && recommendations.length > 0) {
      const processed = recommendations.map(rec => {
        // Process artist field which might be a string array in brackets
        let artistName = '';
        if (typeof rec.artist === 'string') {
          // Handle case where artist is a string that might contain array notation like "['Artist Name']"
          artistName = rec.artist.replace(/^\['|'\]$|"|'/g, '').replace(/','|", "/g, ', ');
        } else if (Array.isArray(rec.artist)) {
          // Handle case where artist is actually an array
          artistName = rec.artist.join(', ');
        }

        // Generate a thumbnail URL if one doesn't exist
        const thumbnailUrl = rec.thumbnail_url || rec.image_url || getThumbnailForSpotifyTrack(rec.spotify_id);

        return {
          id: rec.id || rec.spotify_id || `rec-${Math.random().toString(36).substring(2, 9)}`,
          title: rec.title,
          artist: artistName,
          artists: artistName, // Duplicate for compatibility
          album: rec.album || 'Unknown',
          popularity: rec.popularity || 50,
          spotify_id: rec.spotify_id,
          thumbnail_url: thumbnailUrl,
          image_url: rec.image_url || thumbnailUrl,
          genre: rec.genre || getRandomGenre() // This would ideally come from your API
        };
      });
      
      setProcessedRecommendations(processed);
    }
  }, [recommendations]);

  // Helper function to get a thumbnail for a Spotify track
  const getThumbnailForSpotifyTrack = (spotifyId?: string) => {
    if (!spotifyId) {
      // If no Spotify ID, generate a random placeholder
      const randomId = Math.floor(Math.random() * 1000);
      return `https://source.unsplash.com/random/300x300/?album&sig=${randomId}`;
    }
    
    // Use the Spotify ID to generate a consistent placeholder
    return `https://source.unsplash.com/random/300x300/?album&sig=${spotifyId}`;
    
    // In a real app, you might fetch the actual image from Spotify API
    // return `https://i.scdn.co/image/${spotifyId}`;
  };

  // Helper function for random genre (temporary)
  const getRandomGenre = () => {
    const genres = ['Hip Hop', 'Pop', 'R&B', 'Rock', 'Electronic', 'Jazz', 'Country', 'Alternative', 'Indie'];
    return genres[Math.floor(Math.random() * genres.length)];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!processedRecommendations.length) {
    return null;
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Sparkles className="w-5 h-5 mr-2 text-primary" />
          <h2 className="text-xl font-bold">Recommended for You</h2>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {processedRecommendations.map((song) => (
          <RecommendationCard key={song.id} song={song} />
        ))}
      </div>
    </div>
  );
} 
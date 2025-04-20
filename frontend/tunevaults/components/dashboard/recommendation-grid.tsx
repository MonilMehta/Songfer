/* eslint-disable */
'use client'

import { Button } from '@/components/ui/button'
import { RecommendationCard } from './recommendation-card'
import { FloatingPlayerBar } from '@/components/player/FloatingPlayerBar'
import { useEffect, useState, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { PlayerProvider } from '@/context/PlayerContext'
import { RefreshCw, Play as PlayIcon } from 'lucide-react'

// For the processed recommendations that the card component expects
interface ProcessedRecommendation {
  id: string
  title: string
  artist: string | string[]
  artists?: string
  album?: string
  popularity: number
  spotify_id?: string
  thumbnail_url?: string | null
  image_url?: string | null
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
  const { theme } = useTheme();
  const [currentPage, setCurrentPage] = useState(0);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
  const itemsPerPage = 5;
  
  // Generate a genre based on title and artist if not provided by backend
  const generateGenreFromTitle = (title: string, artist: string): string => {
    const titles = title.toLowerCase();
    const artists = artist.toLowerCase();
    
    // Simple genre mapping based on keywords
    if (titles.includes('remix') || artists.includes('dj')) return 'Hip Hop';
    if (artists.includes('wheeler') || artists.includes('jay')) return 'Jazz';
    if (artists.includes('imagine') || artists.includes('grande')) return 'Pop';
    if (artists.includes('weeknd') || artists.includes('electric')) return 'R&B';
    if (artists.includes('bieber') || artists.includes('chance')) return 'Jazz';
    
    // Random genre assignment
    const genres = ['Hip Hop', 'Pop', 'R&B', 'Rock', 'Electronic', 'Jazz', 'Country', 'Alternative', 'Indie'];
    return genres[Math.floor(Math.random() * genres.length)];
  };

  // Process recommendations using useMemo
  const processedRecommendations = useMemo(() => {
    if (!recommendations || recommendations.length === 0) {
      return [];
    }
    
    return recommendations.map(rec => {
      // Process artist field which might be a string array in brackets
      let artistName = '';
      if (typeof rec.artist === 'string') {
        // Handle case where artist is a string that might contain array notation like "['Artist Name']"
        artistName = rec.artist.replace(/^\[\'|"\]$|"|'/g, '').replace(/\',\'|", "/g, ', ');
      } else if (Array.isArray(rec.artist)) {
        // Handle case where artist is actually an array
        artistName = rec.artist.join(', ');
      }
      
      return {
        id: rec.id || rec.spotify_id || `rec-${Math.random().toString(36).substring(2, 9)}`,
        title: rec.title,
        artist: rec.artist, // Keep original for processing
        artists: artistName, // Formatted for display
        album: rec.album || 'Unknown',
        popularity: rec.popularity || 50,
        spotify_id: rec.spotify_id,
        thumbnail_url: null, // We'll fetch thumbnails in the card component
        image_url: null,
        genre: rec.genre || generateGenreFromTitle(rec.title, artistName) // Generate a genre if not provided
      };
    });
  }, [recommendations]); // Dependency array ensures recalculation only when recommendations change

  // Effect to reset pagination when recommendations change
  useEffect(() => {
    setCurrentPage(0);
    setShowLoadMoreButton(false);
  }, [processedRecommendations]);

  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    const totalPages = Math.ceil(processedRecommendations.length / itemsPerPage);
    
    if (nextPage < totalPages) {
      setCurrentPage(nextPage);
    } else {
      // We've shown all recommendations, now show the load more button
      setShowLoadMoreButton(true);
    }
  };
  
  const handleLoadMore = () => {
    if (onRefresh) {
      setShowLoadMoreButton(false);
      setCurrentPage(0);
      onRefresh();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (!processedRecommendations.length) {
    return (
      <div className="mt-6 relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-black p-8 shadow-lg text-center">
        <div className="wave-animation"></div>
        <div className="relative z-10">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-3">No Recommendations Available</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">We're still learning your musical taste</p>
          <Button 
            onClick={onRefresh}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Discover New Music
          </Button>
        </div>
      </div>
    );
  }

  // Get current page of recommendations
  const currentRecommendations = processedRecommendations.slice(
    currentPage * itemsPerPage, 
    (currentPage + 1) * itemsPerPage
  );
  
  const totalPages = Math.ceil(processedRecommendations.length / itemsPerPage);

  return (
    <PlayerProvider>
      <div className="mt-6 relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-black p-6 shadow-lg">
        {/* Wave animation */}
        <div className="wave-animation"></div>
        
        {/* Decorative Elements - Added from ArtistGrid */}
        <div className="absolute -z-10 -left-16 top-10 w-32 h-32 rounded-full bg-blue-500/5 blur-2xl" />
        <div className="absolute -z-10 right-10 -bottom-10 w-40 h-40 rounded-full bg-cyan-500/5 blur-2xl" />
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8"> 
            <div>
              <h2 className="text-3xl font-black">
                <span className="inline-block transform -rotate-2 text-blue-600 dark:text-blue-400 mr-2">YOUR</span>
                <span className="inline-block transform rotate-1 mr-2">VIBE</span>
                <span className="inline-block transform -rotate-1">TODAY</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-2">Fresh picks based on your taste</p>
            </div>
            
            {!showLoadMoreButton ? (
              <Button 
                variant="ghost" 
                size="sm"
                className="text-slate-800 dark:text-white bg-white/80 dark:bg-blue-900/40 hover:bg-slate-200 dark:hover:bg-blue-800/60 gap-2 h-9 px-4 rounded-full mt-4 md:mt-0"
                onClick={handleNextPage}
              >
                <PlayIcon className="w-4 h-4" />
                Next {itemsPerPage}
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="text-slate-800 dark:text-white border-slate-300 dark:border-blue-700 hover:bg-slate-100 dark:hover:bg-blue-800/60 gap-2 h-9 px-4 rounded-full mt-4 md:mt-0"
                onClick={handleLoadMore}
              >
                <RefreshCw className="w-4 h-4" />
                Get New Recommendations
              </Button>
            )}
          </div>
          
          {/* Pagination dots */}
          {totalPages > 1 && !showLoadMoreButton && (
            <div className="flex justify-center mb-6">
              <div className="flex gap-1.5">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${i === currentPage ? 'bg-blue-600 dark:bg-blue-500 scale-125' : 'bg-slate-400 dark:bg-slate-600 opacity-70'}`}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Recommendations grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
            {currentRecommendations.map((song) => (
              <RecommendationCard 
                key={song.id} 
                song={song}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Floating Player Bar */}
      <FloatingPlayerBar />
    </PlayerProvider>
  );
}
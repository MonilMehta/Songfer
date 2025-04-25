/* eslint-disable */
'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { RecommendationCard } from './recommendation-card'
import { useState, useMemo } from 'react'

interface Recommendation {
  id: string
  title: string
  artist: string // Can be a stringified list like "['Artist1', 'Artist2']"
  artists?: string // Keep for potential fallback, though API seems to use 'artist'
  album?: string
  popularity: number
  spotify_id?: string
  thumbnail_url?: string // API now provides this directly
  image_url?: string // Keep as fallback? Unlikely needed now.
  genre?: string
}

interface RecommendationGridProps {
  recommendations: Recommendation[]
  isLoading?: boolean
  onRefresh?: () => void
}

// Helper function to parse the artist string
const parseArtistString = (artistStr: string | string[] | undefined): string => {
  if (!artistStr) return 'Unknown Artist';
  if (Array.isArray(artistStr)) return artistStr.join(', '); // If it's already an array

  // Check if it looks like a stringified list (e.g., "['Artist1', 'Artist2']")
  if (typeof artistStr === 'string' && artistStr.startsWith('[') && artistStr.endsWith(']')) {
    try {
      // Replace single quotes with double quotes for valid JSON and parse
      const jsonString = artistStr.replace(/'/g, '"');
      const artists = JSON.parse(jsonString);
      if (Array.isArray(artists)) {
        return artists.join(', ');
      }
    } catch (e) {
      // Fallback: remove brackets and quotes if JSON parsing fails
      console.warn("Failed to parse artist string as JSON, using fallback:", artistStr, e);
      const cleanedString = artistStr.replace(/[\[\]']/g, '');
      // Check if the cleaned string is empty after removing brackets/quotes
      return cleanedString.trim() || 'Unknown Artist';
    }
  }
  // If it's just a plain string, return it
  return artistStr;
};


export function RecommendationGrid({ 
  recommendations = [], 
  isLoading = false,
  onRefresh 
}: RecommendationGridProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  // Funky loading messages for recommendations
  const loadingMessages = [
    "Scanning the sonic spectrum...",
    "Crafting your personalized playlist...",
    "Matching beats to your heartbeat...",
    "Curating your next favorite tracks...",
    "Exploring musical galaxies for you..."
  ];
  
  const randomLoadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
  
  const processedRecommendations = useMemo(() => {
    if (!recommendations || recommendations.length === 0) {
      return [];
    }
    
    return recommendations.map(rec => ({
      id: rec.id || rec.spotify_id || `rec-${Math.random().toString(36).substring(2, 9)}`,
      title: rec.title || 'Unknown Track',
      // Use the helper function to parse the artist field
      artist: parseArtistString(rec.artist),
      album: rec.album || 'Unknown Album',
      // Prioritize thumbnail_url from the API
      image: rec.thumbnail_url, // Removed fallback to image_url as thumbnail_url is now provided
      spotify_id: rec.spotify_id,
      genre: rec.genre || 'Unknown Genre',
      popularity: rec.popularity || Math.floor(Math.random() * 100)
    }));
  }, [recommendations]);
  
  // Only display 5 recommendations by default
  const displayedRecommendations = showAll 
    ? processedRecommendations 
    : processedRecommendations.slice(0, 5);
  
  const handleRefresh = async () => {
    if (onRefresh && !isRefreshing && !isLoading) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };
  
  // Skeleton loader component for recommendation card - Refined appearance
  const RecommendationCardSkeleton = () => (
    <div className="bg-card/40 border border-border/20 rounded-xl overflow-hidden backdrop-blur-sm h-full">
      <div className="animate-pulse">
        <div className="flex items-center p-3 space-x-3">
          <div className="w-12 h-12 bg-muted/30 rounded-md flex-shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted/50 rounded-md w-3/4"></div>
            <div className="h-3 bg-muted/40 rounded-md w-1/2"></div>
          </div>
          <div className="h-8 w-8 bg-muted/30 rounded-full"></div>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <div className="h-2 bg-muted/20 rounded-full w-full"></div>
          <div className="flex justify-between items-center pt-1">
            <div className="h-4 bg-muted/30 rounded-md w-16"></div>
            <div className="h-4 bg-muted/20 rounded-full w-8"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="py-8 relative">
      {/* Decorative Elements */}
      <div className="absolute -z-10 -right-20 top-10 w-48 h-48 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -z-10 left-20 bottom-20 w-32 h-32 rounded-full bg-secondary/5 blur-2xl" />
      
      {/* Header Section with Refined Typography & Spacing */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="flex items-center text-3xl font-black">
            {/* Slightly adjusted transforms */}
            <span className="inline-block transform rotate-1 text-primary mr-2">FRESH</span>
            <span className="inline-block transform -rotate-1 mr-2">PICKS</span>
            <span className="inline-block transform rotate-1">FOR YOU</span>
          </h2>
          <div className="flex items-center mt-2 text-muted-foreground">
            {isLoading || isRefreshing ? (
              <>
                <Sparkles className="h-4 w-4 mr-2 animate-pulse text-primary" />
                <span className="inline-flex items-center">
                  {randomLoadingMessage}
                  <span className="ml-1 animate-pulse">•••</span>
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {/* Display count from processedRecommendations */}
                <span>{processedRecommendations.length} tracks based on your taste</span>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap"> {/* Wrapper for buttons */}
          {/* Use processedRecommendations.length for conditional rendering */}
          {!isLoading && processedRecommendations.length > 5 && (
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary hover:bg-primary/10 rounded-full" // Added rounded-full
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" /> {/* Reduced margin */}
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" /> {/* Reduced margin */}
                  Show All ({processedRecommendations.length})
                </>
              )}
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            className={`group rounded-full border-dashed border-primary/30 hover:border-primary/50 transition-colors ${(isLoading || isRefreshing) ? 'opacity-50 cursor-not-allowed' : ''}`} // Added hover and cursor styles
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 group-hover:text-primary transition-colors ${(isLoading || isRefreshing) ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </Button>
        </div>
      </div>
      
      {/* Recommendations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {isLoading || isRefreshing ? (
          // Show skeleton loaders while loading
          Array(5).fill(0).map((_, idx) => (
            <div key={idx} className="h-full"> {/* Ensure skeleton takes full height */}
              <RecommendationCardSkeleton />
            </div>
          ))
        ) : processedRecommendations.length > 0 ? (
          // Show actual recommendation cards when loaded
          displayedRecommendations.map((recommendation) => (
            // Added group and hover effect to the wrapper
            <div key={recommendation.id} className="h-full group transition-all duration-300 ease-out hover:scale-[1.03]"> 
              <RecommendationCard recommendation={recommendation} />
            </div>
          ))
        ) : (
          // Show empty state when no recommendations
          <div className="col-span-full p-10 text-center bg-card/50 border border-border/30 rounded-xl">
            <h3 className="text-xl font-semibold mb-2">No recommendations yet</h3>
            <p className="text-muted-foreground mb-4">
              Download more songs to get personalized recommendations
            </p>
            <Button variant="default" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Now
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
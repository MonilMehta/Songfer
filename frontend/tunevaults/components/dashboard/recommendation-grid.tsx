'use client'

import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { RecommendationCard } from './recommendation-card'

interface Recommendation {
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

interface RecommendationGridProps {
  recommendations: Recommendation[]
  isLoading?: boolean
  onRefresh?: () => void
}

export function RecommendationGrid({ 
  recommendations, 
  isLoading = false,
  onRefresh
}: RecommendationGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!recommendations.length) {
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
        {recommendations.map((song) => (
          <RecommendationCard key={song.id} song={song} />
        ))}
      </div>
    </div>
  );
} 
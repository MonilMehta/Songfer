'use client'

import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Music, MapPin } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'framer-motion'

interface ArtistCardProps {
  artist: {
    name: string
    count: number
    image?: string
    lastDownloaded?: string
    country?: string
    artist_genre?: string
  }
}

export function ArtistCard({ artist }: ArtistCardProps) {
  // Get genres as an array
  const getGenres = (genreString?: string): string[] => {
    if (!genreString) return [];
    return genreString.split(',').map(genre => genre.trim());
  };

  // Get genres for display and tooltip
  const allGenres = getGenres(artist.artist_genre);
  const displayGenres = allGenres.slice(0, 2);
  
  // Generate color based on artist name for consistent but unique colors
  const generateColor = (name: string) => {
    const charCode = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const hue = charCode % 360;
    return {
      primary: `hsl(${hue}, 85%, 65%)`,
      secondary: `hsl(${(hue + 40) % 360}, 80%, 60%)`,
    };
  };

  const colors = generateColor(artist.name);

  return (
    <motion.div
      whileHover={{ 
        y: -8,
        transition: { type: 'spring', stiffness: 300 }
      }}
      className="h-full w-full"
    >
      <Card className="h-full overflow-hidden rounded-2xl border-0 shadow-lg">
        {/* Artist Image Section */}
        <div className="relative aspect-square overflow-hidden">
          <div 
            className="absolute inset-0 z-10 bg-gradient-to-b from-black/10 via-transparent to-black/80"
          />
          <Image
            src={artist.image || "/placeholder-artist.jpg"}
            alt={artist.name}
            fill
            className="object-cover"
          />
          
          {/* Diagonal Color Overlay */}
          <div 
            className="absolute -bottom-10 right-0 h-2/3 w-full rotate-6 z-20"
            style={{ 
              background: `linear-gradient(45deg, ${colors.primary}, ${colors.secondary})`,
              mixBlendMode: 'overlay'
            }}
          />
          
          {/* Artist Name */}
          <h3 className="absolute bottom-3 left-4 text-xl font-bold text-white z-30 drop-shadow-md">
            {artist.name}
          </h3>
          
          {/* Country Badge */}
          {artist.country && (
            <Badge 
              className="absolute top-3 right-3 bg-white/80 text-black text-xs flex items-center gap-1 px-2 backdrop-blur-sm z-30"
            >
              <MapPin className="h-3 w-3" />
              {artist.country}
            </Badge>
          )}
        </div>
        
        {/* Artist Info Section */}
        <div className="p-4 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <div 
              className="flex items-center justify-center h-10 w-10 rounded-full"
              style={{ background: colors.primary }}
            >
              <Music className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-2xl font-bold">{artist.count}</div>
              <div className="text-xs text-muted-foreground -mt-1">
                {artist.count === 1 ? 'track' : 'tracks'}
              </div>
            </div>
          </div>
          
          {/* Genres */}
          {allGenres.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {displayGenres.map((genre, idx) => (
                <Badge
                  key={idx}
                  className="text-white text-xs px-2 py-1 font-medium border-0"
                  style={{ 
                    background: idx === 0 ? colors.primary : colors.secondary,
                    transform: `rotate(${idx % 2 === 0 ? '-1deg' : '1deg'})` 
                  }}
                >
                  {genre}
                </Badge>
              ))}
              
              {allGenres.length > 2 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="bg-black/10 text-black hover:bg-black/20 text-xs font-medium cursor-pointer">
                        +{allGenres.length - 2}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="flex flex-wrap gap-1">
                        {allGenres.slice(2).map((genre, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
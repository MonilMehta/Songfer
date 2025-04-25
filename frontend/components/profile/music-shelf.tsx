/* eslint-disable */
'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Music, ListMusic, ChevronLeft, ChevronRight } from 'lucide-react' // Removed Play
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'

interface Song {
  id: number
  title: string
  artist: string
  album?: string
  song_url: string
  thumbnail_url?: string | null
  image_url?: string | null
  source: string
  created_at: string
  file_url: string
}

interface Playlist {
  id: number
  name: string
  source: string
  source_url: string
  created_at: string
  songs: Song[]
}

interface MusicShelfProps {
  items: Song[] | Playlist[]
  type: 'songs' | 'playlists'
  nowPlayingId?: number;
}

// Vinyl Disc SVG (More detailed)
const VinylDisc = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={`w-full h-full ${className} absolute top-0 left-0 z-0 translate-x-1 -translate-y-1 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-300 ease-out`}>
    <defs>
      <radialGradient id="vinylShine" cx="0.3" cy="0.3" r="0.7">
        <stop offset="0%" stopColor="#444" stopOpacity="0.8" />
        <stop offset="40%" stopColor="#222" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#111" stopOpacity="1" />
      </radialGradient>
      <filter id="vinylGrooves">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/>
        <feDiffuseLighting in="noise" lightingColor="#555" surfaceScale="0.5" result="light">
          <feDistantLight azimuth="45" elevation="60" />
        </feDiffuseLighting>
        <feComposite operator="in" in2="SourceGraphic" result="grooves"/>
        <feBlend in="SourceGraphic" in2="grooves" mode="multiply" />
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#vinylShine)" filter="url(#vinylGrooves)" />
    {/* Center Label */}
    <circle cx="50" cy="50" r="16" fill="hsl(var(--primary))" />
    <circle cx="50" cy="50" r="14.5" fill="hsl(var(--primary-foreground))" />
    <circle cx="50" cy="50" r="13" fill="hsl(var(--primary))" />
    {/* Spindle Hole */}
    <circle cx="50" cy="50" r="3" fill="#111" />
  </svg>
);

// Updated RecordSleeve to show vinyl disc
const RecordSleeve = ({ item, type }: { item: Song | Playlist; type: 'songs' | 'playlists' }) => {
  const isSong = 'artist' in item;
  const title = isSong ? (item as Song).title : (item as Playlist).name;
  const subtitle = isSong ? (item as Song).artist : `${(item as Playlist).songs.length} songs`;
  const imageUrl = isSong ? (item as Song).image_url || (item as Song).thumbnail_url || null : null;
  const date = new Date(item.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const [imgError, setImgError] = useState(false);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Outer container for positioning vinyl and sleeve */}
          <div className="relative aspect-square w-full group">
            {/* Vinyl Disc - positioned behind the sleeve */}
            {isSong && <VinylDisc className="w-[95%] h-[95%] opacity-90" />} 
            {/* Sleeve - positioned above the vinyl */}
            <motion.div
              className="relative aspect-square w-full cursor-pointer z-10 bg-gradient-to-br from-card to-muted/60 rounded-md shadow-lg overflow-hidden border border-border/20 group-hover:border-primary/40 transition-colors group-hover:shadow-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {imageUrl && !imgError ? (
                <Image
                  src={imageUrl}
                  alt={title}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={() => setImgError(true)}
                />
              ) : (
                // Placeholder for sleeve art
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/70 to-muted/90 p-4">
                   {/* Simple placeholder icon if no image */}
                   {isSong ? 
                     <Music className="w-1/2 h-1/2 text-muted-foreground/50" /> : 
                     <ListMusic className="w-1/2 h-1/2 text-muted-foreground/50" />
                   }
                </div>
              )}
              {/* Subtle overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 opacity-80 group-hover:opacity-60 transition-opacity"></div>

              {/* Content inside sleeve */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 to-transparent z-20">
                <h3 className="font-semibold text-sm text-primary-foreground truncate mb-0.5">{title}</h3>
                <p className="text-xs text-muted-foreground truncate group-hover:text-primary-foreground/80 transition-colors">{subtitle}</p>
              </div>
              
              {/* Source Badge */}
              <Badge variant="secondary" className="absolute top-2 right-2 text-xs bg-background/70 backdrop-blur-sm z-20">
                {item.source}
              </Badge>
            </motion.div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-center">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          <p className="text-xs text-muted-foreground mt-1">Added: {date}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export function MusicShelf({ items, type, nowPlayingId }: MusicShelfProps) {
  const [page, setPage] = useState(0);
  const itemsPerPage = 8;
  const maxPages = Math.ceil(items.length / itemsPerPage);
  const shelfRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [rotations, setRotations] = useState<number[]>([]);
  const [skews, setSkews] = useState<number[]>([]);

  // Re-introduce random rotations/skews for shelf items
  useEffect(() => {
    if (items.length > 0) {
      setRotations(items.map(() => Math.random() * 4 - 2)); // -2 to +2 degrees
      setSkews(items.map(() => Math.random() * 3 - 1.5)); // -1.5 to +1.5 degrees skew
    }
  }, [items]);

  const handlePrevPage = () => setPage(p => Math.max(0, p - 1));
  const handleNextPage = () => setPage(p => Math.min(maxPages - 1, p + 1));

  if (!items || items.length === 0) {
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center p-8 text-center border border-dashed rounded-lg bg-muted/30">
        <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
          {type === 'songs' ? (
            <Music className="h-8 w-8 text-muted-foreground" />
          ) : (
            <ListMusic className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <h3 className="text-lg font-semibold mb-2">No {type} yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {type === 'songs' 
            ? "Your downloaded songs will appear here. Start adding songs to your collection!"
            : "Your created playlists will appear here. Start creating playlists to organize your music!"}
        </p>
      </div>
    )
  }

  const currentItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  const rows: (typeof currentItems)[] = [];
  for (let i = 0; i < currentItems.length; i += 4) {
    rows.push(currentItems.slice(i, i + 4));
  }

  return (
    <div className="w-full">
      {/* Pagination Controls */}
      <div className="flex justify-between items-center mb-4 px-1">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {items.length} {type}
        </h3>
        {maxPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevPage}
              disabled={page === 0}
              className="h-7 w-7"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-muted-foreground">
              Page {page + 1} of {maxPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextPage}
              disabled={page >= maxPages - 1}
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="relative px-2 pb-8">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="relative flex flex-wrap justify-center sm:justify-between items-end mb-12 w-full" style={{ minHeight: 180 }}>
            {/* Restore original Shelf plank style */}
            <div className="absolute left-0 right-0 bottom-0 h-4 z-0 rounded-b-md bg-gradient-to-t from-yellow-900/80 via-yellow-800/70 to-yellow-900/60 border-b-4 border-yellow-950/90 shadow-[0_2px_10px_rgba(0,0,0,0.4)]" />
            {/* Records on shelf */}
            {row.map((item, idx) => {
              const globalIdx = page * itemsPerPage + rowIdx * 4 + idx;
              const rotation = rotations[globalIdx] || 0;
              const skew = skews[globalIdx] || 0;
              const isNowPlaying = nowPlayingId && item.id === nowPlayingId;
              return (
                <div
                  key={item.id}
                  ref={el => {
                    // Ensure ref array is large enough
                    if (shelfRefs.current.length <= globalIdx) {
                      shelfRefs.current.length = globalIdx + 1;
                    }
                    shelfRefs.current[globalIdx] = el;
                  }}
                  className={`relative z-10 mx-2 mb-4 sm:mb-0 w-[45%] sm:w-[22%] min-w-[120px] max-w-[180px] group transition-transform duration-300 ${isNowPlaying ? 'ring-4 ring-pink-400/70 shadow-lg animate-pulse-slow' : ''}`}
                  style={{
                    transform: `rotate(${rotation}deg) skewY(${skew}deg) translateY(0px)`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = `rotate(${rotation}deg) skewY(${skew}deg) translateY(-10px) scale(1.03)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = `rotate(${rotation}deg) skewY(${skew}deg) translateY(0px)`; }}
                >
                  <RecordSleeve
                    item={item}
                    type={type}
                  />
                  {/* Now Playing Glow */}
                  {isNowPlaying && (
                    <div className="absolute inset-0 rounded-lg pointer-events-none animate-glow-music" style={{ boxShadow: '0 0 32px 8px #ec4899, 0 0 0 2px #fff' }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
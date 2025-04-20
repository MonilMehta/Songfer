'use client'

import React, { useState, useRef } from 'react'
import Image from 'next/image'
import { Music, ListMusic, Play, ChevronLeft, ChevronRight } from 'lucide-react'
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
}

// Simplified Vinyl SVG Placeholder
const VinylPlaceholder = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={`w-full h-full ${className}`}>
    <circle cx="50" cy="50" r="48" fill="#1a1a1a" />
    <circle cx="50" cy="50" r="15" fill="hsl(var(--muted))" />
    <circle cx="50" cy="50" r="13" fill="hsl(var(--background))" />
    {/* Subtle grooves */}
    {Array.from({ length: 8 }).map((_, i) => (
      <circle key={i} cx="50" cy="50" r={18 + i * 3.5} fill="none" stroke="#333" strokeWidth="0.5" />
    ))}
  </svg>
);

// New RecordSleeve Component
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
          <motion.div
            className="relative aspect-square w-full cursor-pointer group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -5, scale: 1.03, zIndex: 10, transition: { duration: 0.2 } }} // Lift effect on hover
          >
            {/* Sleeve Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-card to-muted/50 rounded-md shadow-lg overflow-hidden border border-border/10 group-hover:border-primary/30 transition-colors group-hover:shadow-primary/10">
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
                // Placeholder when no image or image error
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted/60 to-muted/80">
                  <VinylPlaceholder className="w-3/4 h-3/4 opacity-50" />
                </div>
              )}
              {/* Subtle overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 opacity-70 group-hover:opacity-50 transition-opacity"></div>

              {/* Content inside sleeve */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent z-10">
                <h3 className="font-semibold text-sm text-primary-foreground truncate mb-0.5">{title}</h3>
                <p className="text-xs text-muted-foreground truncate group-hover:text-primary-foreground/80 transition-colors">{subtitle}</p>
              </div>
              
              {/* Source Badge */}
              <Badge variant="secondary" className="absolute top-2 right-2 text-xs bg-background/70 backdrop-blur-sm z-10">
                {item.source}
              </Badge>
            </div>
          </motion.div>
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

export function MusicShelf({ items, type, nowPlayingId }: MusicShelfProps & { nowPlayingId?: number }) {
  const [page, setPage] = useState(0);
  const itemsPerPage = 8; // Increase items per page for a denser look
  const maxPages = Math.ceil(items.length / itemsPerPage);
  const shelfRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Removed the random rotation/skew for straight shelves

  const handlePrevPage = () => setPage(p => Math.max(0, p - 1));
  const handleNextPage = () => setPage(p => Math.min(maxPages - 1, p + 1));

  if (!items || items.length === 0) {
    // Keep the empty state as is, it's clear
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

  // Group items into rows of 4 for larger screens, 2 for mobile
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
            {/* Shelf plank (wood/glass) */}
            <div className="absolute left-0 right-0 bottom-0 h-6 z-0 rounded-b-2xl bg-gradient-to-t from-yellow-900/80 via-yellow-700/60 to-yellow-200/30 shadow-2xl border-b-4 border-yellow-900/60" style={{ filter: 'blur(0.5px)' }} />
            {/* Records on shelf */}
            {row.map((item, idx) => {
              const globalIdx = rowIdx * 4 + idx;
              const isNowPlaying = nowPlayingId && item.id === nowPlayingId;
              return (
                <div
                  key={item.id}
                  ref={el => {
                    shelfRefs.current[globalIdx] = el;
                  }}
                  className={`relative z-10 mx-2 mb-4 sm:mb-0 w-[45%] sm:w-[22%] min-w-[120px] max-w-[180px] group transition-transform duration-300 hover:-translate-y-3 hover:scale-105 ${isNowPlaying ? 'ring-4 ring-pink-400/70 shadow-lg animate-pulse-slow' : ''}`}
                >
                  <RecordSleeve item={item} type={type} />
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
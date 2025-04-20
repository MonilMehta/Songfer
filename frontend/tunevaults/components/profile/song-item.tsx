'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, ExternalLink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Simple Vinyl SVG Placeholder
const VinylIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <path d="M12 12 L16 8" /> 
  </svg>
);

interface Song {
  id: number
  title: string
  artist: string
  album?: string // Make album optional for safety
  song_url: string
  thumbnail_url?: string | null
  image_url?: string | null
  source: string
  created_at: string
  file_url: string // URL to download the already downloaded file
}

interface SongItemProps {
  song: Song
}

export function SongItem({ song }: SongItemProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    let potentialUrl = song.thumbnail_url || song.image_url;
    
    if (potentialUrl) {
      // Basic check if URL seems valid (starts with http)
      if (potentialUrl.startsWith('http')) {
        setImageUrl(potentialUrl);
      } else {
        // Handle potentially incomplete/relative URLs if necessary, 
        // or just clear if invalid.
        console.warn(`Invalid URL format for song ${song.id}: ${potentialUrl}`);
        setImageUrl(null);
      } 
    } else {
       setImageUrl(null); // Explicitly set to null if no URL provided
    }
    setIsLoading(false);
    
    // Removed dynamic fetching from iTunes/Spotify for downloaded songs 
    // as the backend should provide image_url/thumbnail_url.
    // If fetching is desired, the logic from RecommendationCard can be added here.

  }, [song.thumbnail_url, song.image_url, song.id]);

  const handleDirectDownload = () => {
    if (!song.file_url) return;
    setIsDownloading(true);
    // Simulate download click - in reality, this might just open the link
    try {
      const a = document.createElement('a');
      a.href = song.file_url;
      a.download = `${song.artist} - ${song.title}.mp3`; // Or determine format dynamically if possible
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Maybe add a success toast here
    } catch (error) {
       console.error("Download link error:", error);
       // Maybe add an error toast here
    } finally {
       setIsDownloading(false);
    }
  };

  const openSourceUrl = () => {
    if (song.song_url) {
      window.open(song.song_url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center justify-between p-3 border border-border/10 rounded-lg bg-card hover:bg-muted/50 transition-all duration-200 shadow-sm hover:shadow-md gap-3">
        <div className="flex items-center space-x-4 overflow-hidden flex-1">
          {/* Image/Placeholder Area */}
          <div className="h-14 w-14 rounded flex-shrink-0 bg-muted flex items-center justify-center overflow-hidden border border-border/10">
            {isLoading ? (
              <div className="animate-pulse w-10 h-10 rounded bg-muted-foreground/20"></div>
            ) : imageUrl ? (
              <Image
                src={imageUrl}
                alt={song.title}
                width={56}
                height={56}
                className="object-cover h-full w-full"
                onError={() => setImageUrl(null)} // Fallback if image fails to load
              />
            ) : (
              <VinylIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          {/* Song Info */}
          <div className="overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                 <h3 className="font-semibold text-sm truncate cursor-default">{song.title}</h3>
              </TooltipTrigger>
              <TooltipContent>{song.title}</TooltipContent>
            </Tooltip>
            <Tooltip>
               <TooltipTrigger asChild>
                 <p className="text-xs text-muted-foreground truncate cursor-default">{song.artist}</p>
               </TooltipTrigger>
               <TooltipContent>{song.artist}</TooltipContent>
            </Tooltip>
            {song.album && (
             <Tooltip>
               <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground/70 truncate cursor-default">{song.album}</p>
               </TooltipTrigger>
                <TooltipContent>{song.album}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {/* Actions & Meta */}
        <div className="flex items-center space-x-2 flex-shrink-0 text-right">
          <div className="flex flex-col items-end">
             <span className="text-xs text-muted-foreground mb-1">{new Date(song.created_at).toLocaleDateString()}</span>
             <Badge variant="secondary" className="capitalize text-xs">{song.source}</Badge>
          </div>
           <Tooltip>
            <TooltipTrigger asChild>
               <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openSourceUrl} disabled={!song.song_url}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
             </TooltipTrigger>
             <TooltipContent>Open source ({song.source})</TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDirectDownload} disabled={!song.file_url || isDownloading}>
                   {isDownloading ? 
                     <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div> :
                     <Download className="h-4 w-4" />
                   }
                 </Button>
             </TooltipTrigger>
             <TooltipContent>Download file</TooltipContent>
           </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
} 
/* eslint-disable */
'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Music, Play, Pause, ExternalLink } from 'lucide-react'
import { useTheme } from 'next-themes'
import { usePlayer } from '@/context/PlayerContext'
import { useToast } from "@/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"


interface RecommendationCardProps {
  song: {
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
}

export function RecommendationCard({ song }: RecommendationCardProps) {
  const { theme } = useTheme()
  const { toast } = useToast()
  const { currentSong, isPlaying, togglePlay } = usePlayer()
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  
  // Check if this card is the one that's currently playing
  const isThisPlaying = isPlaying && currentSong?.id === song.id
  
  // Get card background gradient based on popularity
  const getCardBackground = () => {
    if (song.popularity > 90) return 'bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-blue-500/10 dark:from-blue-900/20 dark:via-indigo-800/15 dark:to-blue-800/20';
    if (song.popularity > 80) return 'bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-blue-500/10 dark:from-cyan-900/20 dark:via-sky-800/15 dark:to-blue-800/20';
    if (song.popularity > 70) return 'bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-orange-500/10 dark:from-yellow-900/20 dark:via-amber-800/15 dark:to-orange-800/20';
    return 'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10 dark:from-emerald-900/20 dark:via-teal-800/15 dark:to-cyan-800/20';
  };
  
  // Get popularity level class
  const getPopularityClass = () => {
    if (song.popularity > 90) return 'bg-blue-500';
    if (song.popularity > 80) return 'bg-cyan-500';
    if (song.popularity > 70) return 'bg-amber-500';
    return 'bg-teal-500';
  };

  // Format artist name for display
  const formatArtistName = () => {
    if (typeof song.artist === 'string') {
      return song.artist.replace(/^\['|'\]$|"|'/g, '').replace(/','|", "/g, ', ');
    } else if (Array.isArray(song.artist)) {
      return song.artist.join(', ');
    }
    return '';
  };
  
  // Get Spotify preview URL
  const getSpotifyPreviewUrl = () => {
    return `https://open.spotify.com/track/${song.spotify_id}`;
  };

  // Handle play/pause toggle
  const handlePlayToggle = () => {
    togglePlay(song);
  };
  
  // Handle download
  const handleDownload = async () => {
    if (!song.spotify_id) return;
    
    setIsDownloading(true);
    const { dismiss } = toast({
      title: "Starting download...",
      description: `Preparing to download ${song.title}.`,
    });
    
    try {
      const spotifyUrl = getSpotifyPreviewUrl(); // Get the spotify URL
      
      // Update fetch call for the new API endpoint and method
      const response = await fetch(`http://127.0.0.1:8000//api/songs/songs/download/`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: spotifyUrl, 
          format: "mp3" 
        }),
      });
      
      if (!response.ok) {
        // Try to get error message from response body
        let errorMsg = `Download failed: ${response.statusText || response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorData.error || errorMsg; // Use detailed error if available
        } catch (e) {
          // Ignore if response is not JSON
        }
        throw new Error(errorMsg);
      }
      
      // Assuming the API returns the file blob directly in the response body
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${song.title} - ${formatArtistName()}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a); // Clean up the anchor element

      // Dismiss the loading toast and show success
      dismiss();
      toast({
        title: "Download Complete!",
        description: `${song.title} has been downloaded.`,
      });

    } catch (error: unknown) {
      console.error('Download failed:', error);
      // Dismiss loading toast and show error
      dismiss();
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Could not download the song. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };
  
  // Open in Spotify
  const openInSpotify = () => {
    if (!song.spotify_id) return;
    window.open(getSpotifyPreviewUrl(), '_blank');
  };
  
  // Fetch album art
  useEffect(() => {
    const fetchAlbumArt = async () => {
      setIsLoading(true);
      setThumbnailUrl(null); // Reset thumbnail on new song
      
      try {
        // First try to get the artwork from Spotify
        if (song.spotify_id) {
          try {
            // Try direct URL format first (doesn't require auth)
            const spotifyImageUrl = `https://i.scdn.co/image/${song.spotify_id}`;
            const response = await fetch(spotifyImageUrl, { method: 'HEAD' });
            
            if (response.ok) {
              setThumbnailUrl(spotifyImageUrl);
              setIsLoading(false);
              return;
            }
          } catch (err) {
            // Silently fail and try next method
          }
        }
        
        // Fallback to iTunes search API
        const searchQuery = encodeURIComponent(`${song.title} ${formatArtistName()}`);
        const itunesResponse = await fetch(`https://itunes.apple.com/search?term=${searchQuery}&media=music&entity=song&limit=1`);
        const itunesData = await itunesResponse.json();
        
        if (itunesData.results && itunesData.results.length > 0) {
          const artworkUrl = itunesData.results[0].artworkUrl100.replace('100x100', '600x600');
          setThumbnailUrl(artworkUrl);
        } else {
          // Last resort fallback to the local placeholder
          setThumbnailUrl('/album-covers/MusicPlaceholder.png');
        }
      } catch (error) {
        console.error('Failed to fetch album art:', error);
        setThumbnailUrl('/album-covers/MusicPlaceholder.png'); // Use local placeholder on error
      }
      
      setIsLoading(false);
    };
    
    fetchAlbumArt();
  }, [song]);

  return (
    <Card className={`overflow-hidden h-full border-0 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm ${getCardBackground()} ${isThisPlaying ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent static-glow' : ''} dark:border dark:border-border/20 dark:shadow-blue-500/5`}>
      <div className="aspect-square relative">
        {/* Creative background pattern */}
        <div className="absolute inset-0 pattern-dots pattern-blue-500 pattern-bg-white pattern-size-4 pattern-opacity-10 dark:pattern-opacity-5"></div>
        
        {/* Thumbnail or placeholder */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-slate-900/30 dark:from-blue-500/20 dark:to-black/50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
               <div className="animate-pulse w-12 h-12 rounded-full bg-slate-200 dark:bg-white/20"></div>
             </div>
          ) : thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={song.title}
              fill
              className="object-cover opacity-90"
              onError={() => setThumbnailUrl('/assets/MusicPlaceholder.png')} // Fallback on image load error
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Music className="h-12 w-12 text-slate-400 dark:text-white/50" />
            </div>
          )}
        </div>
        
        {/* Popularity indicator with Tooltip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-2 right-2 flex items-center cursor-default">
                <div className={`h-1.5 w-1.5 rounded-full ${getPopularityClass()} mr-1.5 ${isThisPlaying ? 'animate-pulse' : ''}`}></div>
                <span className="text-xs font-medium text-white bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
                  {song.popularity}/100
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Popularity Score on Spotify</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* Spotify link */}
        {song.spotify_id && (
          <div className="absolute top-2 left-2">
            <Button 
              variant="ghost" 
              className="h-10 text-xs gap-2 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-blue-900/20 rounded-none border-r border-slate-100 dark:border-white/5"
              onClick={openInSpotify}
              disabled={!song.spotify_id}
            >
              <ExternalLink className="w-4 h-4" />
              Open in Spotify
            </Button>
          </div>
        )}
        
        {/* Play button overlay */}
        <button 
          className="absolute inset-0 flex items-center justify-center z-0 group"
          onClick={handlePlayToggle}
        >
          <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-800/60">
            {isThisPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white pl-1" />
            )}
          </div>
        </button>
      </div>
      
      <div className="p-4 text-slate-800 dark:text-white">
        <h3 className="font-bold text-sm truncate">{song.title}</h3>
        <p className="text-xs text-slate-600 dark:text-white/70 truncate mt-1">{formatArtistName()}</p>
        
        {/* Popularity bar */}
        <div className="flex items-center mt-3">
          <div className="flex-1 h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${getPopularityClass()}`}
              style={{ width: `${song.popularity}%` }}
            ></div>
          </div>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="border-t border-slate-100 dark:border-white/5 grid grid-cols-2">
        <Button 
          variant="ghost" 
          className="h-10 text-xs gap-2 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-blue-900/20 rounded-none border-r border-slate-100 dark:border-white/5"
          onClick={openInSpotify}
          disabled={!song.spotify_id}
        >
          <ExternalLink className="w-4 h-4" />
          Open in Spotify
        </Button>
        
        <Button 
          variant="ghost" 
          className="h-10 text-xs gap-2 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-blue-900/20 rounded-none"
          onClick={handleDownload}
          disabled={isDownloading || !song.spotify_id}
        >
          {isDownloading ? (
            <div className="animate-spin h-4 w-4 border-2 border-slate-500 dark:border-white border-t-transparent dark:border-t-transparent rounded-full"></div>
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isDownloading ? 'Downloading...' : 'Download'}
        </Button>
      </div>
    </Card>
  )
}
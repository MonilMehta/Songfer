'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink, Download, X } from 'lucide-react'
import { usePlayer } from '@/context/PlayerContext'
import { useTheme } from 'next-themes'

export function FloatingPlayerBar() {
  const { theme } = useTheme()
  const { currentSong, isPlaying, showPlayerBar, closePlayer } = usePlayer()
  const [isMounted, setIsMounted] = useState(false)
  const [embedLoaded, setEmbedLoaded] = useState(false)
  const [embedError, setEmbedError] = useState(false)
  const embedRef = useRef<HTMLIFrameElement>(null)
  
  // Open Spotify URL in new tab
  const openInSpotify = () => {
    if (currentSong?.spotify_id) {
      window.open(`https://open.spotify.com/track/${currentSong.spotify_id}`, '_blank');
    }
  };

  // Download handler
  const handleDownload = () => {
    console.log('Download requested for:', currentSong?.title);
    // Implement your download logic here
  };

  // Handle iframe load events
  const handleEmbedLoad = () => {
    setEmbedLoaded(true);
    setEmbedError(false);
  };

  const handleEmbedError = () => {
    setEmbedError(true);
    setEmbedLoaded(false);
  };
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Reset embed states when song changes
  useEffect(() => {
    if (currentSong) {
      setEmbedLoaded(false);
      setEmbedError(false);
    }
  }, [currentSong?.id]);
  
  if (!isMounted || !showPlayerBar || !currentSong) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 left-0 right-0 flex justify-center z-50">
      <div
        className="bg-black/80 backdrop-blur-md text-white transition-transform duration-300 shadow-lg max-w-2xl rounded-xl w-full mx-4"
        style={{
          transform: showPlayerBar ? 'translateY(0)' : 'translateY(100%)'
        }}
      >
        <div className="relative p-2">
          {/* Close button at top right */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1 right-1 w-6 h-6 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white z-10"
            onClick={closePlayer}
            title="Close player"
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center justify-between">
            {/* Spotify embed iframe */}
            <div className="flex-1 pr-16">
              {currentSong.spotify_id && !embedError && (
                <iframe
                  ref={embedRef}
                  src={`https://open.spotify.com/embed/track/${currentSong.spotify_id}?utm_source=generator&theme=${theme === 'dark' ? 'dark' : 'light'}&autoplay=${isPlaying ? '1' : '0'}`}
                  width="100%"
                  height="80"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="rounded-md"
                  onLoad={handleEmbedLoad}
                  onError={handleEmbedError}
                ></iframe>
              )}
            </div>
            
            {/* Side controls in column layout */}
            <div className="flex flex-col items-center gap-2 absolute right-8 top-1/2 transform -translate-y-1/2">
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 rounded-full p-0 text-white hover:bg-white/10"
                onClick={openInSpotify}
                title="Open in Spotify"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 rounded-full p-0 text-white hover:bg-white/10"
                onClick={handleDownload}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
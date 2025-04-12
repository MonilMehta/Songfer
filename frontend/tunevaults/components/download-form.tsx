import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SongPreview } from '@/components/song-preview'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Progress } from '@/components/ui/progress'

interface DownloadFormProps {
  onDownload: (url: string, format: string) => void
  isLoading?: boolean
  isPremium?: boolean
}

interface PreviewData {
  title: string
  artist: string
  thumbnail: string
  platform: 'youtube' | 'spotify'
  isPlaylist: boolean
  songCount?: number
  url: string
  id: string
}

export function DownloadForm({ onDownload, isLoading, isPremium = false }: DownloadFormProps) {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState('mp3')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [downloadedFile, setDownloadedFile] = useState<Blob | null>(null)
  const [filename, setFilename] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const { toast } = useToast()

  // Reset preview whenever URL changes
  useEffect(() => {
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
  }, [url])

  // Get auth token
  const getAuthToken = () => {
    return localStorage.getItem('token') || ''
  }

  const isYoutubePlaylist = (url: string) => {
    return url.includes('youtube.com') && url.includes('list=')
  }

  const isSpotifyPlaylist = (url: string) => {
    return url.includes('spotify.com/playlist/')
  }

  const extractVideoId = (url: string): { id: string, platform: 'youtube' | 'spotify', isPlaylist: boolean, playlistId?: string } | null => {
    // YouTube Single Video
    if (url.includes('youtube.com/watch') || url.includes('youtu.be')) {
      const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
      const isPlaylist = isYoutubePlaylist(url);
      let playlistId;
      
      if (isPlaylist) {
        const playlistMatch = url.match(/list=([^&]+)/);
        playlistId = playlistMatch?.[1];
      }
      
      return match?.[1] ? { id: match[1], platform: 'youtube', isPlaylist, playlistId } : null;
    }
    
    // YouTube Playlist Only
    if (url.includes('youtube.com/playlist')) {
      const playlistMatch = url.match(/list=([^&]+)/);
      return playlistMatch?.[1] ? { id: playlistMatch[1], platform: 'youtube', isPlaylist: true } : null;
    }
    
    // Spotify Track
    if (url.includes('spotify.com/track/')) {
      const match = url.match(/track\/([a-zA-Z0-9]+)/);
      return match?.[1] ? { id: match[1], platform: 'spotify', isPlaylist: false } : null;
    }
    
    // Spotify Playlist
    if (url.includes('spotify.com/playlist/')) {
      const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
      return match?.[1] ? { id: match[1], platform: 'spotify', isPlaylist: true } : null;
    }
    
    return null;
  }

  const fetchYouTubeData = async (videoId: string, isPlaylist: boolean, playlistId?: string) => {
    try {
      if (isPlaylist && playlistId) {
        // For YouTube playlists, fetch first video details
        const playlistResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${playlistId}&format=json`).catch(() => null);
        
        if (playlistResponse?.ok) {
          const data = await playlistResponse.json();
          return {
            title: data.title || 'YouTube Playlist',
            artist: data.author_name || 'Various Artists',
            thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, // Using first video thumbnail
            platform: 'youtube' as const,
            isPlaylist: true,
            songCount: 'Multiple', // We don't know exactly how many
            url,
            id: playlistId
          };
        }
        
        // Fallback for playlists
        return {
          title: 'YouTube Playlist',
          artist: 'Various Artists',
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          platform: 'youtube' as const,
          isPlaylist: true,
          songCount: 'Multiple',
          url,
          id: playlistId
        };
      } else {
        // Single video
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch video data');
        }
        
        const data = await response.json();
        
        return {
          title: data.title,
          artist: data.author_name,
          thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          platform: 'youtube' as const,
          isPlaylist: false,
          url,
          id: videoId
        };
      }
    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      // Fallback to basic info
      return {
        title: isPlaylist ? 'YouTube Playlist' : 'YouTube Video',
        artist: 'Unknown',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        platform: 'youtube' as const,
        isPlaylist,
        songCount: isPlaylist ? 'Multiple' : undefined,
        url,
        id: isPlaylist && playlistId ? playlistId : videoId
      };
    }
  }

  // Add function to fetch Spotify data
  const fetchSpotifyData = async (id: string, isPlaylist: boolean) => {
    try {
      // Placeholder for actual Spotify API integration
      // In a real implementation, you would call your backend to get Spotify data
      return {
        title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
        artist: isPlaylist ? 'Various Artists' : 'Spotify Artist',
        thumbnail: `/placeholder-spotify-${isPlaylist ? 'playlist' : 'track'}.jpg`,
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? 'Multiple' : undefined,
        url,
        id
      };
    } catch (error) {
      console.error('Error fetching Spotify data:', error);
      return {
        title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
        artist: 'Unknown',
        thumbnail: `/placeholder-spotify-${isPlaylist ? 'playlist' : 'track'}.jpg`,
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? 'Multiple' : undefined,
        url,
        id
      };
    }
  }

  const handlePreview = async () => {
    if (!url) return;
    
    setIsPreviewLoading(true);
    setPreview(null);
    setDownloadComplete(false);
    setDownloadedFile(null);
    
    try {
      const videoInfo = extractVideoId(url);
      
      if (!videoInfo) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid YouTube or Spotify URL",
          variant: "destructive"
        });
        setIsPreviewLoading(false);
        return;
      }
      
      if (videoInfo.platform === 'youtube') {
        const ytData = await fetchYouTubeData(videoInfo.id, videoInfo.isPlaylist, videoInfo.playlistId);
        const previewData: PreviewData = {
          title: ytData.title,
          artist: ytData.artist,
          thumbnail: ytData.thumbnail,
          platform: 'youtube',
          isPlaylist: ytData.isPlaylist,
          songCount: ytData.songCount ? Number(ytData.songCount) : undefined,
          url: url,
          id: ytData.id
        };
        setPreview(previewData);
      } else if (videoInfo.platform === 'spotify') {
        // Fetch Spotify data
        const spotifyData = await fetchSpotifyData(videoInfo.id, videoInfo.isPlaylist);
        setPreview({
          title: spotifyData.title,
          artist: spotifyData.artist,
          thumbnail: spotifyData.thumbnail,
          platform: 'spotify',
          isPlaylist: videoInfo.isPlaylist,
          songCount: videoInfo.isPlaylist ? 'Multiple' : undefined,
          url,
          id: videoInfo.id
        });
      }
      
      toast({
        title: "Ready to download",
        description: "Click the download button to start downloading",
      });
    } catch (error) {
      console.error('Error in preview:', error);
      toast({
        title: "Preview Failed",
        description: "Could not load preview for this URL",
        variant: "destructive"
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }

  const saveToDevice = () => {
    if (!downloadedFile || !filename) return;
    
    const url = window.URL.createObjectURL(downloadedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Download Complete",
      description: `${filename} has been saved to your device`,
    });
  }

  const handleDownloadMedia = async () => {
    if (!preview) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadComplete(false);
    setDownloadedFile(null);
    
    // Simulate progress
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + 5;
      });
    }, 200);
    
    try {
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('You must be logged in to download songs');
      }
      
      // Call backend API
      const response = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ 
          url: preview.url, 
          format 
        }),
      });
      
      clearInterval(interval);
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
      
      // Check if response is a file or JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('audio/')) {
        // It's an audio file
        const contentDisposition = response.headers.get('content-disposition');
        const filenameMatch = contentDisposition?.match(/filename="(.+?)"(?:;|$)/) || [];
        const songTitleHeader = response.headers.get('x-song-title');
        
        // Create a more user-friendly filename
        const defaultFilename = `${preview.title}.${format}`.replace(/[/\\?%*:|"<>]/g, '-');
        const outputFilename = filenameMatch[1] || songTitleHeader ? `${songTitleHeader}.${format}` : defaultFilename;
        
        setFilename(outputFilename);
        
        // Store the blob for later download
        const blob = await response.blob();
        setDownloadedFile(blob);
        
        // Set audio source for preview if it's not a playlist
        if (!preview.isPlaylist && audioRef.current) {
          const audioUrl = URL.createObjectURL(blob);
          audioRef.current.src = audioUrl;
        }
        
        setDownloadProgress(100);
        setDownloadComplete(true);
        
        toast({
          title: "Download Complete",
          description: "Click the download button to save to your device",
        });
        
        // Call the provided onDownload callback
        onDownload(url, format);
      } else {
        // Response is likely JSON for a scheduled download (playlist)
        const data = await response.json();
        console.log('Download scheduled:', data);
        
        setDownloadProgress(100);
        setDownloadComplete(true);
        
        toast({
          title: preview.isPlaylist ? "Playlist Download Started" : "Download Complete",
          description: preview.isPlaylist ? 
            "Your playlist is being processed. Check your downloads section later." : 
            "Your song has been added to your library",
        });
        
        // Call the provided onDownload callback
        onDownload(url, format);
      }
    } catch (error) {
      console.error('Download error:', error);
      clearInterval(interval);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "An error occurred while downloading",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  }

  const handleButtonClick = () => {
    if (preview) {
      if (downloadComplete && downloadedFile) {
        saveToDevice();
      } else {
        handleDownloadMedia();
      }
    } else {
      handlePreview();
    }
  }

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  }

  // Add function to render YouTube embed
  const renderYouTubeEmbed = (id: string, isPlaylist: boolean) => {
    if (isPlaylist) {
      return (
        <iframe 
          className="w-full aspect-video rounded-md"
          src={`https://www.youtube.com/embed/videoseries?list=${id}`}
          title="YouTube playlist player" 
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
      );
    } else {
      return (
        <iframe 
          className="w-full aspect-video rounded-md"
          src={`https://www.youtube.com/embed/${id}`}
          title="YouTube video player" 
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
      );
    }
  };

  // Add function to render Spotify embed
  const renderSpotifyEmbed = (id: string, isPlaylist: boolean) => {
    if (isPlaylist) {
      return (
        <iframe 
          className="w-full rounded-md"
          style={{ height: '380px' }}
          src={`https://open.spotify.com/embed/playlist/${id}`} 
          title="Spotify playlist player"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
      );
    } else {
      return (
        <iframe 
          className="w-full rounded-md" 
          style={{ height: '80px' }}
          src={`https://open.spotify.com/embed/track/${id}`} 
          title="Spotify track player"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
      );
    }
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="youtube" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="youtube" className="flex items-center space-x-2">
            <Youtube className="h-4 w-4" /> <span>YouTube</span>
          </TabsTrigger>
          <TabsTrigger value="spotify" className="flex items-center space-x-2">
            <Music className="h-4 w-4" /> <span>Spotify</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="youtube" className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPreviewLoading || isDownloading}
              className="flex-1"
            />
            <Button 
              onClick={handlePreview} 
              disabled={isPreviewLoading || !url}
              variant="outline"
            >
              {isPreviewLoading ? 'Loading...' : 'Preview'}
            </Button>
          </div>
          
          {preview && preview.platform === 'youtube' && (
            <div className="space-y-4">
              <div className="preview-container">
                {renderYouTubeEmbed(preview.id, preview.isPlaylist)}
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">{preview.title}</h3>
                <p className="text-sm text-muted-foreground">{preview.artist}</p>
                {preview.isPlaylist && <p className="text-sm text-muted-foreground">Type: Playlist</p>}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Format</label>
                  <select 
                    className="w-full p-2 rounded-md border border-input bg-background"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    disabled={isDownloading}
                  >
                    <option value="mp3">MP3</option>
                    <option value="aac">AAC</option>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                  </select>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                onClick={() => onDownload(url, format)}
                disabled={isLoading || isDownloading}
              >
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
              
              {isDownloading && (
                <div className="w-full rounded-full h-2 bg-secondary overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                </div>
              )}
              
              {isDownloading && (
                <p className="text-sm text-center text-muted-foreground">
                  {downloadProgress < 100 
                    ? `Downloading... ${downloadProgress}%` 
                    : 'Processing... Almost ready!'}
                </p>
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="spotify" className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Paste Spotify URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPreviewLoading || isDownloading}
              className="flex-1"
            />
            <Button 
              onClick={handlePreview} 
              disabled={isPreviewLoading || !url}
              variant="outline"
            >
              {isPreviewLoading ? 'Loading...' : 'Preview'}
            </Button>
          </div>
          
          {preview && preview.platform === 'spotify' && (
            <div className="space-y-4">
              <div className="preview-container">
                {renderSpotifyEmbed(preview.id, preview.isPlaylist)}
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">{preview.title}</h3>
                <p className="text-sm text-muted-foreground">{preview.artist}</p>
                {preview.isPlaylist && <p className="text-sm text-muted-foreground">Type: Playlist</p>}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Format</label>
                  <select 
                    className="w-full p-2 rounded-md border border-input bg-background"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    disabled={isDownloading}
                  >
                    <option value="mp3">MP3</option>
                    <option value="aac">AAC</option>
                    <option value="wav">WAV</option>
                    <option value="flac">FLAC</option>
                  </select>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                onClick={() => onDownload(url, format)}
                disabled={isLoading || isDownloading}
              >
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
              
              {isDownloading && (
                <div className="w-full rounded-full h-2 bg-secondary overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                </div>
              )}
              
              {isDownloading && (
                <p className="text-sm text-center text-muted-foreground">
                  {downloadProgress < 100 
                    ? `Downloading... ${downloadProgress}%` 
                    : 'Processing... Almost ready!'}
                </p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <audio ref={audioRef} hidden></audio>
    </div>
  )
} 
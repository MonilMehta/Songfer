import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SongPreview } from '@/components/song-preview'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

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
            url
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
          url
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
          url
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
        url
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
        setPreview(ytData);
      } else if (videoInfo.platform === 'spotify') {
        // For Spotify, we create placeholders based on track vs playlist
        setPreview({
          title: videoInfo.isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
          artist: videoInfo.isPlaylist ? 'Various Artists' : 'Spotify Artist',
          thumbnail: '/default-song-cover.jpg',
          platform: 'spotify',
          isPlaylist: videoInfo.isPlaylist,
          songCount: videoInfo.isPlaylist ? 'Multiple' : undefined,
          url
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

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {!isPremium && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-lg mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Upgrade to Premium</h3>
              <p className="text-muted-foreground mt-1">
                Get unlimited downloads and exclusive features
              </p>
            </div>
            <Button className="mt-4 md:mt-0" asChild>
              <Link href="/pricing">View Plans</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Input
          type="text"
          placeholder="Paste YouTube or Spotify URL here"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading || isPreviewLoading || isDownloading}
          className="w-full"
        />
        <Button
          onClick={handleButtonClick}
          disabled={isLoading || isPreviewLoading || isDownloading || !url}
          className="w-full"
        >
          {isDownloading ? `Downloading... ${downloadProgress}%` : 
            isLoading ? 'Processing...' : 
            isPreviewLoading ? 'Loading Preview...' : 
            preview ? (downloadComplete ? 'Save to Device' : 'Start Download') : 'Preview'}
        </Button>
      </div>

      <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
        <div className="flex items-center">
          <Youtube className="w-4 h-4 mr-1 text-red-500" />
          <span>YouTube</span>
        </div>
        <div className="flex items-center">
          <Music className="w-4 h-4 mr-1 text-green-500" />
          <span>Spotify</span>
        </div>
        <div className="flex items-center">
          <ListMusic className="w-4 h-4 mr-1 text-blue-500" />
          <span>Playlists</span>
        </div>
      </div>

      <Tabs value={format} onValueChange={setFormat} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mp3">MP3</TabsTrigger>
          <TabsTrigger value="aac">AAC</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} style={{ display: 'none' }} controls />

      {preview && (
        <SongPreview
          {...preview}
          onDownload={downloadComplete && downloadedFile ? saveToDevice : handleDownloadMedia}
          onPlay={playAudio}
          isLoading={isDownloading}
          downloadProgress={downloadProgress}
          downloadComplete={downloadComplete}
          canPlay={downloadComplete && downloadedFile !== null && !preview.isPlaylist}
        />
      )}
    </div>
  )
} 
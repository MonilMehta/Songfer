import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud, LinkIcon, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SongPreview } from '@/components/song-preview'
import { useToast } from '@/hooks/use-toast'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import React from 'react'

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

  useEffect(() => {
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setFilename('')
    if (audioRef.current) {
      audioRef.current.src = '';
    }
  }, [url])

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
    
    if (url.includes('youtube.com/playlist')) {
      const playlistMatch = url.match(/list=([^&]+)/);
      return playlistMatch?.[1] ? { id: playlistMatch[1], platform: 'youtube', isPlaylist: true } : null;
    }
    
    if (url.includes('spotify.com/track/')) {
      const match = url.match(/track\/([a-zA-Z0-9]+)/);
      return match?.[1] ? { id: match[1], platform: 'spotify', isPlaylist: false } : null;
    }
    
    if (url.includes('spotify.com/playlist/')) {
      const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
      return match?.[1] ? { id: match[1], platform: 'spotify', isPlaylist: true } : null;
    }
    
    return null;
  }

  const fetchYouTubeData = async (videoId: string, isPlaylist: boolean, playlistId?: string) => {
    try {
      if (isPlaylist && playlistId) {
        let firstVideoId = videoId;
        try {
          const playlistItemsResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`);
          if (playlistItemsResponse.ok) {
             const playlistData = await playlistItemsResponse.json();
             const thumbnailUrl = playlistData.thumbnail_url;
             if (thumbnailUrl && typeof thumbnailUrl === 'string') {
               const videoIdMatch = thumbnailUrl.match(/vi\/([a-zA-Z0-9_-]{11})\//);
               if (videoIdMatch && videoIdMatch[1]) {
                 firstVideoId = videoIdMatch[1];
               }
             }
          }
        } catch (itemError) {
            console.warn("Could not fetch first video details for playlist thumbnail, using fallback.", itemError);
        }

        const playlistResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`).catch(() => null);

        if (playlistResponse?.ok) {
          const data = await playlistResponse.json();
          return {
            title: data.title || 'YouTube Playlist',
            artist: data.author_name || 'Various Artists',
            thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`,
            platform: 'youtube' as const,
            isPlaylist: true,
            songCount: data.videos || 'Multiple',
            url,
            id: playlistId
          };
        }
        
        return {
          title: 'YouTube Playlist',
          artist: 'Various Artists',
          thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`,
          platform: 'youtube' as const,
          isPlaylist: true,
          songCount: 'Multiple',
          url,
          id: playlistId
        };
      } else {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch video data');
        }

        const data = await response.json();

        let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
            const imgResponse = await fetch(thumbnailUrl, { method: 'HEAD' });
            if (!imgResponse.ok) {
                 thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        } catch (imgError) {
             thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }

        return {
          title: data.title,
          artist: data.author_name,
          thumbnail: thumbnailUrl,
          platform: 'youtube' as const,
          isPlaylist: false,
          url,
          id: videoId
        };
      }
    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      return {
        title: isPlaylist ? 'YouTube Playlist' : 'YouTube Video',
        artist: 'Unknown',
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        platform: 'youtube' as const,
        isPlaylist,
        songCount: isPlaylist ? 'Multiple' : undefined,
        url,
        id: isPlaylist && playlistId ? playlistId : videoId
      };
    }
  }

  const fetchSpotifyData = async (id: string, isPlaylist: boolean) => {
    try {
      const token = getAuthToken();
      const endpoint = isPlaylist ? 'playlist-details' : 'track-details';
      const response = await fetch(`http://localhost:8000/api/songs/spotify/${endpoint}/${id}/`, {
           headers: {
              'Authorization': `Token ${token}`,
           }
      });

      if (!response.ok) {
          throw new Error(`Failed to fetch Spotify data: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        title: data.name || (isPlaylist ? 'Spotify Playlist' : 'Spotify Track'),
        artist: isPlaylist ? data.owner?.display_name || 'Various Artists' : data.artists?.map((a: { name: string }) => a.name).join(', ') || 'Spotify Artist',
        thumbnail: isPlaylist ? data.images?.[0]?.url : data.album?.images?.[0]?.url || '/default-song-cover.jpg',
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? data.tracks?.total : undefined,
        url,
        id
      };
    } catch (error) {
      console.error('Error fetching Spotify data:', error);
      return {
        title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
        artist: 'Unknown',
        thumbnail: '/default-song-cover.jpg',
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? 'Multiple' : undefined,
        url,
        id
      };
    }
  }

  const handlePreview = async () => {
    if (!url || isPreviewLoading || isDownloading) return;

    setIsPreviewLoading(true);
    setPreview(null);
    setDownloadProgress(0);
    setIsDownloading(false);
    setDownloadComplete(false);
    setDownloadedFile(null);
    setFilename('');
     if (audioRef.current) {
      audioRef.current.src = '';
    }

    try {
      const videoInfo = extractVideoId(url);

      if (!videoInfo) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid YouTube or Spotify URL.",
          variant: "destructive"
        });
        setIsPreviewLoading(false);
        return;
      }

      let data;
      if (videoInfo.platform === 'youtube') {
        data = await fetchYouTubeData(videoInfo.id, videoInfo.isPlaylist, videoInfo.playlistId);
      } else {
        data = await fetchSpotifyData(videoInfo.id, videoInfo.isPlaylist);
      }

      if (data) {
         const songCount = typeof data.songCount === 'number' ? data.songCount : (typeof data.songCount === 'string' && data.songCount !== 'Multiple' ? parseInt(data.songCount, 10) : undefined);
          const previewData: PreviewData = {
            title: data.title,
            artist: data.artist,
            thumbnail: data.thumbnail,
            platform: videoInfo.platform,
            isPlaylist: data.isPlaylist,
            songCount: songCount && !isNaN(songCount) ? songCount : undefined,
            url: url,
            id: data.id
        };
        setPreview(previewData);
         toast({
            title: "Preview Loaded",
            description: "Check the details and choose a format.",
         });
      } else {
          throw new Error("Failed to fetch preview data.");
      }

    } catch (error) {
      console.error('Error in handlePreview:', error);
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Could not load preview for this URL.",
        variant: "destructive"
      });
       setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  const saveToDevice = () => {
    if (!downloadedFile || !filename || !(downloadedFile instanceof Blob)) {
        console.error('Attempted to save file, but downloadedFile is invalid or missing.', { downloadedFile, filename });
        toast({ title: "Save Error", description: "Could not save file. Please try downloading again.", variant: "destructive" });
        setDownloadComplete(false);
        setDownloadedFile(null);
        setFilename('');
        setDownloadProgress(0);
        setIsDownloading(false); 
        return;
    }

    const blobUrl = window.URL.createObjectURL(downloadedFile);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);

    toast({
      title: "File Saved",
      description: `${filename} has been saved to your device.`,
    });
  }

  const handleDownloadMedia = async () => {
    if (!preview || isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadComplete(false);
    setDownloadedFile(null);

    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + Math.floor(Math.random() * 5) + 1;
      });
    }, 300);

    let localDownloadComplete = false;

    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error('Authentication required to download.');
      }

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
        let errorMessage = `Download failed: ${response.status}`;
        try {
             const errorData = await response.json();
             errorMessage = errorData.message || errorData.detail || errorMessage;
        } catch (e) {
             errorMessage = `Download failed: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');

      if (contentType && (contentType.includes('audio/') || contentType.includes('application/zip'))) {
        const contentDisposition = response.headers.get('content-disposition');
        const filenameMatch = contentDisposition?.match(/filename\*?=['"]?([^'";]+)['"]?/);

        let outputFilename = "download";
        if (filenameMatch && filenameMatch[1]) {
             try {
                  outputFilename = decodeURIComponent(filenameMatch[1]);
             } catch (e) {
                 outputFilename = filenameMatch[1];
             }
        } else {
             const safeTitle = preview.title.replace(/[/\\?%*:|"<>]/g, '-');
            outputFilename = `${safeTitle}.${preview.isPlaylist ? 'zip' : format}`;
        }

        setFilename(outputFilename);
        const blob = await response.blob();
        
        setDownloadedFile(blob); 

        if (!preview.isPlaylist && audioRef.current && contentType.includes('audio/')) {
          try {
            const audioUrl = URL.createObjectURL(blob);
             if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
                 URL.revokeObjectURL(audioRef.current.src);
             }
            audioRef.current.src = audioUrl;
          } catch (audioError){
               console.error("Error creating audio object URL:", audioError);
          }
        }

        setDownloadProgress(100);
        setDownloadComplete(true);
        localDownloadComplete = true;

        toast({
          title: preview.isPlaylist ? "Playlist Ready" : "Download Ready",
          description: `Click "Save" to get your ${preview.isPlaylist ? 'zip file' : 'song'}.`,
        });

        setTimeout(() => {
          saveToDevice();
        }, 500);

        onDownload(preview.url, format);

      } else {
         try {
            const data = await response.json();
            console.log('Download response (JSON):', data);
            setDownloadProgress(100);
            setDownloadComplete(true);
            localDownloadComplete = true;

            toast({
                title: data.message || "Processing Started",
                description: data.detail || "Your download is being processed and will be available later.",
            });
             onDownload(preview.url, format);
        } catch(jsonError) {
             console.error("Error parsing JSON response or unexpected content type:", jsonError, contentType);
             throw new Error("Received an unexpected response from the server.");
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      clearInterval(interval);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive"
      });
      setDownloadProgress(0);
      setDownloadComplete(false);
      setDownloadedFile(null);
    } finally {
       if (!localDownloadComplete) {
         setIsDownloading(false);
       } else {
           setIsDownloading(false); 
       }
    }
  }

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio play error:", e));
    }
  }

  const renderYouTubeEmbed = (id: string, isPlaylist: boolean) => {
    if (isPlaylist) {
      return (
        <iframe
          key={`youtube-playlist-${id}`}
          className="w-full aspect-video rounded-md shadow-md"
          src={`https://www.youtube.com/embed/videoseries?list=${id}`}
          title="YouTube playlist player"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          style={{ minHeight: '200px', maxHeight: '300px' }}
        ></iframe>
      );
    } else {
      return (
        <iframe
          key={`youtube-video-${id}`}
          className="w-full aspect-video rounded-md shadow-md"
          src={`https://www.youtube.com/embed/${id}`}
          title="YouTube video player"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
           style={{ minHeight: '200px', maxHeight: '300px' }}
        ></iframe>
      );
    }
  };

  const renderSpotifyEmbed = (id: string, isPlaylist: boolean) => {
    const embedType = isPlaylist ? 'playlist' : 'track';
    const height = isPlaylist ? '380px' : '80px';

    return (
      <iframe
        key={`spotify-${embedType}-${id}`}
        className="w-full rounded-md shadow-md"
        style={{ height: height, minHeight: '80px' }}
        src={`https://open.spotify.com/embed/${embedType}/${id}`}
        title={`Spotify ${embedType} player`}
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      ></iframe>
    );
  };

  const formatSelectorElement = (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Format:</Label>
        <ToggleGroup
          type="single"
          value={format}
          onValueChange={(value) => { if (value) { setFormat(value); } }}
          className="flex flex-wrap gap-2"
          disabled={isDownloading || downloadComplete}
        >
          <ToggleGroupItem value="mp3" aria-label="Select MP3 format">MP3</ToggleGroupItem>
          <ToggleGroupItem value="aac" aria-label="Select AAC format">AAC</ToggleGroupItem>
          <ToggleGroupItem value="flac" aria-label="Select FLAC format">FLAC</ToggleGroupItem>
          <ToggleGroupItem value="wav" aria-label="Select WAV format">WAV</ToggleGroupItem>
        </ToggleGroup>
      </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-center">
        <LinkIcon className="h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Paste YouTube or Spotify URL here..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isPreviewLoading || isDownloading}
          className="flex-1"
        />
        <Button
          onClick={handlePreview}
          disabled={isPreviewLoading || isDownloading || !url}
          aria-label="Load Preview"
        >
          {isPreviewLoading ? (
             <>
              <span className="animate-spin mr-2">⏳</span> Loading...
             </>
          ) : (
             <>
               <Search className="h-4 w-4 mr-2" /> Preview
             </>
          )}
        </Button>
      </div>

      {preview && (
        <div className="mt-6 animate-fade-in">
             <SongPreview
                title={preview.title}
                artist={preview.artist}
                thumbnail={preview.thumbnail}
                platform={preview.platform}
                isPlaylist={preview.isPlaylist}
                songCount={preview.songCount}
                onDownload={handleDownloadMedia}
                isLoading={isDownloading}
                downloadProgress={downloadProgress}
                downloadComplete={downloadComplete}
                canPlay={downloadComplete && !!downloadedFile && !preview.isPlaylist}
                onPlay={playAudio}
                url={preview.url}
                embedPlayer={preview.platform === 'youtube'
                    ? renderYouTubeEmbed(preview.id, preview.isPlaylist)
                    : renderSpotifyEmbed(preview.id, preview.isPlaylist)}
                formatSelector={formatSelectorElement}
              />
        </div>
      )}

      <audio ref={audioRef} controls className="w-full mt-4 hidden" />
    </div>
  )
} 
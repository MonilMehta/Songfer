import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud, LinkIcon, Search, Save } from 'lucide-react'
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
  const hasSavedRef = useRef(false)

  useEffect(() => {
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setFilename('')
    hasSavedRef.current = false
    if (audioRef.current) {
      audioRef.current.src = '';
      audioRef.current.removeAttribute('src');
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
    try {
        const cleanedUrl = new URL(url);
        const pathSegments = cleanedUrl.pathname.split('/').filter(Boolean);

        if ((cleanedUrl.hostname.includes('youtube.com') && cleanedUrl.searchParams.has('v')) || cleanedUrl.hostname.includes('youtu.be')) {
            const videoId = cleanedUrl.hostname.includes('youtu.be') ? pathSegments[0] : cleanedUrl.searchParams.get('v');
            if (!videoId || videoId.length !== 11) return null;
            const isPlaylist = cleanedUrl.searchParams.has('list');
            const playlistId = isPlaylist ? cleanedUrl.searchParams.get('list') || undefined : undefined;
            return { id: videoId, platform: 'youtube', isPlaylist, playlistId };
        }

        if (cleanedUrl.hostname.includes('youtube.com') && (cleanedUrl.searchParams.has('list') || pathSegments[0] === 'playlist')) {
             const playlistId = cleanedUrl.searchParams.get('list') || (pathSegments[0] === 'playlist' ? pathSegments[1] : undefined);
            if (!playlistId) return null;
            return { id: playlistId, platform: 'youtube', isPlaylist: true };
        }

        // More robust Spotify track ID extraction
        if (cleanedUrl.hostname.includes('spotify.com') && pathSegments[0] === 'track') {
            let trackId = pathSegments[1];
            // Some Spotify URLs have shortened IDs, extract them properly
            if (trackId) {
                // Remove any query parameters that might be in the ID
                trackId = trackId.split('?')[0];
                console.log('Extracted Spotify track ID:', trackId);
                return { id: trackId, platform: 'spotify', isPlaylist: false };
            }
            return null;
        }

        if (cleanedUrl.hostname.includes('spotify.com') && pathSegments[0] === 'playlist' && pathSegments[1]) {
            let playlistId = pathSegments[1];
            // Some Spotify URLs have shortened IDs, extract them properly
            if (playlistId) {
                // Remove any query parameters that might be in the ID
                playlistId = playlistId.split('?')[0];
                console.log('Extracted Spotify playlist ID:', playlistId);
                return { id: playlistId, platform: 'spotify', isPlaylist: true };
            }
            return null;
        }

    } catch (e) {
        console.error("Error parsing URL:", e);
        return null;
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
        
        // Just clean up the title without trying to extract artist information
        let videoTitle = data.title || 'YouTube Video';
        videoTitle = videoTitle
          .replace(/\(Official Music Video\)/gi, '')
          .replace(/\(Official Video\)/gi, '')
          .replace(/\(Lyrics\)/gi, '')
          .replace(/\(Lyric Video\)/gi, '')
          .replace(/\(Audio\)/gi, '')
          .replace(/\(Official Audio\)/gi, '')
          .replace(/\[\s*HD\s*\]/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
            const imgResponse = await fetch(thumbnailUrl, { method: 'HEAD' });
            if (!imgResponse.ok) {
                 thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            }
        } catch (imgError) {
             thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }

        // Clean up artist name - remove VEVO, Official, Topic, etc.
        let artistName = data.author_name || 'Unknown Artist';
        artistName = artistName
          .replace(/VEVO$/i, '')
          .replace(/Official$/i, '')
          .replace(/Topic$/i, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        return {
          title: videoTitle,
          artist: artistName,
          thumbnail: thumbnailUrl,
          platform: 'youtube' as const,
          isPlaylist: false,
          url,
          id: videoId
        };
      }
    } catch (error) {
      console.error('Error fetching YouTube data:', error);
      throw error;
    }
  }

  const fetchSpotifyData = async (id: string, isPlaylist: boolean, url: string) => {
    try {
      const token = getAuthToken();
      if (!token) {
        console.warn("Authentication token missing for Spotify data fetch");
        return {
          title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
          artist: '💿',
          thumbnail: '/default-song-cover.jpg',
          platform: 'spotify' as const,
          isPlaylist,
          songCount: isPlaylist ? undefined : undefined,
          url,
          id
        };
      }

      const endpoint = isPlaylist ? 'playlists' : 'tracks';
      
      const fetchUrl = `http://localhost:8000/api/songs/spotify/${endpoint}/${id}/`;
      
      console.log(`Fetching Spotify data from: ${fetchUrl}`);

      const response = await fetch(fetchUrl, {
           headers: {
              'Authorization': `Token ${token}`,
           }
      }).catch(error => {
        console.error("Network error fetching Spotify data:", error);
        return null; // Return null on network error to handle below
      });

      if (!response || !response.ok) {
          console.log(`First Spotify URL failed, trying alternate URL format...`);
          
          const altUrl = `http://localhost:8000/api/songs/spotify-${isPlaylist ? 'playlist' : 'track'}/${id}/`;
          
          console.log(`Trying alternate URL: ${altUrl}`);
          const altResponse = await fetch(altUrl, {
            headers: {
                'Authorization': `Token ${token}`,
            }
          }).catch(error => {
            console.error("Network error fetching Spotify data (alt URL):", error);
            return null;
          });
          
          if (!altResponse || !altResponse.ok) {
              const thirdUrl = `http://localhost:8000/api/spotify/${endpoint}/${id}/`;
              console.log(`Trying third URL format: ${thirdUrl}`);
              
              const thirdResponse = await fetch(thirdUrl, {
                headers: {
                  'Authorization': `Token ${token}`,
                }
              }).catch(error => {
                console.error("Network error fetching Spotify data (third URL):", error);
                return null;
              });
              
              if (!thirdResponse || !thirdResponse.ok) {
                // If all three attempts fail, return a placeholder
                console.warn("All Spotify API endpoints failed, using fallback data");
                return {
                  title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
                  artist: '💿',
                  thumbnail: '/default-song-cover.jpg',
                  platform: 'spotify' as const,
                  isPlaylist,
                  songCount: isPlaylist ? undefined : undefined,
                  url,
                  id
                };
              }
              
              const data = await thirdResponse.json();
              return processSpotifyData(data, isPlaylist, id, url);
          }
          
          const data = await altResponse.json();
          return processSpotifyData(data, isPlaylist, id, url);
      }

      const data = await response.json();
      return processSpotifyData(data, isPlaylist, id, url);
    } catch (error) {
      console.error('Error in fetchSpotifyData:', error);
      
      return {
        title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
        artist: '💿',
        thumbnail: '/default-song-cover.jpg',
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? undefined : undefined,
        url,
        id
      };
    }
  }

  const processSpotifyData = (data: any, isPlaylist: boolean, id: string, url: string) => {
      // For tracks, look for specific track properties based on Spotify API response
      if (!isPlaylist && data) {
        // Get proper song title
        let title = data.name;
        
        // Get all artists if available
        let artist = '';
        if (data.artists && Array.isArray(data.artists) && data.artists.length > 0) {
          artist = data.artists.map((a: any) => a.name).join(', ');
        } else if (data.artist && data.artist.name) {
          // Some endpoints return artist in a different format
          artist = data.artist.name;
        }
        
        // Get album info if available
        let albumName = '';
        if (data.album && data.album.name) {
          albumName = data.album.name;
        }
        
        // For song titles that are just generic names like "Track" or numbers, 
        // enhance with album name if available
        if (title && (title.length < 3 || /^track\s*\d*$/i.test(title)) && albumName) {
          title = `${title} (${albumName})`;
        }
        
        console.log('Processed Spotify track data:', { title, artist, id });
        
        return {
          title: title || 'Spotify Track',
          artist: artist || '💿',
          thumbnail: data.album?.images?.[0]?.url || '/default-song-cover.jpg',
          platform: 'spotify' as const,
          isPlaylist,
          songCount: undefined,
          url,
          id: data.id || id
        };
      }
      
      // Handle playlists
      if (isPlaylist && data) {
        return {
          title: data.name || 'Spotify Playlist',
          artist: data.owner?.display_name || 'Various Artists',
          thumbnail: data.images?.[0]?.url || '/default-song-cover.jpg',
          platform: 'spotify' as const,
          isPlaylist,
          songCount: data.tracks?.total,
          url,
          id: data.id || id
        };
      }
      
      // Fallback for invalid or incomplete data
      return {
        title: data?.name || (isPlaylist ? 'Spotify Playlist' : 'Spotify Track'),
        artist: isPlaylist ? (data?.owner?.display_name || 'Various Artists') : 
                          (data?.artists?.map((a: { name: string }) => a.name).join(', ') || '💿'),
        thumbnail: isPlaylist ? (data?.images?.[0]?.url || '/default-song-cover.jpg') : 
                             (data?.album?.images?.[0]?.url || '/default-song-cover.jpg'),
        platform: 'spotify' as const,
        isPlaylist,
        songCount: isPlaylist ? data?.tracks?.total : undefined,
        url,
        id: data?.id || id
      };
  }

  const clearAudioSource = () => {
    if (audioRef.current) {
      if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      audioRef.current.src = '';
      audioRef.current.removeAttribute('src');
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
    hasSavedRef.current = false;
    
    clearAudioSource();

    try {
      const videoInfo = extractVideoId(url);
      console.log("Extracted Video Info:", videoInfo);

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
        data = await fetchSpotifyData(videoInfo.id, videoInfo.isPlaylist, url);
      }

      if (!data) {
          throw new Error("Failed to fetch preview data");
      }

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
    // If no file to save, show an error
    if (!downloadedFile || !filename || !(downloadedFile instanceof Blob)) {
        console.error('Attempted to save file, but downloadedFile is invalid or missing.', { 
            downloadedFile: typeof downloadedFile, 
            hasFile: !!downloadedFile,
            filename 
        });
        toast({ 
            title: "Save Error", 
            description: "Could not save file. Please try downloading again.", 
            variant: "destructive" 
        });
        return;
    }

    console.log(`Saving file: ${filename} (${downloadedFile.size} bytes)`);
    
    try {
        // Create a blob URL from the downloaded file
        const blobUrl = window.URL.createObjectURL(downloadedFile);
        
        // Set up download element
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        // Trigger download
        a.click();
        
        // Clean up resources after download starts
        setTimeout(() => {
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        }, 100);
        
        toast({
            title: "File Saved",
            description: `${filename} has been saved to your device.`,
        });
    } catch (e) {
        console.error("Error initiating file download:", e);
        toast({ 
            title: "Save Error", 
            description: "Failed to trigger download. Please try again.", 
            variant: "destructive" 
        });
    }
    
    // We deliberately don't reset downloadedFile or downloadComplete state 
    // so the user can save the same file multiple times without re-downloading
  }

  const handleDownloadMedia = async () => {
    if (preview && downloadComplete && downloadedFile && filename) {
        console.log("File already downloaded. Saving existing file...");
        saveToDevice();
        return;
    }

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

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required to download.');

      const response = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url: preview.url, format }),
      });

      clearInterval(interval);

      if (!response.ok) {
        // Check for rate limit (429) error specifically
        if (response.status === 429) {
          throw new Error('You have hit the daily limit!! Please try again tomorrow.');
        }

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
        
        // Get metadata from response headers
        const songTitle = response.headers.get('x-song-title');
        const songArtist = response.headers.get('x-song-artist');
        const songAlbum = response.headers.get('x-album-name');
        const songDuration = response.headers.get('x-duration');
        
        console.log('Metadata from headers:', { songTitle, songArtist, songAlbum, songDuration });
        
        if (filenameMatch && filenameMatch[1]) {
          try { 
            outputFilename = decodeURIComponent(filenameMatch[1]); 
          } catch (e) { 
            outputFilename = filenameMatch[1]; 
          }
          
          // Clean up filename for better readability even if server provided one
          outputFilename = cleanupFilename(outputFilename, preview);
        } else {
          // Create our own filename if server didn't provide one
          outputFilename = generateFilename(preview, format);
        }
        
        // Use metadata from headers if available (this is the most reliable source)
        if (songTitle && songArtist) {
          console.log(`Using metadata from headers: Title=${songTitle}, Artist=${songArtist}`);
          // Clean up the metadata (removes "Official Music Video" etc)
          const cleanTitle = songTitle
            .replace(/\(Official Music Video\)/gi, '')
            .replace(/\(Official Video\)/gi, '')
            .replace(/\(Lyrics\)/gi, '')
            .replace(/\(Lyric Video\)/gi, '')
            .replace(/\(Audio\)/gi, '')
            .replace(/\(Official Audio\)/gi, '')
            .replace(/\[\s*HD\s*\]/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
          
          // Create a proper filename with artist and title
          outputFilename = `${songArtist} - ${cleanTitle}.${preview.isPlaylist ? 'zip' : format}`;
          // Clean up any invalid characters
          outputFilename = outputFilename.replace(/[/\\?%*:|"<>]/g, '-');
        }

        setFilename(outputFilename);
        const blob = await response.blob();
        console.log(`Blob received (${blob.size} bytes), setting filename: ${outputFilename}`);
        setDownloadedFile(blob);

        if (!preview.isPlaylist && audioRef.current && contentType.includes('audio/')) {
          try {
            const audioUrl = URL.createObjectURL(blob);
            // Clean up existing audio URL properly using our dedicated function
            clearAudioSource();
            // Set the new blob URL
            audioRef.current.src = audioUrl;
          } catch (audioError) { 
            console.error("Error creating audio object URL:", audioError); 
            clearAudioSource(); // Ensure audio is cleared if there's an error
          }
        }

        setDownloadProgress(100);
        setDownloadComplete(true);

        toast({ 
            title: "Download Complete", 
            description: "Click the Save button to save the file to your device." 
        });

        onDownload(preview.url, format);
      } else {
         try {
            const data = await response.json();
            console.log('Download response (JSON):', data);
            setDownloadProgress(100);
            setDownloadComplete(true);
            toast({ 
                title: data.message || "Processing Started", 
                description: data.detail || "Download is processing." 
            });
            onDownload(preview.url, format);
        } catch(jsonError) {
             console.error("Error processing non-file download response:", jsonError, contentType);
             throw new Error("Received an unexpected response from the server.");
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      clearInterval(interval);
      toast({ 
          title: "Download Failed", 
          description: error instanceof Error ? error.message : "An error occurred.", 
          variant: "destructive" 
      });
      setDownloadProgress(0);
      setDownloadComplete(false);
      setDownloadedFile(null); 
    } finally {
      setIsDownloading(false);
    }
  }

  const handleActionButtonClick = () => {
    // If we already have the file downloaded, just save it (no backend call)
    if (downloadComplete && downloadedFile) {
      console.log('Using existing downloaded file - no need to make another backend request');
      saveToDevice();
    } else {
      // Otherwise initiate a new download from the backend
      handleDownloadMedia();
    }
  };

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
          disabled={isDownloading}
        >
          <ToggleGroupItem value="mp3" aria-label="Select MP3 format">MP3</ToggleGroupItem>
          <ToggleGroupItem value="aac" aria-label="Select AAC format">AAC</ToggleGroupItem>
          <ToggleGroupItem value="flac" aria-label="Select FLAC format">FLAC</ToggleGroupItem>
          <ToggleGroupItem value="wav" aria-label="Select WAV format">WAV</ToggleGroupItem>
        </ToggleGroup>
      </div>
  );

  // Add helper functions for filename formatting
  const cleanupFilename = (filename: string, preview: PreviewData): string => {
    // If it's a YouTube video, remove common unnecessary text patterns
    if (preview.platform === 'youtube' && !preview.isPlaylist) {
      filename = filename
        .replace(/\(Official Music Video\)/gi, '')
        .replace(/\(Official Video\)/gi, '')
        .replace(/\(Lyrics\)/gi, '')
        .replace(/\(Lyric Video\)/gi, '')
        .replace(/\(Audio\)/gi, '')
        .replace(/\(Official Audio\)/gi, '')
        .replace(/\[\s*HD\s*\]/gi, '')
        .replace(/\s{2,}/g, ' ') // Remove extra spaces
        .trim();
    }
    
    return filename;
  }

  const generateFilename = (preview: PreviewData, format: string): string => {
    const extension = preview.isPlaylist ? 'zip' : format;
    
    // Start with the title, clean it up first
    let title = preview.title
      .replace(/\(Official Music Video\)/gi, '')
      .replace(/\(Official Video\)/gi, '')
      .replace(/\(Lyrics\)/gi, '')
      .replace(/\(Lyric Video\)/gi, '')
      .replace(/\(Audio\)/gi, '')
      .replace(/\(Official Audio\)/gi, '')
      .replace(/\[\s*HD\s*\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    // Use generic names for missing data instead of platform + ID
    if (preview.platform === 'spotify' && 
       (title === 'Spotify Track' || title === 'Spotify Playlist')) {
      title = preview.isPlaylist ? 'Playlist' : 'Track';
    }
    
    // Add artist if available (except for playlists)
    let filename = title;
    if (preview.artist && preview.artist !== '💿' && !preview.isPlaylist) {
      filename = `${preview.artist} - ${title}`;
    }
    
    // Clean up any invalid characters
    filename = filename.replace(/[/\\?%*:|"<>]/g, '-');
    
    return `${filename}.${extension}`;
  }

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
                onDownload={handleActionButtonClick}
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
                downloadedFile={downloadedFile} 
              />
              
          
        </div>
      )}

      {/* Hidden Audio Player - now with proper empty source handling */}
      <audio 
        ref={audioRef} 
        controls 
        className="w-full mt-4 hidden" 
        preload="none" 
      />{/* preload="none" prevents automatic loading until explicitly set */}
    </div>
  )
} 
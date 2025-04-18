import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud, LinkIcon, Search, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SongPreview } from '@/components/song-preview'
import { useToast } from '@/hooks/use-toast'
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Label } from "@/components/ui/label"
import React from 'react'
import * as musicMetadata from 'music-metadata-browser'
import { 
  MediaPreviewData, 
  extractVideoId, 
  fetchYouTubeData, 
  fetchSpotifyData,
  generateFilename,
  cleanupFilename,
  getPlaylistDownloadEndpoint,
  extractMetadataFromHeaders,
  PlaylistDownloadResponse
} from '@/utils/media-data-fetcher'

interface DownloadFormProps {
  onDownload: (url: string, format: string) => void
  isLoading?: boolean
  isPremium?: boolean
}

// Create an interface for ID3 tag metadata
interface ID3Metadata {
  title?: string
  artist?: string
  album?: string
  year?: string
  picture?: { format: string, data: Uint8Array }[]
}
/**
 * Thoroughly cleans YouTube song titles by:
 * 1. Removing duplicate artist names
 * 2. Removing promotional text in parentheses and brackets
 * 3. Removing common YouTube suffixes
 * 
 * For example: "Mobb Deep - Mobb Deep - Shook Ones, Pt. II (Official HD Video)"
 * becomes: "Mobb Deep - Shook Ones, Pt. II"
 * 
 * @param {string} title - The original YouTube title
 * @param {string} artist - The artist name
 * @return {string} - Cleaned title
 */
const cleanYouTubeTitle = (title, artist) => {
  if (!title || !artist) return title;
  
  let cleanedTitle = title;
  
  // Step 1: Remove duplicate artist pattern at the beginning
  // Check if the title starts with the artist name followed by " - " + artist name again
  const doubleArtistPattern = new RegExp(`^${artist}\\s*-\\s*${artist}\\s*-`);
  if (doubleArtistPattern.test(cleanedTitle)) {
    // Replace the duplicate pattern with just the artist name once
    cleanedTitle = cleanedTitle.replace(doubleArtistPattern, `${artist} -`);
  }
  
  // Handle case where title is just "Artist - Artist - Title"
  const duplicateArtistPattern = /^([^-]+)\s*-\s*\1\s*-/;
  const match = cleanedTitle.match(duplicateArtistPattern);
  if (match) {
    const repeatedPart = match[1].trim();
    cleanedTitle = cleanedTitle.replace(duplicateArtistPattern, `${repeatedPart} -`);
  }
  
  // Step 2: Remove common promotional suffixes in parentheses and brackets
  const suffixPatterns = [
    /\s*\(Official\s*(?:Music\s*)?Video\s*\)/gi, // (Official Video), (Official Music Video)
    /\s*\[Official\s*(?:Music\s*)?Video\s*\]/gi, // [Official Video], [Official Music Video]
    /\s*\(Official\s*(?:HD\s*)?(?:Audio|Lyric)\s*\)/gi, // (Official Audio), (Official HD Audio)
    /\s*\[Official\s*(?:HD\s*)?(?:Audio|Lyric)\s*\]/gi, // [Official Audio], [Official HD Audio]
    /\s*\((?:Full\s*)?HD(?:\s*Quality)?\)/gi, // (HD), (Full HD), (HD Quality)
    /\s*\[(?:Full\s*)?HD(?:\s*Quality)?\]/gi, // [HD], [Full HD], [HD Quality]
    /\s*\((?:Official\s*)?(?:Audio|Lyrics?)\s*(?:Video)?\)/gi, // (Audio), (Lyrics), (Official Lyrics)
    /\s*\[(?:Official\s*)?(?:Audio|Lyrics?)\s*(?:Video)?\]/gi, // [Audio], [Lyrics], [Official Lyrics]
    /\s*\(\d{4}\)/g, // (2024), (1990), etc.
    /\s*\[\d{4}\]/g, // [2024], [1990], etc.
    /\s*\(Remastered(?:\s*\d{4})?\)/gi, // (Remastered), (Remastered 2023)
    /\s*\[Remastered(?:\s*\d{4})?\]/gi, // [Remastered], [Remastered 2023]
    /\s*\(\d+\s*(?:K|M|B)?\s*Views?\)/gi, // (10M Views), (1K Views)
    /\s*\[\d+\s*(?:K|M|B)?\s*Views?\]/gi, // [10M Views], [1K Views]
    /\s*\(Visualizer\)/gi, // (Visualizer)
    /\s*\[Visualizer\]/gi, // [Visualizer]
    /\s*\([Cc]lean\s*(?:[Vv]ersion)?\)/g, // (Clean), (Clean Version)
    /\s*\[[Cc]lean\s*(?:[Vv]ersion)?\]/g, // [Clean], [Clean Version]
    /\s*\([Ee]xplicit\s*(?:[Vv]ersion)?\)/g, // (Explicit), (Explicit Version)
    /\s*\[[Ee]xplicit\s*(?:[Vv]ersion)?\]/g, // [Explicit], [Explicit Version]
    /\s*\((?:Official)?\s*[Ll]yric\s*[Vv]ideo\)/g, // (Lyric Video), (Official Lyric Video)
    /\s*\[(?:Official)?\s*[Ll]yric\s*[Vv]ideo\]/g  // [Lyric Video], [Official Lyric Video]
  ];
  
  suffixPatterns.forEach(pattern => {
    cleanedTitle = cleanedTitle.replace(pattern, '');
  });
  
  // Step 3: Handle any remaining parentheses or brackets at the end of the title
  // This is a bit aggressive, so we'll only do it for obvious promotional content
  cleanedTitle = cleanedTitle.replace(/\s*\([^)]*(?:video|audio|hd|official|4k|quality)[^)]*\)$/gi, '');
  cleanedTitle = cleanedTitle.replace(/\s*\[[^\]]*(?:video|audio|hd|official|4k|quality)[^\]]*\]$/gi, '');
  
  // Step 4: Clean up any double spaces and trim
  cleanedTitle = cleanedTitle.replace(/\s{2,}/g, ' ').trim();
  
  return cleanedTitle;
};
export function DownloadForm({ onDownload, isLoading, isPremium = false }: DownloadFormProps) {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState('mp3')
  const [preview, setPreview] = useState<MediaPreviewData | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [downloadedFile, setDownloadedFile] = useState<Blob | null>(null)
  const [filename, setFilename] = useState('')
  const [id3Metadata, setId3Metadata] = useState<ID3Metadata | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { toast } = useToast()
  const hasSavedRef = useRef(false)

  useEffect(() => {
    // Reset states when URL changes
    resetDownloadState()
  }, [url])

  const resetDownloadState = () => {
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setFilename('')
    setId3Metadata(null)
    hasSavedRef.current = false
    clearAudioSource()
  }

  const getAuthToken = () => {
    return localStorage.getItem('token') || ''
  }

  const clearAudioSource = () => {
    if (audioRef.current) {
      if (audioRef.current.src && audioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioRef.current.src)
      }
      audioRef.current.src = ''
      audioRef.current.removeAttribute('src')
    }
  }

  const handlePreview = async () => {
    if (!url || isPreviewLoading || isDownloading) return

    setIsPreviewLoading(true)
    resetDownloadState()
    
    try {
      const videoInfo = extractVideoId(url)
      if (!videoInfo) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid YouTube or Spotify URL.",
          variant: "destructive"
        })
        return
      }

      let data: MediaPreviewData
      if (videoInfo.platform === 'youtube') {
        data = await fetchYouTubeData(videoInfo.id, videoInfo.isPlaylist, videoInfo.playlistId, url)
      } else { 
        data = await fetchSpotifyData(videoInfo.id, videoInfo.isPlaylist, url, getAuthToken())
      }

      if (!data) {
        throw new Error("Failed to fetch preview data")
      }

      const songCount = typeof data.songCount === 'number' ? data.songCount : 
                        (typeof data.songCount === 'string' && data.songCount !== 'Multiple' ? 
                         parseInt(data.songCount, 10) : undefined)
      
      const previewData: MediaPreviewData = {
        ...data,
        songCount: songCount && !isNaN(songCount) ? songCount : undefined
      }
      
      setPreview(previewData)
      toast({
        title: "Preview Loaded",
        description: "Check the details and choose a format.",
      })
    } catch (error) {
      console.error('Error loading preview:', error)
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Could not load preview for this URL.",
        variant: "destructive"
      })
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const handleDownloadMedia = async () => {
    if (preview && downloadComplete && downloadedFile && filename) {
      console.log("File already downloaded. Saving existing file...")
      saveToDevice()
      return
    }

    if (!preview || isDownloading) return

    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setId3Metadata(null)

    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval)
          return 90
        }
        return prev + Math.floor(Math.random() * 5) + 1
      })
    }, 300)

    try {
      const token = getAuthToken()
      if (!token) throw new Error('Authentication required to download.')

      // For playlists from Spotify, use special playlist download endpoint
      if (preview.isPlaylist && preview.platform === 'spotify') {
        await handleSpotifyPlaylistDownload(token, interval)
        return
      }

      // For single tracks, send artist and title info to backend
      const requestData = {
        url: preview.url, 
        format,
        // Include metadata for better ID3 tagging on the backend
        metadata: {
          artist: preview.artist,
          title: preview.title
        }
      }

      const response = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify(requestData),
      })

      clearInterval(interval)

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('You have hit the daily limit!! Please try again tomorrow.')
        }

        let errorMessage = `Download failed: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.detail || errorMessage
        } catch (e) {
          errorMessage = `Download failed: ${response.status} ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const contentType = response.headers.get('content-type')

      if (contentType && (contentType.includes('audio/') || contentType.includes('application/zip'))) {
        // Get the blob first
        const blob = await response.blob()
        console.log(`Blob received (${blob.size} bytes)`)
        
        // Extract ID3 tags if it's an audio file
        let extractedID3 = {}
        if (contentType.includes('audio/')) {
          extractedID3 = await extractID3Tags(blob)
          setId3Metadata(extractedID3)
          console.log('Extracted ID3 tags:', extractedID3)
        }

        // Generate filename based on available info
        let outputFilename = ''
        // 1. Try ID3 tags first (most reliable)
        if (extractedID3.title && extractedID3.artist) {
          // Clean the title if it's from YouTube
          const cleanedTitle = preview.platform === 'youtube' 
            ? cleanYouTubeTitle(extractedID3.title, extractedID3.artist)
            : extractedID3.title;
          
          outputFilename = `${extractedID3.artist} - ${cleanedTitle}.${format}`;
        }
        // 2. Fall back to preview data
        else if (preview.artist && preview.title && 
                preview.artist !== 'Unknown Artist' && 
                preview.title !== 'Track' && 
                preview.title !== 'Spotify Track') {
          
          // Clean the title if it's from YouTube
          const cleanedTitle = preview.platform === 'youtube'
            ? cleanYouTubeTitle(preview.title, preview.artist)
            : preview.title;
          
          outputFilename = `${preview.artist} - ${cleanedTitle}.${format}`;
        }
        // 3. Last resort: content-disposition header or generic name
        else {
          const contentDisposition = response.headers.get('content-disposition')
          const filenameMatch = contentDisposition?.match(/filename\*?=['"]?([^'";]+)['"]?/)
          
          if (filenameMatch && filenameMatch[1]) {
            try { 
              outputFilename = decodeURIComponent(filenameMatch[1])
            } catch (e) { 
              outputFilename = filenameMatch[1]
            }
          } else {
            // Fallback with timestamp
            outputFilename = `Downloaded ${preview.platform === 'youtube' ? 'YouTube' : 'Spotify'} Track - ${new Date().toISOString().split('T')[0]}.${format}`
          }
        }

        // Clean the final filename
        outputFilename = outputFilename.replace(/[/\\?%*:|"<>]/g, '-')
        console.log(`Final filename: ${outputFilename}`)

        setFilename(outputFilename)
        setDownloadedFile(blob)

        // Set up audio preview if available
        if (!preview.isPlaylist && audioRef.current && contentType.includes('audio/')) {
          try {
            const audioUrl = URL.createObjectURL(blob)
            clearAudioSource()
            audioRef.current.src = audioUrl
          } catch (audioError) { 
            console.error("Error creating audio preview:", audioError)
            clearAudioSource()
          }
        }

        setDownloadProgress(100)
        setDownloadComplete(true)

        toast({ 
          title: "Download Complete", 
          description: "Click the Save button to save the file to your device." 
        })

        onDownload(preview.url, format)
      } else {
        // Handle non-blob responses (like processing status)
        try {
          const data = await response.json()
          setDownloadProgress(100)
          setDownloadComplete(true)
          toast({ 
            title: data.message || "Processing Started", 
            description: data.detail || "Download is processing." 
          })
          onDownload(preview.url, format)
        } catch(jsonError) {
          console.error("Error processing response:", jsonError)
          throw new Error("Received an unexpected response from the server.")
        }
      }
    } catch (error) {
      console.error('Download error:', error)
      clearInterval(interval)
      toast({ 
        title: "Download Failed", 
        description: error instanceof Error ? error.message : "An error occurred.", 
        variant: "destructive" 
      })
      setDownloadProgress(0)
      setDownloadComplete(false)
      setDownloadedFile(null)
    } finally {
      setIsDownloading(false)
    }
  }

  const saveToDevice = () => {
    if (!downloadedFile || !filename) {
      toast({ 
        title: "Save Error", 
        description: "Could not save file. Please try downloading again.", 
        variant: "destructive" 
      })
      return
    }

    try {
      // Create a blob URL from the downloaded file - don't modify the blob!
      const blobUrl = window.URL.createObjectURL(downloadedFile)
      
      // Set up download element
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      
      // Trigger download
      a.click()
      
      // Clean up resources after download starts
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl)
        document.body.removeChild(a)
      }, 100)
      
      toast({
        title: "File Saved",
        description: `${filename} has been saved to your device.`,
      })
      
      hasSavedRef.current = true
    } catch (e) {
      console.error("Error saving file:", e)
      toast({ 
        title: "Save Error", 
        description: "Failed to save file. Please try again.", 
        variant: "destructive" 
      })
    }
  }

  // Parse ID3 tags from MP3 file
  const extractID3Tags = async (blob: Blob): Promise<ID3Metadata> => {
    try {
      console.log('Attempting to extract ID3 tags from MP3 file...', { type: blob.type, size: blob.size })
      
      // Ensure it looks like an MP3 file before parsing
      if (!blob.type.includes('mpeg') && !blob.type.includes('mp3')) {
        console.warn('Blob does not appear to be an MP3 file, skipping ID3 extraction.')
        return {}
      }

      const metadata = await musicMetadata.parseBlob(blob, { 
        skipCovers: false, 
        skipPostHeaders: false,
        duration: true
      })
      console.log('Raw ID3 tags extracted:', metadata)
      
      // Extract relevant information, logging each piece
      const title = metadata.common.title || undefined
      const artist = metadata.common.artist || metadata.common.artists?.[0] || undefined
      const album = metadata.common.album || undefined
      const year = metadata.common.year?.toString() || undefined
      
      console.log('Extracted ID3 Fields:', { title, artist, album, year })
      
      const id3Data: ID3Metadata = {
        title: title,
        artist: artist,
        album: album,
        year: year,
        picture: metadata.common.picture
      }
      
      return id3Data
    } catch (error) {
      console.error('Error extracting ID3 tags:', error)
      // Return empty object on error so the calling function knows it failed
      return {}
    }
  }


  // New function to handle Spotify playlist downloads
  const handleSpotifyPlaylistDownload = async (token: string, progressInterval: NodeJS.Timeout) => {
    try {
      // First, initiate the playlist download
      const playlistInitResponse = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url: preview?.url, format }),
      });

      if (!playlistInitResponse.ok) {
        clearInterval(progressInterval)
        throw new Error(`Failed to initiate playlist download: ${playlistInitResponse.status}`)
      }
      
      // Get playlist info from response
      const playlistData = await playlistInitResponse.json() as PlaylistDownloadResponse
      console.log('Playlist download initiated:', playlistData)
      
      if (!playlistData.playlist_id) {
        clearInterval(progressInterval)
        throw new Error('No playlist ID returned from server')
      }
      
      // Show info about download
      toast({
        title: "Playlist Processing",
        description: `${playlistData.downloaded_tracks} of ${playlistData.total_tracks} tracks processed. Downloading ZIP file...`,
      })
      
      // Now download the actual ZIP file
      const zipResponse = await fetch(getPlaylistDownloadEndpoint(playlistData.playlist_id), {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
        },
      })
      
      clearInterval(progressInterval)
      
      if (!zipResponse.ok) {
        throw new Error(`Failed to download playlist ZIP: ${zipResponse.status}`)
      }
      
      const blob = await zipResponse.blob()
      console.log(`Playlist ZIP received (${blob.size} bytes)`)
      
      // Generate a good filename for the playlist
      let playlistName = preview?.title || 'Playlist'
      if (playlistName === 'Spotify Playlist') {
        playlistName = 'Playlist'
      }
      
      const cleanPlaylistName = playlistName.replace(/[/\\?%*:|"<>]/g, '-')
      const outputFilename = `${cleanPlaylistName}.zip`
      
      setFilename(outputFilename)
      setDownloadedFile(blob)
      setDownloadProgress(100)
      setDownloadComplete(true)
      
      toast({ 
        title: "Playlist Download Complete", 
        description: "Click the Save button to save the ZIP file to your device." 
      })
      
      onDownload(preview?.url || '', format)
      
    } catch (error) {
      clearInterval(progressInterval)
      console.error('Spotify playlist download error:', error)
      throw error // Pass to outer catch handler
    }
  }

  const handleActionButtonClick = () => {
    // If we already have the file downloaded, just save it (no backend call)
    if (downloadComplete && downloadedFile) {
      console.log('Using existing downloaded file - no need to make another backend request')
      saveToDevice()
    } else {
      // Otherwise initiate a new download from the backend
      handleDownloadMedia()
    }
  }

  const playAudio = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio play error:", e))
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
      )
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
      )
    }
  }

  const renderSpotifyEmbed = (id: string, isPlaylist: boolean) => {
    const embedType = isPlaylist ? 'playlist' : 'track'
    const height = isPlaylist ? '380px' : '80px'
    
    // When rendering the Spotify embed, also try to extract the title and artist
    // This is a backup method that might help with filename generation
    setTimeout(() => {
      try {
        const iframe = document.querySelector(`iframe[src*="open.spotify.com/embed/${embedType}/${id}"]`)
        if (iframe && preview && preview.platform === 'spotify' && 
            (preview.title === 'Track' || preview.title === 'Spotify Track')) {
          console.log('Attempting to extract metadata from rendered Spotify iframe')
          
          // We can't directly access iframe content due to CORS,
          // but we can listen for messages or try other approaches
          
          // For now, just log that we found the iframe - future enhancement
          console.log('Found Spotify iframe, metadata extraction would go here')
        }
      } catch (e) {
        console.warn('Error checking Spotify iframe:', e)
      }
    }, 1500)

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
    )
  }

  const formatSelectorElement = (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Format:</Label>
        <ToggleGroup
          type="single"
          value={format}
          onValueChange={(value) => { if (value) { setFormat(value) } }}
          className="flex flex-wrap gap-2"
          disabled={isDownloading}
        >
          <ToggleGroupItem value="mp3" aria-label="Select MP3 format">MP3</ToggleGroupItem>
          <ToggleGroupItem value="aac" aria-label="Select AAC format">AAC</ToggleGroupItem>
          <ToggleGroupItem value="flac" aria-label="Select FLAC format">FLAC</ToggleGroupItem>
          <ToggleGroupItem value="wav" aria-label="Select WAV format">WAV</ToggleGroupItem>
        </ToggleGroup>
      </div>
  )

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
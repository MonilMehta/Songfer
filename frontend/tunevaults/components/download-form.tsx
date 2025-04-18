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
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setFilename('')
    setId3Metadata(null)
    hasSavedRef.current = false
    if (audioRef.current) {
      audioRef.current.src = ''
      audioRef.current.removeAttribute('src')
    }
  }, [url])

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
    setPreview(null)
    setDownloadProgress(0)
    setIsDownloading(false)
    setDownloadComplete(false)
    setDownloadedFile(null)
    setFilename('')
    setId3Metadata(null)
    hasSavedRef.current = false
    
    clearAudioSource()

    try {
      const videoInfo = extractVideoId(url)
      console.log("Extracted Video Info:", videoInfo)

      if (!videoInfo) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid YouTube or Spotify URL.",
          variant: "destructive"
        })
        setIsPreviewLoading(false)
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

      const songCount = typeof data.songCount === 'number' ? data.songCount : (typeof data.songCount === 'string' && data.songCount !== 'Multiple' ? parseInt(data.songCount, 10) : undefined)
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
      console.error('Error in handlePreview:', error)
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Could not load preview for this URL.",
        variant: "destructive"
      })
       setPreview(null)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const saveToDevice = () => {
    // If no file to save, show an error
    if (!downloadedFile || !filename || !(downloadedFile instanceof Blob)) {
        console.error('Attempted to save file, but downloadedFile is invalid or missing.', { 
            downloadedFile: typeof downloadedFile, 
            hasFile: !!downloadedFile,
            filename 
        })
        toast({ 
            title: "Save Error", 
            description: "Could not save file. Please try downloading again.", 
            variant: "destructive" 
        })
        return
    }

    console.log(`Saving file: ${filename} (${downloadedFile.size} bytes)`)
    
    try {
        // Create a blob URL from the downloaded file
        const blobUrl = window.URL.createObjectURL(downloadedFile)
        
        // Set up download element
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename
        a.style.display = 'none'
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
    } catch (e) {
        console.error("Error initiating file download:", e)
        toast({ 
            title: "Save Error", 
            description: "Failed to trigger download. Please try again.", 
            variant: "destructive" 
        })
    }
    
    // We deliberately don't reset downloadedFile or downloadComplete state 
    // so the user can save the same file multiple times without re-downloading
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

      const response = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url: preview.url, format }),
      })

      clearInterval(interval)

      if (!response.ok) {
        // Check for rate limit (429) error specifically
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
        const contentDisposition = response.headers.get('content-disposition')
        const filenameMatch = contentDisposition?.match(/filename\*?=['"]?([^'";]+)['"]?/)
        let outputFilename = ''; // Initialize filename
        
        // Extract and log ALL metadata from response headers
        const metadata = extractMetadataFromHeaders(response.headers)
        console.log('Headers metadata:', metadata)
        
        // Get the blob first so we can extract ID3 tags if needed
        const blob = await response.blob()
        console.log(`Blob received (${blob.size} bytes)`)
        
        // Try to extract ID3 tags if it's an MP3 file
        let extractedID3: ID3Metadata = {}
        if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) {
          extractedID3 = await extractID3Tags(blob)
          setId3Metadata(extractedID3) // Store for potential later use
        }
        
        // --- Filename Logic --- 
        // Priority 1: Use ID3 tags if BOTH title and artist are present
        if (extractedID3.title && extractedID3.artist) {
          console.log(`Using ID3 metadata: Title="${extractedID3.title}", Artist="${extractedID3.artist}"`);
          outputFilename = `${extractedID3.artist} - ${extractedID3.title}.${format}`; 
        }
        // Priority 2: Use headers if BOTH title and artist are present (and ID3 failed)
        else if (metadata.title && metadata.artist) {
          console.log(`Using header metadata: Title="${metadata.title}", Artist="${metadata.artist}"`);
          let finalTitle = metadata.title; // Start with header title
          // Apply YouTube specific cleaning if needed
          if (preview && preview.platform === 'youtube') {
            finalTitle = finalTitle
              .replace(/\(Official Music Video\)/gi, '')
              .replace(/\(Official Video\)/gi, '')
              .replace(/\(Lyrics\)/gi, '')
              .replace(/\(Lyric Video\)/gi, '')
              .replace(/\(Audio\)/gi, '')
              .replace(/\(Official Audio\)/gi, '')
              .replace(/\[\s*HD\s*\]/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
            const dashIndex = finalTitle.indexOf('-');
            if (dashIndex > 0) {
              finalTitle = finalTitle.substring(dashIndex + 1).trim();
            }
          }
          outputFilename = `${metadata.artist} - ${finalTitle}.${format}`;
        }
        // Priority 3: Use Preview data if available (and ID3/Headers failed)
        else if (preview && preview.title && preview.artist && 
                 preview.title !== 'Track' && preview.title !== 'Spotify Track' &&
                 preview.artist !== 'Unknown Artist') {
          console.log(`Using preview metadata: Title="${preview.title}", Artist="${preview.artist}"`);
          outputFilename = `${preview.artist} - ${preview.title}.${format}`;
        }
        // Priority 4: Use Content Disposition filename if available (and others failed)
        else if (filenameMatch && filenameMatch[1]) {
           console.log('Using content disposition filename as fallback');
           try { 
             outputFilename = decodeURIComponent(filenameMatch[1]); 
           } catch (e) { 
             outputFilename = filenameMatch[1]; 
           }
           // Ensure correct extension
           if (!outputFilename.toLowerCase().endsWith(`.${format}`)) {
             outputFilename = `${outputFilename.replace(/\.[^/.]+$/, "")} .${format}`;
           }
         } 
        // Priority 5: Final Fallback (if nothing else worked)
        else {
          console.log('Using final fallback filename');
          outputFilename = `${preview?.artist || 'Unknown Artist'} - ${preview?.title || 'Untitled Track'}.${format}`; 
          // Use a simpler default if preview is also generic
          if (outputFilename.startsWith('Unknown Artist - Untitled Track')) {
            outputFilename = `Downloaded File - ${new Date().toISOString().split('T')[0]}.${format}`
          }
        }

        // Clean the final filename of invalid characters
        outputFilename = outputFilename.replace(/[/\\?%*:|"<>]/g, '-');
        console.log(`Final generated filename: ${outputFilename}`);

        setFilename(outputFilename);
        setDownloadedFile(blob);

        if (!preview.isPlaylist && audioRef.current && contentType.includes('audio/')) {
          try {
            const audioUrl = URL.createObjectURL(blob)
            // Clean up existing audio URL properly using our dedicated function
            clearAudioSource()
            // Set the new blob URL
            audioRef.current.src = audioUrl
            
            // Try once more to get metadata from the audio element
            audioRef.current.onloadedmetadata = () => {
              try {
                if (!audioRef.current) return;
                
                console.log('Audio element metadata:', {
                  title: audioRef.current.title,
                  duration: audioRef.current.duration
                })
                
                if (audioRef.current.title && filename.includes('Unknown Artist') || filename.includes('Downloaded Track')) {
                  const newFilename = `${audioRef.current.title}.${format}`.replace(/[/\\?%*:|"<>]/g, '-')
                  console.log(`Updating filename from audio element metadata: ${newFilename}`)
                  setFilename(newFilename)
                }
              } catch (e) {
                console.error('Error getting metadata from audio element:', e)
              }
            }
          } catch (audioError) { 
            console.error("Error creating audio object URL:", audioError)
            clearAudioSource() // Ensure audio is cleared if there's an error
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
         try {
            const data = await response.json()
            console.log('Download response (JSON):', data)
            setDownloadProgress(100)
            setDownloadComplete(true)
            toast({ 
                title: data.message || "Processing Started", 
                description: data.detail || "Download is processing." 
            })
            onDownload(preview.url, format)
        } catch(jsonError) {
             console.error("Error processing non-file download response:", jsonError, contentType)
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
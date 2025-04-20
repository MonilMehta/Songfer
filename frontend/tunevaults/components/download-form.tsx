import { useState, useEffect, useRef } from 'react'
import { Youtube, Music, ListMusic, Play, DownloadCloud, LinkIcon, Search, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SongPreview } from '@/components/song-preview'
import { useToast } from '@/hooks/use-toast'
import { useUserProfile } from '@/context/UserProfileContext'
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

// YouTube playlist track interface
interface YouTubePlaylistTrack {
  title: string;
  videoId: string;
  thumbnail?: string;
  duration?: string;
}

interface YouTubePlaylistDetails {
  title: string;
  tracks: YouTubePlaylistTrack[];
  thumbnail?: string;
  loading: boolean;
  error?: string;
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
 * @param {string | undefined} title - The original YouTube title
 * @param {string | undefined} artist - The artist name
 * @return {string} - Cleaned title
 */
const cleanYouTubeTitle = (title: string | undefined, artist: string | undefined): string => {
  if (!title) return 'Untitled Track'; // Return a default if title is missing
  if (!artist) return title; // Return original title if artist is missing
  
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
  const [playlistDetails, setPlaylistDetails] = useState<YouTubePlaylistDetails | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { toast } = useToast()
  const hasSavedRef = useRef(false)
  
  // Get user profile from context
  const { userProfile, updateDownloadsCount } = useUserProfile()
  
  // Use context's isPremium value if available, otherwise fall back to props
  const userIsPremium = userProfile?.is_premium ?? isPremium
  
  // Check for download limitations
  const hasReachedDownloadLimit = userProfile && !userProfile.is_premium && userProfile.downloads_remaining <= 0

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
    setPlaylistDetails(null)
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
    // Check download limits from context
    if (hasReachedDownloadLimit) {
      toast({
        title: "Download Limit Reached",
        description: "You have reached your daily download limit. Upgrade to premium for more downloads.",
        variant: "destructive"
      })
      return
    }

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

      // --- Playlist Handling --- 
      if (preview.isPlaylist) {
        console.log(`Handling playlist download for ${preview.platform}...`);
        // Use the unified playlist download handler
        await handlePlaylistDownload(token, interval, preview.platform);
        
        // Update the download count in context
        updateDownloadsCount(true)
        
        return; // Exit after handling playlist
      }

      // --- Single Track Handling --- 
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
        try { const errorData = await response.json(); errorMessage = errorData.message || errorData.detail || errorMessage } catch (e) { errorMessage = `Download failed: ${response.status} ${response.statusText}` }
        throw new Error(errorMessage)
      }

      const contentType = response.headers.get('content-type')
      console.log(`Response content type: ${contentType}`)

      // Check if we got a JSON response (indicates a playlist or error)
      if (contentType && contentType.includes('application/json')) {
        try {
          const jsonData = await response.json()
          console.log('Received JSON response:', jsonData)
          
          // Check if this is a playlist success response
          if (jsonData.message && 
             (jsonData.message.includes('Playlist') || 
              jsonData.message.includes('playlist') ||
              jsonData.playlist_id)) {
            
            console.log('Detected playlist response, handling separately:', jsonData)
            
            // This means the first step of playlist processing completed
            // We need to continue with playlist download using the ID
            const playlistId = jsonData.playlist_id || extractPlaylistIdFromUrl(preview.url)
            if (!playlistId) {
              throw new Error('No playlist ID found in response or URL')
            }
            
            // Extract playlist name
            let playlistName = preview.title
            const nameMatch = jsonData.message?.match(/Playlist ['"]([^'"]+)['"]/i)
            if (nameMatch && nameMatch[1]) {
              playlistName = nameMatch[1]
            }
            
            // Now fetch the actual ZIP file
            const platform = preview.platform
            const zipEndpoint = platform === 'spotify'
              ? getPlaylistDownloadEndpoint(playlistId)
              : `http://localhost:8000/api/songs/playlists/${playlistId}/download-all/`
            
            console.log(`Fetching playlist ZIP from: ${zipEndpoint}`)
            
            toast({
              title: "Playlist Processing",
              description: `Processing tracks for "${playlistName}". Downloading ZIP...`,
              duration: 5000
            })
            
            const zipResponse = await fetch(zipEndpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Token ${token}`,
              },
            })
            
            if (!zipResponse.ok) {
              throw new Error(`Failed to download playlist ZIP: ${zipResponse.status}`)
            }
            
            const blob = await zipResponse.blob()
            console.log(`Playlist ZIP received (${blob.size} bytes)`)
            
            if (blob.size === 0) {
              throw new Error('Received empty ZIP file')
            }
            
            // Generate filename
            const cleanPlaylistName = playlistName.replace(/[/\\?%*:|"<>]/g, '-')
            const outputFilename = `${cleanPlaylistName}.zip`
            
            // Set states to enable save button
            setFilename(outputFilename)
            setDownloadedFile(blob)
            setDownloadProgress(100)
            setDownloadComplete(true)
            
            toast({ 
              title: "Playlist Download Complete", 
              description: `"${outputFilename}" ready. Click Save.`,
              duration: 5000
            })
            
            onDownload(preview.url, 'zip')
            
            // Update download count in context without an API call
            updateDownloadsCount(true)
            
            return
          }
          
          // If we got JSON but it's not a playlist response, it's probably an error
          if (jsonData.error || jsonData.detail) {
            throw new Error(jsonData.error || jsonData.detail || 'Unknown error in response')
          }
          
          throw new Error('Received JSON response instead of audio file')
        } catch (jsonError: any) {
          console.error('Error processing JSON response:', jsonError)
          throw jsonError
        }
      }

      // Handle audio content for single track downloads
      if (contentType && contentType.includes('audio/')) { // Only handle audio for single tracks
        const blob = await response.blob()
        console.log(`Blob received (${blob.size} bytes)`) 
        
        let extractedID3: ID3Metadata = {};
        if (contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')) {
          extractedID3 = await extractID3Tags(blob)
          setId3Metadata(extractedID3)
        }

        let finalArtist = 'Unknown Artist';
        let finalTitle = 'Untitled Track';
        let source = 'fallback';

        // Determine best artist/title based on platform and available data
        if (preview.platform === 'spotify') {
          // Spotify: Prioritize ID3 tags
          if (extractedID3.title && extractedID3.artist) {
            finalArtist = extractedID3.artist;
            finalTitle = extractedID3.title;
            source = 'id3';
          } else if (preview.title && preview.artist && preview.title !== 'Track' && preview.artist !== 'Unknown Artist') {
            finalArtist = preview.artist;
            finalTitle = preview.title;
            source = 'preview';
          } 
        } else if (preview.platform === 'youtube') {
          // YouTube: Prioritize Preview data first for consistency with what user sees
           if (preview.title && preview.artist && preview.artist !== 'Unknown Artist') {
            finalArtist = preview.artist;
            finalTitle = preview.title;
            source = 'preview';
          } else if (extractedID3.title && extractedID3.artist) { // ID3 as fallback for YouTube
            finalArtist = extractedID3.artist;
            finalTitle = extractedID3.title;
            source = 'id3';
          } 
          // Apply YouTube specific cleaning to the chosen title
          finalTitle = cleanYouTubeTitle(finalTitle, finalArtist);
        }

        // Construct filename using the determined artist/title
        let outputFilename = `${finalArtist} - ${finalTitle}.${format}`;
        console.log(`Metadata source used: ${source}`);

        // Final fallback check
        if (outputFilename.startsWith('Unknown Artist - Untitled Track') || outputFilename.startsWith('Unknown Artist - YouTube Video')) {
            const contentDisposition = response.headers.get('content-disposition');
            const filenameMatch = contentDisposition?.match(/filename\*?=['"]?([^'";]+)['"]?/);
            if (filenameMatch && filenameMatch[1]) {
                console.log('Using content disposition filename as final fallback');
                try { outputFilename = decodeURIComponent(filenameMatch[1]); } catch (e) { outputFilename = filenameMatch[1]; }
                if (!outputFilename.toLowerCase().endsWith(`.${format}`)) {
                   outputFilename = `${outputFilename.replace(/\.[^/.]+$/, "")}.${format}`;
                }
            } else {
                console.log('Using generic date fallback filename');
                outputFilename = `Downloaded File - ${new Date().toISOString().split('T')[0]}.${format}`; 
            }
        }

        // Clean the final filename
        outputFilename = outputFilename.replace(/[/\\?%*:|"<>]/g, '-');
        console.log(`Final generated filename: ${outputFilename}`);

        setFilename(outputFilename);
        setDownloadedFile(blob);

         // Set up audio preview
        if (audioRef.current) {
          try {
            const audioUrl = URL.createObjectURL(blob)
            clearAudioSource() 
            audioRef.current.src = audioUrl
          } catch (audioError) { 
            console.error("Error creating audio preview:", audioError)
            clearAudioSource()
          }
        }

        setDownloadProgress(100);
        setDownloadComplete(true);
        toast({ title: "Download Complete", description: "Click the Save button to save the file." });
        onDownload(preview.url, format);
        
        // Update download count in context without an API call
        updateDownloadsCount(true)
      } else {
        // If response is not audio and not a known format, handle as error
        console.error('Unexpected content type:', contentType)
        try {
          const textResponse = await response.text()
          console.error('Error response content:', textResponse)
          throw new Error(`Received an unexpected response: ${contentType}`)
        } catch (error) {
          throw new Error('Unexpected response format from server')
        }
      }
    } catch (error) {
      console.error('Download error:', error);
      clearInterval(interval);
      toast({ title: "Download Failed", description: error instanceof Error ? error.message : "An error occurred.", variant: "destructive" });
      setDownloadProgress(0);
      setDownloadComplete(false);
      setDownloadedFile(null);
    } finally {
      setIsDownloading(false);
    }
  }

  // Helper function to extract playlist ID from URL if needed
  const extractPlaylistIdFromUrl = (url: string): string | undefined => {
    // YouTube playlist ID extraction
    const ytMatch = url.match(/list=([a-zA-Z0-9_-]+)/i)
    if (ytMatch && ytMatch[1]) {
      return ytMatch[1]
    }
    
    // Spotify playlist ID extraction
    const spotifyMatch = url.match(/playlist\/([a-zA-Z0-9]+)/i)
    if (spotifyMatch && spotifyMatch[1]) {
      return spotifyMatch[1]
    }
    
    return undefined
  }

  // Unified function to handle Playlist downloads (Spotify & YouTube)
  const handlePlaylistDownload = async (token: string, progressInterval: NodeJS.Timeout, platform: 'spotify' | 'youtube') => {
    if (!preview) return; // Ensure preview data exists
    
    try {
      console.log(`Initiating ${platform} playlist download...`);
      // Step 1: Initiate the playlist download process via the standard endpoint
      const playlistInitResponse = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url: preview.url, format }), // Format might not be relevant for playlist ZIP
      });

      console.log(`Initial ${platform} playlist response status: ${playlistInitResponse.status}`);
      
      if (!playlistInitResponse.ok) {
        const errorText = await playlistInitResponse.text();
        console.error(`Failed to initiate ${platform} playlist download. Status: ${playlistInitResponse.status}, Response: ${errorText}`);
        throw new Error(`Failed to initiate ${platform} playlist download: ${playlistInitResponse.status}`);
      }
      
      // For both platforms, first process the initial response
      const contentType = playlistInitResponse.headers.get('content-type');
      console.log(`Playlist init response content type: ${contentType}`);
      
      // Handle YouTube special case - if we get JSON with a success message that includes playlist name
      // We need to extract the playlist ID from the URL since it's not in the response
      if (platform === 'youtube' && contentType && contentType.includes('application/json')) {
        let responseData;
        try {
          responseData = await playlistInitResponse.json();
          console.log(`YouTube playlist response:`, responseData);
          
          // YouTube success case - message with "downloaded successfully"
          if (responseData.message && responseData.message.includes('downloaded successfully')) {
            console.log(`YouTube playlist success message detected: ${responseData.message}`);
            
            // **PRIORITIZE internal ID from response if available**
            let internalPlaylistId = responseData.playlist_id; 
            
            // Fallback: Extract the YouTube playlist ID directly from the URL
            if (!internalPlaylistId) {
              const urlMatch = preview.url.match(/list=([a-zA-Z0-9_-]+)/i);
              if (!urlMatch || !urlMatch[1]) {
                console.error(`Cannot extract playlist ID from URL: ${preview.url}`);
                throw new Error(`Cannot extract playlist ID from URL: ${preview.url}`);
              }
              // Use the YouTube ID string ONLY if internal ID is missing (this might still be wrong)
              internalPlaylistId = urlMatch[1]; 
              console.warn(`Using YouTube ID string (${internalPlaylistId}) as fallback for download-all endpoint. Backend might expect internal ID.`);
            } else {
               console.log(`Using internal playlist ID from response: ${internalPlaylistId}`);
            }
            
            // Extract name if available
            let playlistName = preview.title;
            const nameMatch = responseData.message.match(/Playlist ['"]([^'"]+)['"]/i);
            if (nameMatch && nameMatch[1]) {
              playlistName = nameMatch[1];
              console.log(`Extracted playlist name: "${playlistName}"`);
            }
            
            toast({
              title: "YouTube Playlist Processing",
              description: `Processing playlist "${playlistName}". Downloading ZIP...`,
              duration: 5000
            });
            
            // Build YouTube playlist ZIP endpoint using the internal ID
            const zipEndpoint = `http://localhost:8000/api/songs/playlists/${internalPlaylistId}/download-all/`;
            console.log(`Fetching YouTube ZIP from: ${zipEndpoint}`);
            
            try {
              const zipResponse = await fetch(zipEndpoint, {
                method: 'GET',
                headers: {
                  'Authorization': `Token ${token}`,
                },
              });
              
              console.log(`YouTube ZIP response status: ${zipResponse.status}`);
              console.log(`YouTube ZIP response headers:`, 
                         Object.fromEntries([...zipResponse.headers.entries()]));
              
              clearInterval(progressInterval);
              
              if (!zipResponse.ok) {
                const zipErrorText = await zipResponse.text();
                console.error(`Failed to download YouTube playlist ZIP: ${zipResponse.status}, Response: ${zipErrorText}`);
                throw new Error(`Failed to download YouTube playlist ZIP: ${zipResponse.status}`);
              }
              
              const blob = await zipResponse.blob();
              console.log(`YouTube Playlist ZIP received (${blob.size} bytes, type: ${blob.type})`);
              
              if (blob.size === 0) {
                throw new Error('Received empty ZIP file from server');
              }
              
              // Generate filename using extracted name
              const cleanPlaylistName = (playlistName || 'YouTube Playlist')
                .replace(/[/\\?%*:|"<>]/g, '-');
              const outputFilename = `${cleanPlaylistName}.zip`;
              
              // Set all necessary state variables to enable the Save button
              setFilename(outputFilename);
              setDownloadedFile(blob);
              setDownloadProgress(100);
              setDownloadComplete(true);
              
              console.log(`YouTube download complete, ready for save: ${outputFilename}`);
              
              toast({ 
                title: "Playlist Download Complete", 
                description: `"${outputFilename}" ready. Click Save.`,
                duration: 5000
              });
              
              onDownload(preview.url, 'zip');
              return; // Exit early for YouTube special case
              
            } catch (zipError) {
              clearInterval(progressInterval);
              console.error('YouTube ZIP download error:', zipError);
              throw zipError; // Re-throw to be caught by outer handler
            }
          }
        } catch (jsonError) {
          console.error('Error parsing YouTube playlist response JSON:', jsonError);
          // Continue to standard handling below
        }
      }
      
      // Standard flow for Spotify and fallback for YouTube if special case above doesn't apply
      let playlistData: PlaylistDownloadResponse;
      
      // Check if the response is JSON
      if (contentType && contentType.includes('application/json')) {
        try {
          playlistData = await playlistInitResponse.json() as PlaylistDownloadResponse;
          console.log(`${platform} Playlist download initiated response:`, playlistData);
        } catch (jsonError: any) {
          console.error(`Error parsing ${platform} playlist response:`, jsonError);
          throw new Error(`Failed to parse playlist response: ${jsonError.message || 'Unknown error'}`);
        }
      } else {
        throw new Error(`Unexpected content type in playlist response: ${contentType}`);
      }
      
      // Extract playlist ID - different platforms might have different response formats
      let playlistId: string | number | undefined = playlistData.playlist_id;
      
      // Handle case where ID is in the message for YouTube (fallback)
      if (!playlistId && playlistData.message) {
        // Try to extract playlist ID from message if it's not directly provided
        const idMatch = playlistData.message.match(/playlist[_\s]id[:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
        if (idMatch && idMatch[1]) {
          // For consistency, always store playlistId as a number if possible
          const extractedId = idMatch[1];
          playlistId = !isNaN(Number(extractedId)) ? Number(extractedId) : extractedId;
          console.log(`Extracted playlist ID from message: ${playlistId}`);
        }
      }
      
      if (!playlistId) {
        // YouTube might be returning success without an ID, so check message for success
        if (playlistData.message && 
            (playlistData.message.includes('downloaded successfully') || 
             playlistData.message.includes('playlist'))
           ) {
          // Extract name from the message to help generate filename
          const nameMatch = playlistData.message.match(/Playlist ['"]([^'"]+)['"]/i);
          const playlistName = nameMatch && nameMatch[1] ? nameMatch[1] : `${platform} Playlist`;
          
          // For YouTube, we might need to extract ID from the URL directly
          if (platform === 'youtube' && preview.url) {
            const urlMatch = preview.url.match(/list=([a-zA-Z0-9_-]+)/i);
            if (urlMatch && urlMatch[1]) {
              const extractedId = urlMatch[1];
              // Convert to number if possible for consistent typing
              playlistId = !isNaN(Number(extractedId)) ? Number(extractedId) : extractedId;
              console.log(`Extracted YouTube playlist ID from URL: ${playlistId}`);
            }
          }
          
          if (!playlistId) {
            console.error('No playlist ID found in response or URL');
            throw new Error('Cannot proceed: No playlist ID found in response or URL');
          }
          
          // Continue with download using the extracted ID
          console.log(`Using extracted playlist ID: ${playlistId}`);
        } else {
          console.error('No playlist ID returned from server');
          throw new Error('No playlist ID returned from server');
        }
      }
      
      // Extract playlist name from the message
      let playlistName = preview.title; // Default to preview title
      const nameMatch = playlistData.message?.match(/Playlist ['"]([^'"]+)['"]/i);
      if (nameMatch && nameMatch[1]) {
        playlistName = nameMatch[1];
        console.log(`Extracted playlist name from message: "${playlistName}"`);
      } else if (playlistName === 'Spotify Playlist' || playlistName === 'YouTube Playlist') {
         playlistName = `${platform === 'spotify' ? 'Spotify' : 'YouTube'} Playlist ${playlistId}`;
         console.warn('Could not extract name from message, using default:', playlistName);
      }

      toast({
        title: "Playlist Processing",
        description: `Processing tracks for "${playlistName}". Downloading ZIP...`,
        duration: 5000
      });
      
      // Step 2: Fetch the actual ZIP file from the platform-specific endpoint
      // Convert playlistId to string to avoid type issues
      const zipEndpoint = platform === 'spotify'
        ? getPlaylistDownloadEndpoint(playlistId) // getPlaylistDownloadEndpoint accepts string | number
        : `http://localhost:8000/api/songs/playlists/${String(playlistId)}/download-all/`; // Ensure string for URL

      console.log(`Fetching ZIP file from: ${zipEndpoint}`);
      const zipResponse = await fetch(zipEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${token}`,
        },
      });
      
      console.log(`ZIP download response status: ${zipResponse.status}`);
      
      clearInterval(progressInterval); // Stop fake progress once download starts
      
      if (!zipResponse.ok) {
        const zipErrorText = await zipResponse.text();
        console.error(`Failed to download ${platform} playlist ZIP: ${zipResponse.status}, Response: ${zipErrorText}`);
        throw new Error(`Failed to download ${platform} playlist ZIP: ${zipResponse.status}`);
      }
      
      const blob = await zipResponse.blob();
      console.log(`${platform} Playlist ZIP received (${blob.size} bytes, type: ${blob.type})`);
      
      if (blob.size === 0) {
        throw new Error('Received empty ZIP file from server');
      }
      
      // Generate filename using extracted or default playlist name
      const cleanPlaylistName = playlistName.replace(/[/\\?%*:|"<>]/g, '-');
      const outputFilename = `${cleanPlaylistName}.zip`;
      
      setFilename(outputFilename);
      setDownloadedFile(blob);
      setDownloadProgress(100);
      setDownloadComplete(true);
      
      console.log(`Download complete, states set. filename=${outputFilename}, downloadComplete=true`);
      
      toast({ 
        title: "Playlist Download Complete", 
        description: `"${outputFilename}" ready. Click Save.`,
        duration: 5000
      });
      
      onDownload(preview.url, format);
      
    } catch (error) {
      clearInterval(progressInterval);
      console.error(`Playlist download error:`, error);
      
      // Make sure to update UI states even on error
      setIsDownloading(false);
      setDownloadProgress(0);
      
      // Rethrow error to be caught by the main handler
      throw error;
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

  // YouTube playlist details fetcher
  const fetchYouTubePlaylistDetails = async (playlistId: string) => {
    if (!playlistId) return;
    
    setPlaylistDetails({ 
      title: preview?.title || 'YouTube Playlist', 
      tracks: [], 
      loading: true 
    });
    
    try {
      // First try oEmbed to get basic info
      const oembedResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`);
      
      if (oembedResponse.ok) {
        const oembedData = await oembedResponse.json();
        console.log('Playlist oembed data:', oembedData);
        
        // Try to extract first video thumbnail for playlist
        let playlistThumb = '';
        if (oembedData.thumbnail_url) {
          playlistThumb = oembedData.thumbnail_url;
        }
        
        // Now we'll try to use the public Invidious API to get track listing
        // This is open source and doesn't require an API key
        try {
          // Using a public Invidious instance - could be replaced with a different one
          const invidious = 'https://invidious.snopyta.org';
          const response = await fetch(`${invidious}/api/v1/playlists/${playlistId}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('Playlist details:', data);
            
            const tracks = data.videos?.map((video: any) => ({
              title: video.title,
              videoId: video.videoId,
              thumbnail: video.videoThumbnails?.[0]?.url || '',
              duration: video.lengthSeconds ? formatDuration(video.lengthSeconds) : undefined
            })) || [];
            
            setPlaylistDetails({
              title: data.title || oembedData.title || (preview?.title || 'YouTube Playlist'),
              tracks: tracks,
              thumbnail: data.playlistThumbnail || playlistThumb,
              loading: false
            });
            return;
          }
        } catch (invidiousError) {
          console.error('Error fetching from Invidious:', invidiousError);
          // Fall back to basic info if Invidious fails
        }
        
        // If Invidious failed, use what we got from oEmbed
        setPlaylistDetails({
          title: oembedData.title || (preview?.title || 'YouTube Playlist'),
          tracks: [],
          thumbnail: playlistThumb,
          loading: false
        });
      } else {
        throw new Error('Failed to fetch playlist info');
      }
    } catch (error) {
      console.error('Error fetching playlist details:', error);
      setPlaylistDetails({
        title: preview?.title || 'YouTube Playlist',
        tracks: [],
        loading: false,
        error: 'Could not load playlist details'
      });
    }
  }
  
  // Format seconds to MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  
  // Effect to fetch playlist details when preview is loaded
  useEffect(() => {
    if (preview?.isPlaylist && preview.platform === 'youtube' && preview.id) {
      fetchYouTubePlaylistDetails(preview.id);
    } else {
      setPlaylistDetails(null);
    }
  }, [preview?.id, preview?.isPlaylist, preview?.platform]);

  const renderYouTubeEmbed = (id: string, isPlaylist: boolean) => {
    if (isPlaylist) {
      // Enhanced playlist card view with track listing if available
      return (
        <div className="w-full border rounded-md shadow-md overflow-hidden flex flex-col">
          <div className="p-4 bg-card border-b">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-24 h-24 bg-muted rounded-md overflow-hidden">
                {/* Render ACTUAL thumbnail or placeholder, NOT recursive call */}
                {playlistDetails?.thumbnail ? (
                  <img 
                    src={playlistDetails.thumbnail} 
                    alt="Playlist thumbnail" 
                    className="w-full h-full object-cover"
                  />
                ) : preview?.thumbnail ? (
                   <img 
                    src={preview.thumbnail} 
                    alt="Playlist thumbnail" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
                     <ListMusic className="w-10 h-10 text-primary/50" />
                  </div>
                )}
              </div>
              <div>
                {/* Use title directly, assuming it's descriptive enough */}
                <h3 className="font-medium">{playlistDetails?.title || preview?.title || 'Playlist'}</h3>
                {/* Only show artist if it exists and is not 'Various Artists' */}
                {preview?.artist && preview.artist !== 'Various Artists' && (
                  <p className="text-sm text-muted-foreground mt-1">Created by {preview.artist}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {playlistDetails?.tracks.length ? `${playlistDetails.tracks.length} tracks` : 
                   preview?.songCount ? `${preview.songCount} tracks` : 'Multiple tracks'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Track listing if available */}
          {playlistDetails?.tracks && playlistDetails.tracks.length > 0 ? (
            <div className="max-h-[250px] overflow-y-auto border-b">
              <ul className="divide-y">
                {playlistDetails.tracks.slice(0, 10).map((track, index) => (
                  <li key={track.videoId} className="p-2 hover:bg-accent/20 flex items-center">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-center">{index + 1}</span>
                    {track.thumbnail && (
                      <img src={track.thumbnail} alt="" className="w-8 h-8 object-cover mr-2" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{track.title}</p>
                    </div>
                    {track.duration && (
                      <span className="text-xs text-muted-foreground ml-2">{track.duration}</span>
                    )}
                  </li>
                ))}
                {playlistDetails.tracks.length > 10 && (
                  <li className="p-2 text-center text-xs text-muted-foreground">
                    + {playlistDetails.tracks.length - 10} more tracks
                  </li>
                )}
              </ul>
            </div>
          ) : playlistDetails?.loading ? (
            <div className="p-4 text-center text-sm">
              <span className="animate-pulse">Loading playlist details...</span>
            </div>
          ) : (
            <div className="w-full aspect-video">
              <iframe
                key={`youtube-playlist-${id}`}
                className="w-full h-full"
                src={`https://www.youtube.com/embed/videoseries?list=${id}&enablejsapi=1`}
                title="YouTube playlist player"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              ></iframe>
            </div>
          )}
          
          {/* Fallback link in case embed doesn't work */}
          <div className="p-3 bg-accent/20">
            <a 
              href={`https://www.youtube.com/playlist?list=${id}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs flex items-center text-blue-600 hover:underline"
            >
              <LinkIcon className="w-3 h-3 mr-1" />
              Open playlist on YouTube
            </a>
          </div>
        </div>
      )
    } else {
      // Regular video embed, unchanged
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

      {hasReachedDownloadLimit && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          You've reached your daily download limit. 
          <a href="/pricing" className="ml-1 font-medium underline">
            Upgrade to premium
          </a> for unlimited downloads.
        </div>
      )}

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
                disabled={hasReachedDownloadLimit}
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
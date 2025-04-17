'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Youtube, Music, Loader2 } from 'lucide-react'
import apiCaller from '@/utils/apiCaller'

interface DownloadFormProps {
  onDownload?: (song: any) => void
}

export default function DownloadForm({ onDownload }: DownloadFormProps) {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      // Validate URL
      if (!url) {
        throw new Error('Please enter a URL')
      }

      // Check if URL is from YouTube or Spotify
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be')
      const isSpotify = url.includes('spotify.com')

      if (!isYoutube && !isSpotify) {
        throw new Error('Please enter a valid YouTube or Spotify URL')
      }

      // Call API to download song
      const response = await apiCaller('songs/songs/download/', 'POST', { url }, 
        { responseType: 'blob' }) // Set responseType to blob to handle binary data

      if (response && response.status === 200) {
        setSuccess('Song downloaded successfully!')
        setUrl('')
        
        // Get metadata from response headers
        const headers = response.headers || {}
        console.log('Response headers:', headers)
        
        const contentDisposition = headers['content-disposition']
        const songTitle = headers['x-song-title']
        const songArtist = headers['x-song-artist']
        const albumName = headers['x-album-name']
        const coverUrl = headers['x-cover-url']
        const durationStr = headers['x-duration']
        
        console.log('Song metadata from headers:', {
          contentDisposition,
          songTitle,
          songArtist,
          albumName,
          coverUrl,
          durationStr
        })
        
        // Parse filename from Content-Disposition if available
        let filename
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+?)"(?:;|$)/)
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/\.[^/.]+$/, "") // Remove extension
            console.log('Extracted filename:', filename)
          }
        }
        
        // Use the best available title and artist (prefer headers, fallback to filename or URL)
        let title = songTitle || filename
        // For Spotify URLs without metadata, extract the Spotify ID instead of using generic name
        if (!title && isSpotify) {
          // More robust regex that handles different Spotify URL formats
          const spotifyIdMatch = url.match(/spotify\.com\/(track|playlist)\/([a-zA-Z0-9]+)(\?|$)/)
          if (spotifyIdMatch && spotifyIdMatch[2]) {
            // Extract the ID and use it in a more descriptive way
            const songId = spotifyIdMatch[2]
            const trackType = spotifyIdMatch[1] // "track" or "playlist"
            console.log(`Extracted Spotify ${trackType} ID: ${songId}`)
            
            // Try to fetch track info from Spotify API if we have time later
            // For now, create a better title than just the ID
            title = `${trackType.charAt(0).toUpperCase() + trackType.slice(1)}: ${songId}`
          } else {
            console.log('Could not extract Spotify ID from URL:', url)
            title = 'Spotify Track'
          }
        } else if (!title) {
          console.log('No title found in headers or filename')
          title = 'Downloaded Song'
        }
        
        // Create a song object with available data
        const songData = {
          id: Date.now(),
          title: title,
          artist: songArtist || 'Unknown Artist',
          album: albumName,
          duration: durationStr,
          cover_url: coverUrl,
          // For binary responses, create a blob URL from the data
          download_url: window.URL.createObjectURL(response.data),
          download_date: new Date().toISOString()
        }
        
        console.log('Created song data object:', {
          id: songData.id,
          title: songData.title,
          artist: songData.artist,
          album: songData.album
        })
        
        // Call onDownload prop if provided
        if (onDownload) {
          onDownload(songData)
        }
      } else {
        throw new Error('Failed to download song')
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred')
      console.error('Download error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Download Music</CardTitle>
        <CardDescription>
          Enter a YouTube or Spotify URL to download music
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          {error && (
            <div className="text-sm text-red-500">
              {error}
            </div>
          )}
          
          {success && (
            <div className="text-sm text-green-500">
              {success}
            </div>
          )}
          
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              'Download'
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start">
        <div className="text-xs text-muted-foreground">
          Supported platforms: YouTube, Spotify
        </div>
      </CardFooter>
    </Card>
  )
} 
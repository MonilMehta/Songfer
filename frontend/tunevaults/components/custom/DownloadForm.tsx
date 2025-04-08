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
      const response = await apiCaller('songs/songs/download/', 'POST', { url })

      if (response && response.status === 200) {
        setSuccess('Song downloaded successfully!')
        setUrl('')
        
        // Create a song object from the response
        const songData = {
          id: response.data.id || Date.now(),
          title: response.data.title || 'Downloaded Song',
          artist: response.data.artist || 'Unknown Artist',
          album: response.data.album,
          duration: response.data.duration,
          cover_url: response.data.cover_url,
          download_url: response.data.download_url,
          download_date: new Date().toISOString()
        }
        
        // Call onDownload prop if provided
        if (onDownload) {
          onDownload(songData)
        }
      } else {
        throw new Error('Failed to download song')
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred')
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
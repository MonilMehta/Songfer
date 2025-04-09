import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Music, Youtube, ListMusic, Play, Save } from 'lucide-react'
import Image from 'next/image'

interface SongPreviewProps {
  title: string
  artist: string
  thumbnail: string
  platform: 'youtube' | 'spotify'
  isPlaylist?: boolean
  songCount?: number | string
  onDownload: () => void
  onPlay?: () => void
  isLoading?: boolean
  downloadProgress?: number
  downloadComplete?: boolean
  canPlay?: boolean
  url: string
}

export function SongPreview({
  title,
  artist,
  thumbnail,
  platform,
  isPlaylist = false,
  songCount,
  onDownload,
  onPlay,
  isLoading,
  downloadProgress = 0,
  downloadComplete = false,
  canPlay = false,
  url
}: SongPreviewProps) {
  // Use a default image if the thumbnail is unavailable
  const imageSrc = thumbnail || '/default-song-cover.jpg'
  
  return (
    <Card className="w-full max-w-md mx-auto overflow-hidden">
      <CardHeader className="space-y-2 p-4">
        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
          {platform === 'youtube' ? (
            <Image
              src={imageSrc}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 500px"
              priority
            />
          ) : (
            <img
              src={imageSrc}
              alt={title}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/20" />
          {platform === 'youtube' && (
            <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded">
              YouTube
            </div>
          )}
          {platform === 'spotify' && (
            <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
              Spotify
            </div>
          )}
          {isPlaylist && (
            <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded flex items-center">
              <ListMusic className="w-3 h-3 mr-1" />
              Playlist
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <h3 className="text-lg font-semibold line-clamp-2">{title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-1">{artist}</p>
        
        {isPlaylist && songCount && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{songCount}</span> songs
          </p>
        )}
        
        {isLoading && downloadProgress > 0 && (
          <div className="w-full h-2 bg-secondary mt-4 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-300" 
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          className="flex-1"
          onClick={onDownload}
          disabled={isLoading && !downloadComplete}
          variant={downloadComplete ? "secondary" : "default"}
        >
          {isLoading && !downloadComplete ? (
            'Downloading...'
          ) : downloadComplete ? (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save to Device
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Start Download
            </>
          )}
        </Button>
        
        {canPlay && onPlay && (
          <Button 
            variant="outline" 
            className="w-10 p-0"
            onClick={onPlay}
            title="Play audio"
          >
            <Play className="w-4 h-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
} 
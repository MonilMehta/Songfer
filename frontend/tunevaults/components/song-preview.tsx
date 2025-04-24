/* eslint-disable */
import { Card} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Play, Save, SearchIcon } from 'lucide-react'

import React from 'react'

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
  embedPlayer: React.ReactNode
  formatSelector: React.ReactNode
  downloadedFile: Blob | null
  disabled?: boolean
  isSearchQuery?: boolean // Added to identify search queries
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
  url,
  embedPlayer,
  formatSelector,
  downloadedFile,
  disabled = false,
  isSearchQuery = false // Default to false
}: SongPreviewProps) {
  const imageSrc = thumbnail || '/default-song-cover.jpg'
  
  const getProgressMessage = (progress: number) => {
    if (progress < 20) return "Finding the beats... 🎵"
    if (progress < 40) return "Mixing the magic... ✨"
    if (progress < 60) return "Tuning the melody... 🎶"
    if (progress < 80) return "Almost there... 🚀"
    if (progress < 100) return "Final touches... 💫"
    return "Ready to groove! 🎉"
  }
  
  return (
    <Card className="w-full max-w-xl mx-auto overflow-hidden shadow-lg border border-border">
      <div className="p-4 flex flex-col flex-grow">
        <div className="mb-3">
          {isSearchQuery ? (
            <div className="flex items-center gap-2 mb-1">
              <SearchIcon className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold line-clamp-2" title={title}>{title}</h3>
            </div>
          ) : (
            <h3 className="text-lg font-semibold line-clamp-2" title={title}>{title}</h3>
          )}
          <p className="text-sm text-muted-foreground line-clamp-1" title={artist}>{artist}</p>
          {isPlaylist && songCount && (
            <p className="text-xs text-muted-foreground mt-1">
              {typeof songCount === 'number' ? `${songCount} tracks` : songCount}
            </p>
          )}
        </div>
          
        <div className="mb-4">
          {isSearchQuery ? (
            <div className="w-full aspect-video flex items-center justify-center bg-secondary/10 rounded-md">
              <div className="text-center p-6">
                <SearchIcon className="w-12 h-12 text-primary/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Will search YouTube for the first result matching this query</p>
              </div>
            </div>
          ) : (
            embedPlayer
          )}
        </div>

        <div className="mb-4">
          {formatSelector}
        </div>

        <div className="flex-grow"></div>

        {isLoading && downloadProgress > 0 && !downloadComplete && (
          <div className="space-y-1 pt-2 mb-3">
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {getProgressMessage(downloadProgress)}
            </p>
          </div>
        )}

        <div className="flex gap-2 items-center">
          <Button
            className="flex-1 h-9 text-sm"
            onClick={onDownload}
            disabled={isLoading || (downloadComplete && !downloadedFile) || disabled}
            variant="default"
          >
            {isLoading && !downloadComplete ? (
              <>
                <span className="animate-spin mr-2">⏳</span> Downloading...
              </>
            ) : downloadComplete && downloadedFile ? (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save File
              </>
            ) : downloadComplete && !downloadedFile ? (
              <>
                <span className="animate-spin mr-2">⌛</span> Processing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {isSearchQuery ? "Search & Download" : "Download"}
              </>
            )}
          </Button>
          
          {onPlay && !isPlaylist && !isSearchQuery && (
            <Button 
              variant="outline" 
              className="w-9 h-9 p-0 flex-shrink-0"
              onClick={onPlay}
              title="Play Preview"
              disabled={isLoading || !canPlay}
            >
              <Play className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
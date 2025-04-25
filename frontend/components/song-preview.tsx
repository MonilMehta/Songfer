/* eslint-disable */
import { Card} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Play, Save, ChevronLeft, ChevronRight } from 'lucide-react'

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
  hasMultipleResults?: boolean  // Added to indicate if navigation should be shown
  onPrevious?: () => void       // Added for navigation
  onNext?: () => void           // Added for navigation
  resultsCount?: number         // Added to show total results count
  currentResultIndex?: number   // Added to show current position
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
  hasMultipleResults = false,
  onPrevious,
  onNext,
  resultsCount = 0,
  currentResultIndex = 0,
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
      {hasMultipleResults && (
        <div className="flex items-center justify-between bg-muted/30 p-2 border-b">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onPrevious}
            disabled={isLoading || !onPrevious}
            className="h-8 px-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          
          <span className="text-xs text-muted-foreground">
            Result {currentResultIndex + 1} of {resultsCount}
          </span>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onNext}
            disabled={isLoading || !onNext}
            className="h-8 px-2"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
      
      <div className="p-4 flex flex-col flex-grow">
        <div className="mb-3">
          <h3 className="text-lg font-semibold line-clamp-2" title={title}>{title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-1" title={artist}>{artist}</p>
          {isPlaylist && songCount && (
            <p className="text-xs text-muted-foreground mt-1">
              {typeof songCount === 'number' ? `${songCount} tracks` : songCount}
            </p>
          )}
        </div>
          
        <div className="mb-4">
          {embedPlayer}
        </div>

        <div className="mb-4">
          {formatSelector}
        </div>

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
                Download
              </>
            )}
          </Button>
          
          {onPlay && !isPlaylist && (
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
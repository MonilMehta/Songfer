import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Music, Youtube, ListMusic, Play, Save } from 'lucide-react'
import Image from 'next/image'
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
  downloadedFile
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
      <div className="md:flex">
        {/*Redundant code do not uncomment */}
        {/* <div className="md:w-1/3 md:flex-shrink-0">
           <div className="relative w-full aspect-square md:aspect-auto md:h-full overflow-hidden">
              <Image
                src={imageSrc}
                alt={title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                priority
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-song-cover.jpg'; (e.currentTarget as HTMLImageElement).srcset = ''; }}
              />
               <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
               <div className="absolute top-2 right-2 flex gap-1">
                 {platform === 'youtube' && (
                    <div className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                     <Youtube className="w-3 h-3" /> YouTube
                    </div>
                 )}
                 {platform === 'spotify' && (
                    <div className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                     <Music className="w-3 h-3" /> Spotify
                    </div>
                 )}
               </div>
              {isPlaylist && (
                <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                  <ListMusic className="w-3 h-3" />
                  Playlist {songCount ? `(${songCount})` : ''}
                </div>
              )}
           </div>
        </div> */}

        <div className="p-4 flex flex-col flex-grow">
           <div className="mb-3">
                <h3 className="text-lg font-semibold line-clamp-2" title={title}>{title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1" title={artist}>{artist}</p>
            </div>
            
           <div className="mb-4">
             {embedPlayer}
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
                disabled={isLoading || (downloadComplete && !downloadedFile)}
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
              
              {onPlay && (
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
      </div>
    </Card>
  )
} 
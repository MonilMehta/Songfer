import { Card, CardContent } from '@/components/ui/card'
import { CircularProgress } from '@/components/ui/circular-progress'
import { Download, Music } from 'lucide-react'

interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration: string
  thumbnail: string
  cover_url?: string
  download_url?: string
}

interface DownloadProgress {
  songId: string
  progress: number
  message?: string
}

interface SongCardProps {
  song: Song
  onDownload?: (songId: string) => void
  downloadProgress?: DownloadProgress
}

export function SongCard({ song, onDownload, downloadProgress }: SongCardProps) {
  const isDownloading = downloadProgress?.songId === song.id

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="relative aspect-square">
          <img
            src={song.thumbnail || song.cover_url}
            alt={song.title}
            className="object-cover w-full h-full"
          />
          {onDownload && (
            <button
              onClick={() => onDownload(song.id)}
              disabled={isDownloading}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
            >
              {isDownloading ? (
                <CircularProgress value={downloadProgress?.progress || 0} size="md" />
              ) : (
                <Download className="w-8 h-8 text-white" />
              )}
            </button>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold truncate">{song.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{song.artist}</p>
          {song.album && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{song.album}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">{song.duration}</p>
        </div>
      </CardContent>
    </Card>
  )
} 
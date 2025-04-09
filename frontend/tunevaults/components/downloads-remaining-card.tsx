import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CircularProgress } from '@/components/ui/circular-progress'
import { Download } from 'lucide-react'

interface DownloadsRemainingCardProps {
  downloadsRemaining: number
  totalDownloads: number | string
}

export function DownloadsRemainingCard({
  downloadsRemaining,
  totalDownloads
}: DownloadsRemainingCardProps) {
  const progress = Math.round((downloadsRemaining / totalDownloads) * 100)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Downloads Remaining</CardTitle>
        <Download className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center space-x-4">
          <CircularProgress value={progress} size="lg" />
          <div className="space-y-1">
            <p className="text-2xl font-bold">{downloadsRemaining}</p>
            <p className="text-xs text-muted-foreground">of {totalDownloads}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, Music, Music2, Music3, Music4 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface DownloadsRemainingCardProps {
  downloadsRemaining: number
  totalDownloads: number | string
  isPremium?: boolean
}

export function DownloadsRemainingCard({
  downloadsRemaining,
  totalDownloads,
  isPremium = false
}: DownloadsRemainingCardProps) {
  // Calculate progress percentage
  const progressPercentage = typeof totalDownloads === 'number' 
    ? Math.round((downloadsRemaining / totalDownloads) * 100) 
    : 100;
  
  // Determine which music icon to show based on remaining downloads
  const getMusicIcon = () => {
    if (isPremium) return <Music4 className="w-4 h-4 text-primary" />;
    if (downloadsRemaining > 7) return <Music className="w-4 h-4 text-primary" />;
    if (downloadsRemaining > 4) return <Music2 className="w-4 h-4 text-primary" />;
    if (downloadsRemaining > 1) return <Music3 className="w-4 h-4 text-primary" />;
    return <Download className="w-4 h-4 text-destructive" />;
  };

  return (
    <Card className="overflow-hidden border-l-4 border-l-primary">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">Downloads Remaining</CardTitle>
        {getMusicIcon()}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">{downloadsRemaining}</div>
            <div className="text-sm text-muted-foreground">of {totalDownloads}</div>
          </div>
          
          <Progress 
            value={progressPercentage} 
            className="h-2 bg-muted"
            indicatorClassName={isPremium ? "bg-gradient-to-r from-primary to-primary/80" : ""}
          />
          
          <p className="text-xs text-muted-foreground mt-1">
            {isPremium 
              ? "Unlimited downloads with Premium" 
              : downloadsRemaining === 0 
                ? "You've reached your download limit" 
                : `You can download ${downloadsRemaining} more songs today`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
} 
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

interface DownloadActivity {
  date: string
  downloads: number
  day_name: string
}

interface DownloadActivityCardProps {
  activityData?: number[]
  downloadActivity?: DownloadActivity[]
}

export function DownloadActivityCard({ 
  activityData = [0, 0, 0, 0, 0, 0, 0],
  downloadActivity = []
}: DownloadActivityCardProps) {
  const [barData, setBarData] = useState<number[]>([])
  const [dayLabels, setDayLabels] = useState<string[]>([])
  const [totalDownloads, setTotalDownloads] = useState(0)

  useEffect(() => {
    if (downloadActivity.length > 0) {
      // We have actual API data, use it
      const downloads = downloadActivity.map(item => item.downloads)
      const labels = downloadActivity.map(item => item.day_name.substring(0, 3))
      const total = downloadActivity.reduce((sum, item) => sum + item.downloads, 0)
      
      setBarData(downloads)
      setDayLabels(labels)
      setTotalDownloads(total)
    } else {
      // Fallback to the provided activity data
      setBarData(activityData)
      setDayLabels(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      setTotalDownloads(activityData.reduce((sum, count) => sum + count, 0))
    }
  }, [downloadActivity, activityData])
  
  // Get max value for scaling bars (minimum 1 to avoid division by zero)
  const maxActivity = Math.max(...barData, 1) 

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Download Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end h-20 gap-1 mb-2">
          {activityData.map((count, index) => (
            <div 
              key={index} 
              className="bg-primary/80 rounded-sm w-full"
              style={{ 
                height: `${(count / maxActivity) * 100}%`,
                minHeight: '4px'
              }}
            >
              {/* Tooltip showing day and count */}
              <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 
                              bg-black text-white text-xs py-1 px-2 rounded opacity-0 
                              group-hover:opacity-100 transition-opacity pointer-events-none">
                {dayLabels[index]}: {count}
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-between text-xs text-muted-foreground">
          {dayLabels.length > 1 && (
            <>
              <span>{dayLabels[0]}</span>
              <span>{dayLabels[dayLabels.length - 1]}</span>
            </>
          )}
        </div>
        
        <div className="mt-2 pt-2 border-t">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-red-500/10 p-1.5 rounded-full">
                <TrendingUp className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-sm">This Week</span>
            </div>
            <span className="text-lg font-semibold">
              {totalDownloads} songs
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
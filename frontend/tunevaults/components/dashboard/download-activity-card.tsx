'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DownloadActivity {
  date: string
  downloads: number
  day_name: string
}

interface DownloadActivityCardProps {
  activityData?: number[]
  downloadActivity?: DownloadActivity[]
  isLoading?: boolean
}

export function DownloadActivityCard({ 
  activityData = [0, 0, 0, 0, 0, 0, 0],
  downloadActivity = [],
  isLoading = false
}: DownloadActivityCardProps) {
  const [barData, setBarData] = useState<number[]>([])
  const [dayLabels, setDayLabels] = useState<string[]>([])
  const [totalDownloads, setTotalDownloads] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      if (downloadActivity.length > 0) {
        const downloads = downloadActivity.map(item => item.downloads)
        const labels = downloadActivity.map(item => item.day_name.substring(0, 3))
        const total = downloadActivity.reduce((sum, item) => sum + item.downloads, 0)
        
        setBarData(downloads)
        setDayLabels(labels)
        setTotalDownloads(total)
      } else {
        setBarData(activityData)
        setDayLabels(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
        setTotalDownloads(activityData.reduce((sum, count) => sum + count, 0))
      }
    } else {
        setBarData([]);
        setDayLabels(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
        setTotalDownloads(0);
    }
  }, [downloadActivity, activityData, isLoading])
  
  const maxActivity = Math.max(...barData, 1) 

  return (
    <Card className="shadow-sm h-full flex flex-col">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">Download Activity</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        {isLoading ? (
          <div className="flex flex-col flex-grow justify-between animate-pulse">
            <div className="flex items-end h-20 gap-1 mb-2 w-full px-1">
              {[...Array(7)].map((_, index) => (
                <div 
                  key={index} 
                  className="bg-muted rounded-t-sm w-full"
                  style={{ height: `${Math.floor(Math.random() * 50) + 20}%` }}
                />
              ))}
            </div>
            
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                <span key={index} className="text-center flex-1">{day}</span>
              ))}
            </div>
            
            <div className="mt-4 pt-3 border-t">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <div className="bg-muted h-7 w-7 rounded-full"></div>
                  <div className="bg-muted h-4 w-16 rounded"></div>
                </div>
                <div className="bg-muted h-6 w-12 rounded"></div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-end h-20 gap-1 mb-2">
                {barData.map((count, index) => (
                  <TooltipProvider key={index} delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="bg-primary/80 rounded-sm w-full hover:bg-primary transition-colors cursor-default"
                          style={{ 
                            height: `${(count / maxActivity) * 100}%`,
                            minHeight: '4px'
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{dayLabels[index]}: {count} download{count === 1 ? '' : 's'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
              
              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                {dayLabels.map((label, index) => (
                  <span key={index} className="text-center flex-1">{label}</span>
                ))}
              </div>
            </div>
            
            <div className="mt-4 pt-3 border-t">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  <span>This Week</span>
                </div>
                <span className="text-lg font-semibold">
                  {totalDownloads} songs
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
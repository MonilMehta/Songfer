'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'

interface DownloadActivityCardProps {
  activityData?: number[]
}

export function DownloadActivityCard({ 
  activityData = [0, 0, 0, 0, 0, 0, 0]
}: DownloadActivityCardProps) {
  // Get max value for scaling bars
  const maxActivity = Math.max(...activityData, 1); // Avoid division by zero
  
  // Calculate total downloads this week
  const totalWeekly = activityData.reduce((sum, count) => sum + count, 0);

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
            ></div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>7 days ago</span>
          <span>Today</span>
        </div>
        
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-red-500/10 p-1.5 rounded-full">
                <TrendingUp className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-sm">This Week</span>
            </div>
            <span className="text-lg font-semibold">
              {totalWeekly} songs
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
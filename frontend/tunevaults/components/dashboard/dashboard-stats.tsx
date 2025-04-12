'use client'

import { AccountStatusCard } from './account-status-card'
import { LibraryInsightsCard } from './library-insights-card'
import { DownloadActivityCard } from './download-activity-card'

interface UserStats {
  downloadsRemaining: number
  isPremium: boolean
  totalDownloads: number
  dailyDownloads: number
  dailyDownloadLimit: number
  genres?: { name: string, count: number }[]
  listeningTime?: number
  lastDownloadDate?: string
}

interface DashboardStatsProps {
  userStats: UserStats
  downloadActivityData: number[]
}

export function DashboardStats({ userStats, downloadActivityData }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <AccountStatusCard 
        isPremium={userStats.isPremium}
        downloadsRemaining={userStats.downloadsRemaining}
        dailyDownloadLimit={userStats.dailyDownloadLimit}
        dailyDownloads={userStats.dailyDownloads}
      />
      
      <LibraryInsightsCard 
        topGenre={userStats.genres?.[0]?.name || 'Hip Hop'}
        listeningTime={userStats.listeningTime || 0}
        lastDownloadDate={userStats.lastDownloadDate}
        totalDownloads={userStats.totalDownloads}
      />
      
      <DownloadActivityCard 
        activityData={downloadActivityData}
      />
    </div>
  )
} 
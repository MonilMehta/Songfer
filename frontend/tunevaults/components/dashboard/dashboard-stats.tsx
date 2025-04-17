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

interface DownloadActivity {
  date: string
  downloads: number
  day_name: string
}

interface GenreDistribution {
  genre: string
  count: number
}

interface CountryDistribution {
  country: string
  count: number
}

interface DashboardStatsProps {
  userStats: UserStats
  downloadActivityData: number[]
  downloadActivity?: DownloadActivity[]
  favoriteGenres?: GenreDistribution[]
  topCountries?: CountryDistribution[]
}

export function DashboardStats({ 
  userStats, 
  downloadActivityData,
  downloadActivity = [],
  favoriteGenres = [],
  topCountries = []
}: DashboardStatsProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          downloadActivity={downloadActivity}
        />
      </div>
    </div>
  )
} 
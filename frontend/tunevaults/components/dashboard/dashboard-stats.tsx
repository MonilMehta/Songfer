'use client'

import { AccountStatusCard } from './account-status-card'
import { LibraryInsightsCard } from './library-insights-card'
import { DownloadActivityCard } from './download-activity-card'
import { LayoutGrid } from 'lucide-react'

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
  isLoading?: boolean
}

export function DashboardStats({ 
  userStats, 
  downloadActivityData,
  downloadActivity = [],
  isLoading = false
}: DashboardStatsProps) {
  return (
    <div className="space-y-4 relative overflow-hidden">
      <div className="absolute -z-10 -left-10 -top-10 w-40 h-40 bg-green-500/5 rounded-full blur-3xl opacity-60" />
      <div className="absolute -z-10 -right-10 -bottom-20 w-52 h-52 bg-orange-500/5 rounded-full blur-3xl opacity-60" />
      
      <div className="mb-1 px-2 md:mb-3">
        <h2 className="text-3xl font-black flex items-center"> 
          <LayoutGrid className="w-7 h-7 text-primary mr-3 inline-block transform -rotate-6" />
          <span className="inline-block transform rotate-1 text-primary mr-2">DASHBOARD</span>
          <span className="inline-block transform -rotate-2">OVERVIEW</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
          isLoading={isLoading}
        />
      </div>
    </div>
  )
} 
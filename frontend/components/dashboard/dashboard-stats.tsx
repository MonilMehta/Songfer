'use client'

import { AccountStatusCard } from './account-status-card'
import { LibraryInsightsCard } from './library-insights-card'
import { DownloadActivityCard } from './download-activity-card'
import { LayoutGrid } from 'lucide-react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel" // Import carousel components

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
    <div className="space-y-6 relative overflow-hidden"> {/* Increased spacing */}
      <div className="absolute -z-10 -left-10 -top-10 w-40 h-40 bg-green-500/5 rounded-full blur-3xl opacity-60" />
      <div className="absolute -z-10 -right-10 -bottom-20 w-52 h-52 bg-orange-500/5 rounded-full blur-3xl opacity-60" />
      
      <div className="mb-1 px-2 md:mb-3">
        {/* Use responsive text size - Adjusted transforms */}
        <h2 className="text-2xl sm:text-3xl font-black flex items-center"> 
          <LayoutGrid className="w-6 h-6 sm:w-7 sm:h-7 text-primary mr-2 sm:mr-3 inline-block transform -rotate-3" />
          <span className="inline-block transform rotate-1 text-primary mr-1 sm:mr-2">DASHBOARD</span>
          <span className="inline-block transform -rotate-1">OVERVIEW</span>
        </h2>
      </div>

      {/* Grid for medium screens and up */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Added hover effect wrappers */}
        <div className="transition-transform duration-300 ease-out hover:scale-[1.02]">
          <AccountStatusCard 
            isPremium={userStats.isPremium}
            dailyDownloadLimit={userStats.dailyDownloadLimit}
            dailyDownloads={userStats.dailyDownloads}
          />
        </div>
        <div className="transition-transform duration-300 ease-out hover:scale-[1.02]">
          <LibraryInsightsCard 
            topGenre={userStats.genres?.[0]?.name || 'Hip Hop'}
            listeningTime={userStats.listeningTime || 0}
            lastDownloadDate={userStats.lastDownloadDate}
            totalDownloads={userStats.totalDownloads}
          />
        </div>
        <div className="transition-transform duration-300 ease-out hover:scale-[1.02]">
          <DownloadActivityCard 
            activityData={downloadActivityData}
            downloadActivity={downloadActivity}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Carousel for small screens */}
      <div className="block md:hidden">
        <Carousel
          opts={{
            align: "start",
            loop: false, // Loop might be less intuitive for stats cards
          }}
          className="w-full max-w-xs mx-auto sm:max-w-sm" // Adjust max-width as needed
        >
          <CarouselContent className="-ml-4"> {/* Adjust margin for item spacing */}
            <CarouselItem className="pl-4"> {/* Add padding for spacing */}
              <AccountStatusCard 
                isPremium={userStats.isPremium}
                dailyDownloadLimit={userStats.dailyDownloadLimit}
                dailyDownloads={userStats.dailyDownloads}
              />
            </CarouselItem>
            <CarouselItem className="pl-4"> {/* Add padding for spacing */}
              <LibraryInsightsCard 
                topGenre={userStats.genres?.[0]?.name || 'Hip Hop'}
                listeningTime={userStats.listeningTime || 0}
                lastDownloadDate={userStats.lastDownloadDate}
                totalDownloads={userStats.totalDownloads}
              />
            </CarouselItem>
            <CarouselItem className="pl-4"> {/* Add padding for spacing */}
              <DownloadActivityCard 
                activityData={downloadActivityData}
                downloadActivity={downloadActivity}
                isLoading={isLoading}
              />
            </CarouselItem>
          </CarouselContent>
          {/* Adjusted positioning for carousel controls */}
          <CarouselPrevious className="absolute left-[-12px] top-1/2 -translate-y-1/2 z-10" />
          <CarouselNext className="absolute right-[-12px] top-1/2 -translate-y-1/2 z-10" />
        </Carousel>
      </div>
    </div>
  )
}
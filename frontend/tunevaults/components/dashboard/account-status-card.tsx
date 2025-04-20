'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useUserProfile } from '@/context/UserProfileContext'
import { Skeleton } from '@/components/ui/skeleton'

// Keep the props interface for backward compatibility
interface AccountStatusCardProps {
  isPremium?: boolean
  downloadsRemaining?: number
  dailyDownloadLimit?: number
  dailyDownloads?: number
}

export function AccountStatusCard({
  // Default values will be overridden by context data
  isPremium: propIsPremium,
  downloadsRemaining: propDownloadsRemaining,
  dailyDownloadLimit: propDailyDownloadLimit = 15,
  dailyDownloads: propDailyDownloads
}: AccountStatusCardProps) {
  // Get data from context
  const { userProfile, isLoading } = useUserProfile()
  
  // Use context data if available, otherwise fall back to props
  const isPremium = userProfile?.is_premium ?? propIsPremium ?? false
  const downloadsRemaining = userProfile?.downloads_remaining ?? propDownloadsRemaining ?? 0
  const dailyDownloads = userProfile?.total_downloads_today ?? propDailyDownloads ?? 0
  
  // Free users have a daily limit (default 15), premium users have higher or no limit
  const dailyDownloadLimit = isPremium ? 50 : (propDailyDownloadLimit ?? 15)
  
  // Calculate daily download progress percentage
  const dailyDownloadProgress = Math.min(100, (dailyDownloads / dailyDownloadLimit) * 100)

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="w-full">
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <Skeleton className="h-2 w-full mt-6 mb-2" />
          <Skeleton className="h-8 w-full mt-4" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Account Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M19.7698 4.97969L11.8094 2.44686C11.57 2.37306 11.3153 2.33514 11.059 2.33514C10.8028 2.33514 10.548 2.37306 10.3086 2.44686L2.34822 4.97969C1.85748 5.14469 1.5 5.61381 1.5 6.14028V16.0453C1.5 16.4702 1.72566 16.8594 2.09203 17.0828L10.0524 22.0391C10.3501 22.218 10.7048 22.3125 11.067 22.3125C11.4293 22.3125 11.784 22.218 12.0817 22.0391L20.042 17.0828C20.4084 16.8594 20.634 16.4702 20.634 16.0453V6.14028C20.625 5.62283 20.2675 5.14469 19.7698 4.97969Z"/>
              <circle cx="11.25" cy="10.5" r="3.75"/>
            </svg>
          </div>
          <div>
            <div className="text-xl font-semibold">{isPremium ? 'Premium' : 'Free Account'}</div>
            <p className="text-sm text-muted-foreground">
              {downloadsRemaining} of {dailyDownloadLimit} downloads remaining
            </p>
          </div>
        </div>
        
        <div className="mt-12">
          <div className="flex justify-between text-xs mb-1">
            <span>Daily Usage</span>
            <span>{Math.round(dailyDownloadProgress)}%</span>
          </div>
          <Progress value={dailyDownloadProgress} className="h-2" />
        </div>
        
        {!isPremium && (
          <Button className="w-full mt-4 text-xs h-8 bg-primary hover:bg-primary/90" asChild>
            <Link href="/pricing">Upgrade to Premium</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
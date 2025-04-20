/* eslint-disable */
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Calendar, Disc, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { useUserProfile } from '@/context/UserProfileContext'
import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface LibraryInsightsCardProps {
  // These props are now optional since we can get data from context
  topGenre?: string
  listeningTime?: number
  lastDownloadDate?: string
  totalDownloads?: number
}

export function LibraryInsightsCard({
  topGenre,
  listeningTime = 0,
  lastDownloadDate,
  totalDownloads
}: LibraryInsightsCardProps) {
  // Get user data from context
  const { userProfile, isLoading } = useUserProfile()
  
  // Calculate user's top genre from recent songs
  const calculateTopGenre = () => {
    // If no user profile or no recent songs, return default or provided top genre
    if (!userProfile || !userProfile.recent_songs || userProfile.recent_songs.length === 0) {
      return topGenre || 'Unknown';
    }
    
    // In a real app, you would analyze the songs collection to determine the top genre
    // This would likely come from an API endpoint that has this information
    // For demo purposes, we'll return Pop or Rock based on song count
    return userProfile.total_songs_downloaded > 5 ? 'Pop' : 'Rock';
  };
  
  // Format methods
  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatDateFromNow = (dateString?: string) => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Determine actual values based on context and props
  const displayTopGenre = topGenre || calculateTopGenre();
  const displayTotalDownloads = totalDownloads !== undefined ? 
    totalDownloads : 
    (userProfile?.total_songs_downloaded || 0);
  const displayLastDownloadDate = lastDownloadDate || userProfile?.last_download;

  // Show skeleton loading state when data is loading
  if (isLoading) {
    return (
      <Card className="shadow-sm h-full flex flex-col">
        <CardHeader className="pb-2 pt-4">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-between pt-2">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between py-1">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                {index < 2 && <Skeleton className="h-px w-full my-3" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm h-full flex flex-col bg-gradient-to-br from-card via-card/95 to-card/90 dark:from-card dark:via-card/98 dark:to-card/95">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">Library Insights</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between pt-2">
        <div className="space-y-3">
          {/* Top Genre */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 text-sm">
              <div className="bg-blue-500/10 p-1.5 rounded-full flex-shrink-0">
                <BarChart3 className="w-4 h-4 text-blue-500" />
              </div>
              <span>Top Genre</span>
            </div>
            <Badge variant="secondary" className="font-medium text-xs px-2 py-0.5">
              {displayTopGenre}
            </Badge>
          </div>
          
          <Separator className="my-1 bg-border/50" />
          
          {/* Collection Size */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 text-sm">
              <div className="bg-amber-500/10 p-1.5 rounded-full flex-shrink-0">
                <Disc className="w-4 h-4 text-amber-500" />
              </div>
              <span>Collection Size</span>
            </div>
            <span className="text-sm font-semibold">
              {displayTotalDownloads} song{displayTotalDownloads !== 1 ? 's' : ''}
            </span>
          </div>
          
          <Separator className="my-1 bg-border/50" />
          
          {/* Last Download - with Tooltip for exact date */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 text-sm">
              <div className="bg-purple-500/10 p-1.5 rounded-full flex-shrink-0">
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
              <span>Last Download</span>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm font-semibold cursor-default">
                    {formatDateFromNow(displayLastDownloadDate)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{formatDate(displayLastDownloadDate)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
       

        </div>
      </CardContent>
    </Card>
  )
}
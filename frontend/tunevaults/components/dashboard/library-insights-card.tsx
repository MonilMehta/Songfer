'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Calendar, Disc, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface LibraryInsightsCardProps {
  topGenre: string
  listeningTime: number
  lastDownloadDate?: string
  totalDownloads: number
}

export function LibraryInsightsCard({
  topGenre = 'Hip Hop',
  listeningTime = 0,
  lastDownloadDate,
  totalDownloads = 0
}: LibraryInsightsCardProps) {
  // Helper functions
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

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-1 pt-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Library Insights</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          {/* Top Genre */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500/10 p-1.5 rounded-full">
                <BarChart3 className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-sm">Top Genre</span>
            </div>
            <Badge variant="outline" className="font-normal">
              {topGenre}
            </Badge>
          </div>
          
          {/* Last Download */}
          
          
          {/* Collection Size and Listening Time */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="border rounded-lg p-2">
              <div className="flex items-center gap-2 mb-0">
                <div className="bg-amber-500/10 p-1.5 rounded-full">
                  <Disc className="w-4 h-4 text-amber-500" />
                </div>
                <span className="text-sm">Collection</span>
              </div>
              <div className="text-md font-semibold pl-8">
                {totalDownloads} songs
              </div>
            </div>
            
            <div className="border rounded-lg p-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-purple-500/10 p-1.5 rounded-full">
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
              <span className="font-medium text-sm">Last Download</span>
            </div>
            <div className="pl-8">
              <div className="text-md font-semibold">
                {formatDateFromNow(lastDownloadDate)}
              </div>
             
            </div>
          </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
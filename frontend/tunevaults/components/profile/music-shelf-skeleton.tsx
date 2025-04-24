/* eslint-disable */
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export function MusicShelfSkeleton({ itemCount = 5 }) {
  return (
    <div className="w-full">
      {/* Header with tabs skeleton */}
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-36 rounded-md" /> {/* Adjusted to match TabsList style */}
      </div>
      
      {/* Items skeleton */}
      <div className="grid grid-cols-1 gap-4">
        {Array(itemCount).fill(0).map((_, i) => (
          <Card key={i} className="w-full">
            <div className="flex items-center p-4">
              <Skeleton className="h-12 w-12 rounded-md mr-4" />
              <div className="flex-grow">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              {/* Optional: Add skeleton for action buttons if MusicShelf has them */}
              {/* <Skeleton className="h-8 w-8 rounded-full ml-2" /> */}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
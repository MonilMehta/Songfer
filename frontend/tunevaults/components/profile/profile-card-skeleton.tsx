/* eslint-disable */
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Download, Music, ListMusic, Crown, Tags } from 'lucide-react'

export function ProfileCardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center pt-24 pb-10">
      <div className="relative flex flex-col items-center w-full max-w-2xl rounded-2xl bg-background shadow-xl border border-border/30 p-0 overflow-hidden">
        {/* Cover image background skeleton */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-r from-violet-600/20 via-indigo-500/20 to-purple-500/20 overflow-hidden">
          <Skeleton className="h-full w-full opacity-50" />
        </div>
        
        <div className="relative z-10 flex flex-col items-center w-full mt-16">
          {/* Avatar skeleton */}
          <div className="mb-4">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
          
          {/* Username and badges skeleton */}
          <Skeleton className="h-8 w-48 mb-1" />
          <div className="flex flex-wrap gap-2 mb-2 justify-center">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
          </div>
          
          {/* Email skeleton */}
          <Skeleton className="h-4 w-40 mb-4" />
          
          {/* Stats skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-6 w-full px-8">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          
          {/* Logout button skeleton */}
          <div className="w-full px-8 mb-6">
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
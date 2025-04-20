/* eslint-disable */
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Music, Download, Clock, Crown } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  description?: string
}

export default function StatsCard({ title, value, icon, description }: StatsCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function DownloadsRemainingCard({ downloadsRemaining, isPremium }: { downloadsRemaining: number, isPremium: boolean }) {
  return (
    <Card className="overflow-hidden border-2 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Downloads Remaining
        </CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Download className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{downloadsRemaining}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {isPremium 
            ? "Premium users get 50 downloads daily" 
            : "Free users get 10 downloads daily"}
        </p>
      </CardContent>
    </Card>
  )
}

export function PremiumBadge({ isPremium }: { isPremium: boolean }) {
  return (
    <Card className={`overflow-hidden ${isPremium ? 'border-2 border-amber-500/50' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Account Type
        </CardTitle>
        <div className={`h-8 w-8 rounded-full ${isPremium ? 'bg-amber-500/20' : 'bg-muted'} flex items-center justify-center`}>
          <Crown className={`h-4 w-4 ${isPremium ? 'text-amber-500' : 'text-muted-foreground'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{isPremium ? 'Premium' : 'Free'}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {isPremium 
            ? "Enjoy unlimited downloads and premium features" 
            : "Upgrade to premium for more downloads"}
        </p>
      </CardContent>
    </Card>
  )
} 
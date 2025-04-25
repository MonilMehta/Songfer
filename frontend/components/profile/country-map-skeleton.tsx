/* eslint-disable */
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MapPin } from 'lucide-react'

export function CountryMapSkeleton() {
  return (
    <Card className="h-full shadow-md border-border/10 bg-card/90 backdrop-blur-sm min-h-[350px]">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <MapPin className="mr-2 h-5 w-5 text-primary" /> 
          Your Music Origins
        </CardTitle>
        <CardDescription>Countries based on your downloaded music.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-center p-6 h-[250px]">
        <Skeleton className="h-full w-full rounded-md" />
      </CardContent>
    </Card>
  )
}
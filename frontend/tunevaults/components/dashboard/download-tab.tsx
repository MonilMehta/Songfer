'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Headphones } from 'lucide-react'
import { DownloadForm } from '@/components/download-form'

interface DownloadTabProps {
  onDownload: (url: string, format: string) => void
  isLoading: boolean
  isDownloading: boolean
  isPremium: boolean
}

export function DownloadTab({ 
  onDownload, 
  isLoading, 
  isDownloading, 
  isPremium 
}: DownloadTabProps) {
  return (
    <Card className="border-t-4 border-t-primary shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-xl">
          <Headphones className="w-5 h-5 mr-2 text-primary" />
          Download Music
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DownloadForm 
          onDownload={onDownload}
          isLoading={isLoading || isDownloading}
          isPremium={isPremium}
        />
      </CardContent>
    </Card>
  )
} 
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Headphones } from 'lucide-react'
import { DownloadForm } from '@/components/download-form'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

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
  const { toast } = useToast();
  const [errorState, setErrorState] = useState<string | null>(null);

  const handleDownloadWithErrorHandling = (url: string, format: string) => {
    setErrorState(null);
    try {
      onDownload(url, format);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setErrorState(errorMessage);
      toast({
        title: "Download Error",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="border-t-4 border-t-primary shadow-lg bg-card my-8">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center text-xl md:text-2xl">
          <Headphones className="w-6 h-6 mr-3 text-primary" />
          Download Your Music
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <DownloadForm 
          onDownload={handleDownloadWithErrorHandling}
          isLoading={isLoading || isDownloading}
          isPremium={isPremium}
        />
        
        {errorState && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/30">
            {errorState}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 
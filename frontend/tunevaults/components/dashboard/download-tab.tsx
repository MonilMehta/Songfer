'use client'

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Headphones, Download, Music } from 'lucide-react'
import { DownloadForm } from '@/components/download-form'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'

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
    <Card className="border shadow-md bg-card/60 backdrop-blur-sm my-8 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/30 via-primary to-primary/30"></div>
      
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-xl md:text-2xl font-medium">
            <div className="bg-primary/10 p-2 rounded-full mr-3">
              <Headphones className="w-5 h-5 text-primary" />
            </div>
            Music Downloader
          </CardTitle>
          {isPremium && (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Premium
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-6 pt-5">
        <p className="text-sm text-muted-foreground mb-4">
          Download high-quality audio from YouTube and Spotify links in seconds.
        </p>
        
        <div className="bg-accent/30 rounded-md p-5 border border-accent/40">
          <DownloadForm 
            onDownload={handleDownloadWithErrorHandling}
            isLoading={isLoading || isDownloading}
            isPremium={isPremium}
          />
        </div>
        
        {errorState && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/30 flex items-start">
            <Download className="w-4 h-4 mr-2 mt-0.5 stroke-destructive" />
            {errorState}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="border-t border-border/40 bg-muted/40 px-6 py-3 text-xs text-muted-foreground flex flex-wrap justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center">
            <Music className="w-3.5 h-3.5 mr-1.5 text-primary" />
            High Quality Audio
          </span>
          <span>MP3, FLAC, WAV</span>
        </div>
        {!isPremium && (
          <span className="text-primary text-xs mt-2 sm:mt-0">
            Upgrade for unlimited downloads
          </span>
        )}
      </CardFooter>
    </Card>
  )
} 
/* eslint-disable */
'use client'

import { useState } from 'react'
import { Headphones, Music, Download, Shield, Zap, Tag, Info } from 'lucide-react'
import { DownloadForm } from '@/components/download-form'
import { useToast } from '@/hooks/use-toast'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { useUserProfile } from '@/context/UserProfileContext'

interface DownloadTabProps {
  onDownload: (url: string, format: string) => void
  isLoading: boolean
  isDownloading: boolean
  isPremium?: boolean  // Make this optional since we'll get it from context
}

export function DownloadTab({ 
  onDownload, 
  isLoading, 
  isDownloading,
  isPremium: propIsPremium
}: DownloadTabProps) {
  const { toast } = useToast();
  const [errorState, setErrorState] = useState<string | null>(null);
  const { userProfile, updateDownloadsCount } = useUserProfile();
  
  // Use context data if available, otherwise fall back to props
  const isPremium = userProfile?.is_premium ?? propIsPremium ?? false;

  const handleDownloadWithErrorHandling = (url: string, format: string) => {
    setErrorState(null);
    try {
      // Call the provided onDownload function
      onDownload(url, format);
      
      // Update download count in our context without making an API call
      updateDownloadsCount(true);
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
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="my-4 p-6 md:p-8 bg-gradient-to-br from-card via-card/90 to-background/80 rounded-2xl shadow-xl border border-border/10 relative overflow-hidden"
    >
      {/* Adjust background elements for consistency */}
      <div className="absolute -z-10 -left-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl opacity-60" />
      <div className="absolute -z-10 -right-10 -bottom-10 w-52 h-52 bg-secondary/5 rounded-full blur-3xl opacity-60" />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4"> 
          <div className="flex items-center gap-3">
            <div>
              {/* Funky Title with responsive size */}
              <h2 className="text-2xl sm:text-3xl font-black flex items-center"> 
                <Headphones className="w-6 h-6 sm:w-7 sm:h-7 text-primary mr-2 sm:mr-3 inline-block transform -rotate-3" />
                <span className="inline-block transform rotate-1 text-primary mr-1 sm:mr-2">START</span>
                <span className="inline-block transform -rotate-1 mr-1 sm:mr-2">YOUR</span>
                <span className="inline-block transform rotate-1">DOWNLOAD</span>
              </h2>
              {/* Adjust margin for subtitle */}
              <p className="text-sm text-muted-foreground mt-2 ml-8 sm:ml-10">Paste a YouTube or Spotify link below.</p>
            </div>
          </div>
          {isPremium && (
            <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary font-medium py-1 px-3 rounded-full flex-shrink-0">
              <Shield className="w-3.5 h-3.5 mr-1.5" />
              Premium Active
            </Badge>
          )}
        </div>
        
        {/* Form */}
        <div className="mb-8 bg-background/50 backdrop-blur-sm p-5 rounded-xl border border-border/10 shadow-inner">
          <DownloadForm 
            onDownload={handleDownloadWithErrorHandling}
            isLoading={isLoading || isDownloading}
            isPremium={isPremium}
          />
        </div>
        
        {/* Error Message */}
        {errorState && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 flex items-start gap-3"
          >
            <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <span>{errorState}</span>
          </motion.div>
        )}
        
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[ 
            { icon: Music, title: "Studio Quality", desc: "Up to 320kbps MP3, FLAC & WAV" },
            { icon: Zap, title: "Lightning Fast", desc: "Downloads under 30 seconds" },
            { icon: Tag, title: "Complete Metadata", desc: "Album art, artist & track details" }
          ].map((feature, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * index }}
              className="flex items-start space-x-3 p-4 rounded-lg bg-accent/50 border border-border/5 hover:bg-accent/70 hover:border-border/10 transition-colors group"
            >
              <div className="bg-primary/10 p-2 rounded-full mt-1 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-sm text-foreground">{feature.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
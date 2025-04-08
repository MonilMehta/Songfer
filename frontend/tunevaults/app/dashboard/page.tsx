'use client'

import { useEffect, useState } from 'react'
import apiCaller from '@/utils/apiCaller'
import SongCard from '@/components/custom/SongCard'
import DownloadForm from '@/components/custom/DownloadForm'
import { DownloadsRemainingCard, PremiumBadge } from '@/components/custom/StatsCard'
import { Music, Download, Clock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PricingSectionDemo } from '@/components/blocks/pricing-section-demo'

interface Song {
  id: number
  title: string
  artist: string
  album?: string
  duration?: string
  cover_url?: string
  download_url?: string
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [downloadsRemaining, setDownloadsRemaining] = useState(10)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch songs
        const songsResponse = await apiCaller('songs/', 'GET')
        if (songsResponse && songsResponse.status === 200) {
          setSongs(songsResponse.data)
        }

        // Check premium status
        const isPremiumUser = localStorage.getItem('isPremium') === 'true'
        setIsPremium(isPremiumUser)
        
        // Set downloads remaining based on premium status
        setDownloadsRemaining(isPremiumUser ? 50 : 10)
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <DownloadsRemainingCard 
          downloadsRemaining={downloadsRemaining} 
          isPremium={isPremium} 
        />
        <PremiumBadge isPremium={isPremium} />
      </div>

      <Tabs defaultValue="songs" className="mb-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="songs">My Songs</TabsTrigger>
          <TabsTrigger value="download">Download</TabsTrigger>
        </TabsList>
        <TabsContent value="songs" className="mt-6">
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {songs.map((song) => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Music className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No songs yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Download your first song to get started
              </p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="download" className="mt-6">
          <div className="max-w-md mx-auto">
            <DownloadForm />
          </div>
        </TabsContent>
      </Tabs>

      {!isPremium && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Upgrade to Premium</h2>
          <PricingSectionDemo />
        </div>
      )}
    </div>
  )
}


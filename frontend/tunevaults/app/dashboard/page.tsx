'use client'

import { useEffect, useState } from 'react'
import apiCaller from '@/utils/apiCaller'
import SongCard from '@/components/custom/SongCard'
import DownloadForm from '@/components/custom/DownloadForm'
import { DownloadsRemainingCard, PremiumBadge } from '@/components/custom/StatsCard'
import { Music, Download, Clock, DollarSign, Sparkles } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface Song {
  id: number
  title: string
  artist: string
  album?: string
  duration?: string
  cover_url?: string
  download_url?: string
  download_date?: string
}

interface UserStats {
  downloadsRemaining: number
  isPremium: boolean
  totalDownloads: number
  savingsAmount: number
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [recommendations, setRecommendations] = useState<Song[]>([])
  const [activeDownloads, setActiveDownloads] = useState<Song[]>([])
  const [userStats, setUserStats] = useState<UserStats>({
    downloadsRemaining: 10,
    isPremium: false,
    totalDownloads: 0,
    savingsAmount: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user stats
        const isPremiumUser = localStorage.getItem('isPremium') === 'true'
        setUserStats({
          downloadsRemaining: isPremiumUser ? 50 : 10,
          isPremium: isPremiumUser,
          totalDownloads: 5,
          savingsAmount: 25
        })

        // Fetch downloaded songs
        const songsResponse = await apiCaller('songs/', 'GET')
        if (songsResponse && songsResponse.status === 200) {
          setSongs(songsResponse.data)
        }

        // Mock recommendations data
        setRecommendations([
          {
            id: 101,
            title: "Recommended Song 1",
            artist: "Artist 1",
            cover_url: "https://via.placeholder.com/150"
          },
          {
            id: 102,
            title: "Recommended Song 2",
            artist: "Artist 2",
            cover_url: "https://via.placeholder.com/150"
          }
        ])
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleDownload = (song: Song) => {
    setActiveDownloads(prev => [...prev, song])
    
    setTimeout(() => {
      setActiveDownloads(prev => prev.filter(s => s.id !== song.id))
      setSongs(prev => [song, ...prev])
      
      setUserStats(prev => ({
        ...prev,
        downloadsRemaining: prev.downloadsRemaining - 1,
        totalDownloads: prev.totalDownloads + 1,
        savingsAmount: prev.savingsAmount + 5
      }))
    }, 3000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 text-primary">Dashboard</h1>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-card/50 backdrop-blur-sm">
            <DownloadsRemainingCard 
              downloadsRemaining={userStats.downloadsRemaining} 
              isPremium={userStats.isPremium} 
            />
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <PremiumBadge isPremium={userStats.isPremium} />
          </Card>
          
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Songs Downloaded</CardTitle>
              <Music className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.totalDownloads}</div>
              <p className="text-xs text-muted-foreground">
                Total songs in your library
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Money Saved</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${userStats.savingsAmount}</div>
              <p className="text-xs text-muted-foreground">
                Estimated savings from downloads
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Download Form */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Download New Songs</h2>
          <Card className="bg-card/50 backdrop-blur-sm">
            <DownloadForm onDownload={handleDownload} />
          </Card>
        </div>
        
        {/* Active Downloads */}
        <AnimatePresence>
          {activeDownloads.length > 0 && (
            <motion.div 
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h2 className="text-2xl font-bold mb-4">Active Downloads</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {activeDownloads.map((song) => (
                  <div key={song.id} className="relative">
                    <SongCard song={song} />
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-lg">
                      <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto mb-2"></div>
                        <p>Downloading...</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Recommendations */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Recommendations</h2>
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 mr-2" />
              More
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {recommendations.map((song) => (
              <SongCard key={song.id} song={song} onDownload={() => handleDownload(song)} />
            ))}
          </div>
        </div>
        
        {/* Downloaded Songs */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">My Downloads</h2>
            <Button variant="outline" size="sm">
              <Music className="h-4 w-4 mr-2" />
              View All
            </Button>
          </div>
          {songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {songs.map((song) => (
                <SongCard key={song.id} song={song} />
              ))}
            </div>
          ) : (
            <Card className="bg-card/50 backdrop-blur-sm">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Music className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No songs yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Download your first song to get started
                </p>
              </div>
            </Card>
          )}
        </div>
        
        {/* Upgrade Banner */}
        {!userStats.isPremium && (
          <Card className="mb-8 bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex flex-col md:flex-row items-center justify-between p-6">
              <div>
                <h3 className="text-xl font-bold">Upgrade to Premium</h3>
                <p className="text-muted-foreground mt-1">
                  Get unlimited downloads and exclusive features
                </p>
              </div>
              <Link href="/pricing" className="mt-4 md:mt-0">
                <Button>
                  View Plans
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}


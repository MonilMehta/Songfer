'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SongCard } from '@/components/song-card'
import { DownloadForm } from '@/components/download-form'
import { Music, Download, History, Headphones, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { motion, AnimatePresence } from 'framer-motion'

interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration: string
  thumbnail: string
  cover_url?: string
  download_url?: string
}

interface UserStats {
  downloadsRemaining: number
  isPremium: boolean
  totalDownloads: number
  dailyDownloads: number
  dailyDownloadLimit: number
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [recommendations, setRecommendations] = useState<Song[]>([])
  const [topArtists, setTopArtists] = useState<{name: string, count: number}[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [userStats, setUserStats] = useState<UserStats>({
    downloadsRemaining: 10,
    isPremium: false,
    totalDownloads: 0,
    dailyDownloads: 0,
    dailyDownloadLimit: 10
  })
  const { toast } = useToast()

  useEffect(() => {
    // Fetch user's downloaded songs, recommendations and stats
    const fetchUserData = async () => {
      try {
        setIsLoading(true);
        
        const token = localStorage.getItem('token');
        if (!token) {
          console.error("No authentication token found");
          toast({
            title: "Authentication Error",
            description: "Please log in again to access your data",
            variant: "destructive"
          });
          return;
        }
        
        const authHeaders = {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        };
        
        // Fetch downloaded songs
        const songsResponse = await fetch('http://localhost:8000/api/songs/', {
          headers: authHeaders
        });
        
        if (!songsResponse.ok) throw new Error('Failed to fetch songs');
        const songsData = await songsResponse.json();
        setSongs(songsData);
        
        // Fetch recommendations
        try {
          const recommendationsResponse = await fetch('http://localhost:8000/api/songs/recommendations/', {
            headers: authHeaders
          });
          
          if (recommendationsResponse.ok) {
            const recommendationsData = await recommendationsResponse.json();
            setRecommendations(recommendationsData);
          }
        } catch (error) {
          console.error("Error fetching recommendations:", error);
        }
        
        // Fetch top artists
        try {
          const topArtistsResponse = await fetch('http://localhost:8000/api/songs/user/top-artists/', {
            headers: authHeaders
          });
          
          if (topArtistsResponse.ok) {
            const topArtistsData = await topArtistsResponse.json();
            setTopArtists(topArtistsData);
          }
        } catch (error) {
          console.error("Error fetching top artists:", error);
        }
        
        // In a real app, you would fetch user stats from your backend
        setUserStats({
          downloadsRemaining: 10,
          isPremium: false,
          totalDownloads: songsData.length || 0,
          dailyDownloads: 3, // Example value
          dailyDownloadLimit: 10
        });
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [toast]);

  const handleDownload = async (url: string, format: string) => {
    console.log(`Dashboard handling download for: ${url} with format: ${format}`);
    
    setIsDownloading(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch('http://localhost:8000/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url, format }),
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      toast({
        title: "Download Successful",
        description: "Your song has been added to your library",
      });
      
      setUserStats(prev => ({
        ...prev,
        downloadsRemaining: Math.max(0, prev.downloadsRemaining - 1),
        totalDownloads: prev.totalDownloads + 1,
        dailyDownloads: prev.dailyDownloads + 1
      }));
      
      fetchSongs();
      
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchSongs = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const response = await fetch('http://localhost:8000/api/songs/', {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSongs(data);
      }
    } catch (error) {
      console.error("Error fetching songs:", error);
    }
  };

  // Calculate daily download progress percentage
  const dailyDownloadProgress = Math.min(100, (userStats.dailyDownloads / userStats.dailyDownloadLimit) * 100);

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Premium Status Card */}
        {!userStats.isPremium && (
          <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="bg-primary/10 p-2 rounded-full">
                  <svg className="h-5 w-5 text-primary" fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24">
                    <path d="M19.7698 4.97969L11.8094 2.44686C11.57 2.37306 11.3153 2.33514 11.059 2.33514C10.8028 2.33514 10.548 2.37306 10.3086 2.44686L2.34822 4.97969C1.85748 5.14469 1.5 5.61381 1.5 6.14028V16.0453C1.5 16.4702 1.72566 16.8594 2.09203 17.0828L10.0524 22.0391C10.3501 22.218 10.7048 22.3125 11.067 22.3125C11.4293 22.3125 11.784 22.218 12.0817 22.0391L20.042 17.0828C20.4084 16.8594 20.634 16.4702 20.634 16.0453V6.14028C20.625 5.62283 20.2675 5.14469 19.7698 4.97969Z"/>
                    <circle cx="11.25" cy="10.5" r="3.75"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold">Free Membership</h3>
                  <p className="text-sm text-muted-foreground">
                    {userStats.downloadsRemaining} of 10 downloads remaining
                  </p>
                </div>
              </div>
              <Button className="mt-3 w-full bg-primary hover:bg-primary/90" asChild>
                <Link href="/pricing">Upgrade to Premium</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Daily Downloads Card */}
        <Card className="border-t-4 border-t-primary shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Download className="w-4 h-4 mr-2 text-primary" />
              Today's Downloads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{userStats.dailyDownloads} of {userStats.dailyDownloadLimit} downloads used</span>
                <span>{Math.round(dailyDownloadProgress)}%</span>
              </div>
              <Progress value={dailyDownloadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {userStats.isPremium 
                  ? "Unlimited downloads with Premium" 
                  : userStats.dailyDownloads >= userStats.dailyDownloadLimit 
                    ? "You've reached your daily download limit" 
                    : `You can download ${userStats.dailyDownloadLimit - userStats.dailyDownloads} more songs today`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Downloads Card */}
        <Card className="border-t-4 border-t-blue-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Music className="w-4 h-4 mr-2 text-blue-500" />
              Your Library
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Total Downloads</span>
                <span className="font-bold">{userStats.totalDownloads}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Downloaded Today</span>
                <span className="font-bold">{userStats.dailyDownloads}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Downloads Remaining</span>
                <span className="font-bold">{userStats.downloadsRemaining}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="download" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="download" className="flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Download
          </TabsTrigger>
          <TabsTrigger value="songs" className="flex items-center">
            <History className="w-4 h-4 mr-2" />
            My Downloads
          </TabsTrigger>
        </TabsList>
        
        <AnimatePresence mode="wait">
          <TabsContent value="download" className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-t-4 border-t-primary shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center text-xl">
                    <Headphones className="w-5 h-5 mr-2 text-primary" />
                    Download Music
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DownloadForm 
                    onDownload={handleDownload}
                    isLoading={isLoading || isDownloading}
                    isPremium={userStats.isPremium}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
          
          <TabsContent value="songs">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : songs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {songs.map((song) => (
                    <SongCard
                      key={song.id}
                      song={song}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Music className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No downloads yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Download your first song to get started
                    </p>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </TabsContent>
        </AnimatePresence>
      </Tabs>

      {/* Top Artists Section */}
      <div className="mt-8">
        <div className="flex items-center mb-4">
          <Music className="w-5 h-5 mr-2 text-blue-500" />
          <h2 className="text-xl font-bold">Your Top Artists</h2>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : topArtists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {topArtists.map((artist, index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-500/10 p-2 rounded-full">
                      <Music className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="font-medium">{artist.name}</h3>
                      <p className="text-sm text-muted-foreground">{artist.count} songs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Music className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No top artists yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Download more songs to see your top artists
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommendations Section */}
      <div className="mt-8">
        <div className="flex items-center mb-4">
          <Sparkles className="w-5 h-5 mr-2 text-primary" />
          <h2 className="text-xl font-bold">Recommended for You</h2>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : recommendations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {recommendations.map((song) => (
              <SongCard
                key={song.id}
                song={song}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Music className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No recommendations yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Download more songs to get personalized recommendations
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
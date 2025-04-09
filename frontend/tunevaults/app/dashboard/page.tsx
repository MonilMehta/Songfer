'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SongCard } from '@/components/song-card'
import { DownloadForm } from '@/components/download-form'
import { DownloadsRemainingCard } from '@/components/downloads-remaining-card'
import { PremiumBadge } from '@/components/premium-badge'
import { Music, Download, History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

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

interface Playlist {
  id: string
  name: string
  creator: string
  trackCount: number
  thumbnail: string
}

interface PreviewData {
  type: 'song' | 'playlist'
  data: Song | Playlist
  platform: 'youtube' | 'spotify'
  url: string
}

interface DownloadProgress {
  id: string
  progress: number
  message?: string
}

interface UserStats {
  downloadsRemaining: number
  isPremium: boolean
  totalDownloads: number
  savingsAmount: number
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [topArtists, setTopArtists] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [userStats, setUserStats] = useState<UserStats>({
    downloadsRemaining: 10,
    isPremium: false,
    totalDownloads: 0,
    savingsAmount: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Fetch user's downloaded songs and stats
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
        
        // Fetch top artists
        const artistsResponse = await fetch('http://localhost:8000/api/songs/user/top-artists/', {
          headers: authHeaders
        });
        
        if (!artistsResponse.ok) throw new Error('Failed to fetch top artists');
        const artistsData = await artistsResponse.json();
        setTopArtists(artistsData);
        
        // Fetch recommendations
        const recommendationsResponse = await fetch('http://localhost:8000/api/songs/recommendations/', {
          headers: authHeaders
        });
        
        if (!recommendationsResponse.ok) throw new Error('Failed to fetch recommendations');
        const recommendationsData = await recommendationsResponse.json();
        setRecommendations(recommendationsData);
        
        // In a real app, you would fetch user stats from your backend
        // For now using placeholder values
        setUserStats({
          downloadsRemaining: 10,
          isPremium: false,
          totalDownloads: songsData.length || 0,
          savingsAmount: 0
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

  const handlePreviewFetch = async (url: string) => {
    if (!url) return;
    
    setIsPreviewLoading(true);
    setPreview(null);
    
    try {
      // Call the backend to fetch the preview information
      const response = await fetch(`http://localhost:8000/api/songs/preview/?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch preview');
      }
      
      const previewData = await response.json();
      
      // Determine if it's a song or playlist based on the response structure
      const isPlaylist = previewData.type === 'playlist';
      
      setPreview({
        type: isPlaylist ? 'playlist' : 'song',
        platform: previewData.platform || (url.includes('spotify') ? 'spotify' : 'youtube'),
        data: previewData,
        url: url
      });
    } catch (error) {
      console.error("Error fetching preview:", error);
      toast({
        title: "Preview Failed",
        description: error instanceof Error ? error.message : "Could not fetch preview information",
        variant: "destructive"
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

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
        totalDownloads: prev.totalDownloads + 1
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

  const renderTotalDownloads = (isPremium: boolean) => {
    return isPremium ? "Unlimited" : 10;
  };

  const handleUrlSubmit = async (url: string, format: string) => {
    if (!url) return;
    
    console.log(`Downloading from URL: ${url} with format: ${format}`);
    
    setUserStats(prev => ({
      ...prev,
      downloadsRemaining: Math.max(0, prev.downloadsRemaining - 1),
      totalDownloads: prev.totalDownloads + 1
    }));
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {!userStats.isPremium && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-lg mb-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Upgrade to Premium</h3>
              <p className="text-muted-foreground mt-1">
                Get unlimited downloads and exclusive features
              </p>
            </div>
            <Button className="mt-4 md:mt-0" asChild>
              <Link href="/pricing">View Plans</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <DownloadsRemainingCard
          downloadsRemaining={userStats.downloadsRemaining}
          totalDownloads={renderTotalDownloads(userStats.isPremium)}
        />
        <PremiumBadge
          isPremium={userStats.isPremium}
          savingsAmount={userStats.savingsAmount}
        />
      </div>

      <Tabs defaultValue="download" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="download">
            <Download className="w-4 h-4 mr-2" />
            Download
          </TabsTrigger>
          <TabsTrigger value="songs">
            <History className="w-4 h-4 mr-2" />
            My Downloads
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="download" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Download Music</CardTitle>
            </CardHeader>
            <CardContent>
              <DownloadForm 
                onDownload={handleDownload}
                isLoading={isLoading || isDownloading}
                isPremium={userStats.isPremium}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="songs">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, History } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// Import custom dashboard components
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { DownloadTab } from '@/components/dashboard/download-tab'
import { SongsTab } from '@/components/dashboard/songs-tab'
import { ArtistGrid } from '@/components/dashboard/artist-grid'
import { RecommendationGrid } from '@/components/dashboard/recommendation-grid'

interface Song {
  id: string
  title: string
  artist: string
  album?: string
  duration: string
  thumbnail: string
  cover_url?: string
  download_url?: string
  spotify_id?: string
  youtube_id?: string
}

interface UserStats {
  downloadsRemaining: number
  isPremium: boolean
  totalDownloads: number
  dailyDownloads: number
  dailyDownloadLimit: number
  genres?: { name: string, count: number }[]
  listeningTime?: number
  lastDownloadDate?: string
}

interface Artist {
  name: string
  count: number
  image?: string
  lastDownloaded?: string
}

interface Recommendation {
  id: string
  title: string
  artist: string
  artists?: string
  album?: string
  popularity: number
  spotify_id?: string
  thumbnail_url?: string
  image_url?: string
  genre?: string
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [topArtists, setTopArtists] = useState<Artist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [userStats, setUserStats] = useState<UserStats>({
    downloadsRemaining: 9,
    isPremium: false,
    totalDownloads: 1,
    dailyDownloads: 1,
    dailyDownloadLimit: 10,
    genres: [
      { name: "Hip Hop", count: 32 },
      { name: "Pop", count: 14 },
      { name: "R&B", count: 9 },
    ],
    listeningTime: 2460, // in minutes
    lastDownloadDate: "2025-04-10T14:32:11Z"
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchUserData();
  }, []);

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
      
      await fetchRecommendations(authHeaders);
      await fetchTopArtists(authHeaders);
      
      // Update user stats
      setUserStats(prev => ({
        ...prev,
        totalDownloads: songsData.length || 1,
      }));
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

  const fetchRecommendations = async (headers: HeadersInit) => {
    try {
      const recommendationsResponse = await fetch('http://localhost:8000/api/songs/recommendations/', {
        headers
      });
      
      if (recommendationsResponse.ok) {
        const recommendationsData = await recommendationsResponse.json();
        // Transform the recommendations to match our interface
        const transformedRecommendations = recommendationsData.recommendations.map((rec: any) => ({
          id: rec.spotify_id || `rec-${Math.random().toString(36).substring(2, 9)}`,
          title: rec.title,
          artist: Array.isArray(rec.artist) 
            ? rec.artist.join(', ').replace(/[\[\]']/g, '') 
            : rec.artist.replace(/[\[\]']/g, ''),
          artists: Array.isArray(rec.artist) 
            ? rec.artist.join(', ').replace(/[\[\]']/g, '') 
            : rec.artist.replace(/[\[\]']/g, ''),
          album: rec.album,
          popularity: rec.popularity,
          spotify_id: rec.spotify_id,
          thumbnail_url: rec.thumbnail_url || rec.image_url,
          genre: getRandomGenre() // This would ideally come from your API
        }));
        setRecommendations(transformedRecommendations);
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error);
    }
  };

  const fetchTopArtists = async (headers: HeadersInit) => {
    try {
      const topArtistsResponse = await fetch('http://localhost:8000/api/songs/user/top-artists/', {
        headers
      });
      
      if (topArtistsResponse.ok) {
        const topArtistsData = await topArtistsResponse.json();
        
        // Transform the artists data to include placeholder images and last downloaded info
        const enhancedArtistsData = topArtistsData.map((artist: any) => ({
          name: artist.artist.replace(/['"]/g, ''),
          count: artist.count,
          image: getArtistImage(artist.artist.replace(/['"]/g, '')),
          lastDownloaded: getRandomRecentDate()
        }));
        
        setTopArtists(enhancedArtistsData);
      }
    } catch (error) {
      console.error("Error fetching top artists:", error);
    }
  };

  // Helper functions for demo purposes
  const getArtistImage = (artistName: string) => {
    // This would be replaced with actual images from your backend
    const hash = artistName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://source.unsplash.com/random/200x200/?musician&sig=${hash}`;
  };

  const getRandomGenre = () => {
    const genres = ['Hip Hop', 'Pop', 'R&B', 'Rock', 'Electronic', 'Jazz', 'Country', 'Alternative', 'Indie'];
    return genres[Math.floor(Math.random() * genres.length)];
  };

  const getRandomRecentDate = () => {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 30); // Random day in the last month
    const date = new Date(now.setDate(now.getDate() - daysAgo));
    return date.toISOString();
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
        totalDownloads: prev.totalDownloads + 1,
        dailyDownloads: prev.dailyDownloads + 1,
        lastDownloadDate: new Date().toISOString()
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

  const handleRefreshRecommendations = () => {
    const token = localStorage.getItem('token');
    if (token) {
      const headers = {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      };
      fetchRecommendations(headers);
    }
  };

  // Get download history data for mini chart (for demo purposes)
  const getDownloadActivityData = () => {
    return Array.from({ length: 7 }, () => Math.floor(Math.random() * 5)); // 7 days of random download counts
  };

  const downloadActivityData = getDownloadActivityData();

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Stats Cards */}
      <DashboardStats 
        userStats={userStats}
        downloadActivityData={downloadActivityData}
      />

      {/* Downloads and Library Tabs */}
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
        
        <TabsContent value="download" className="space-y-4">
          <DownloadTab 
            onDownload={handleDownload}
            isLoading={isLoading}
            isDownloading={isDownloading}
            isPremium={userStats.isPremium}
          />
        </TabsContent>
        
        <TabsContent value="songs">
          <SongsTab 
            songs={songs}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
      
      {/* Top Artists Section */}
      <ArtistGrid 
        artists={topArtists}
        isLoading={isLoading}
      />

      {/* Recommendations Section */}
      <RecommendationGrid 
        recommendations={recommendations}
        isLoading={isLoading}
        onRefresh={handleRefreshRecommendations}
      />
    </div>
  )
}

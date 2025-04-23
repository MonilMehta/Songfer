'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { useSession } from 'next-auth/react'

// Import custom dashboard components
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { DownloadTab } from '@/components/dashboard/download-tab'
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
  name?: string
  artist?: string
  count: number
  image?: string
  artist_img?: string
  lastDownloaded?: string
  country?: string
  artist_genre?: string
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

interface DownloadActivity {
  date: string
  downloads: number
  day_name: string
}

interface GenreDistribution {
  genre: string
  count: number
}

interface CountryDistribution {
  country: string
  count: number
}

export default function Dashboard() {
  const [songs, setSongs] = useState<Song[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [topArtists, setTopArtists] = useState<Artist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadActivity, setDownloadActivity] = useState<DownloadActivity[]>([])
  const [favoriteGenres, setFavoriteGenres] = useState<GenreDistribution[]>([])
  const [topCountries, setTopCountries] = useState<CountryDistribution[]>([])
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
  const [initialFetchAttempted, setInitialFetchAttempted] = useState(false); // <-- Add this state
  const router = useRouter()
  const { data: session, status: authStatus } = useSession()
  const { toast } = useToast()

  // Check authentication status when component mounts
  useEffect(() => {
    const checkAuth = async () => {
      // Return early if still loading or if fetch has already been attempted
      if (authStatus === 'loading' || initialFetchAttempted) {
        return;
      }

      setInitialFetchAttempted(true); // Mark fetch as attempted

      const token = localStorage.getItem('token')
      
      // If no token and not authenticated with NextAuth, redirect to login
      if (!token && authStatus === 'unauthenticated') {
        console.log('Not authenticated, redirecting to login')
        router.push('/login')
        return
      }
      
      // If user is authenticated through NextAuth but doesn't have a token in localStorage,
      // we need to get a token from our backend using Google credentials
      if (!token && authStatus === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('https://songporter.onrender.com/api/users/google-auth/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: session.user.email,
              name: session.user.name || session.user.email.split('@')[0],
              google_token: session.accessToken
            })
          })
          
          if (response.ok) {
            const data = await response.json()
            localStorage.setItem('token', data.token)
            fetchUserData() // Fetch user data with the new token
          } else {
            // If backend auth fails, redirect to login
            console.error('Backend authentication failed')
            router.push('/login')
          }
        } catch (error) {
          console.error('Error authenticating with Google credentials:', error)
          router.push('/login')
        }
      } else if (token) { // Check if token exists before fetching
        fetchUserData() // We have a token, fetch user data
      }
    }
    
    checkAuth()
    // Keep dependencies, but the flag prevents re-runs of the core logic
  }, [authStatus, session, router, initialFetchAttempted]); // <-- Add initialFetchAttempted

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
        router.push('/login');
        setIsLoading(false);
        return;
      }
      
      const authHeaders = {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Fetch downloaded songs
      await fetchSongs(authHeaders);
      
      await fetchRecommendations(authHeaders);
      await fetchTopArtists(authHeaders);
      await fetchDownloadActivity(authHeaders);
      await fetchFavoriteGenres(authHeaders);
      await fetchTopCountries(authHeaders);
      
      // Update user stats
      setUserStats(prev => ({
        ...prev,
        totalDownloads: songs.length || 1,
      }));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: `Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      
      // Check if the error is due to authentication issues
      if (error instanceof Error && error.message.includes('401')) {
        // If token is expired or invalid, clear it and redirect to login
        localStorage.removeItem('token');
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRecommendations = async (headers: HeadersInit) => {
    try {
      const recommendationsResponse = await fetch('https://songporter.onrender.com/api/songs/recommendations/', {
        headers
      });
      
      if (recommendationsResponse.ok) {
        const recommendationsData = await recommendationsResponse.json();
        // Pass the recommendations directly from the backend
        // The RecommendationGrid component will handle the data transformation
        if (recommendationsData.recommendations && recommendationsData.recommendations.length > 0) {
          setRecommendations(recommendationsData.recommendations);
          console.log("Recommendations Data:", recommendationsData.recommendations);
        }
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      throw error; // Re-throw the error so we can catch it in the calling function
    }
  };

  const fetchTopArtists = async (headers: HeadersInit) => {
    try {
      const topArtistsResponse = await fetch('https://songporter.onrender.com/api/songs/user/top-artists/', {
        headers
      });
      
      if (topArtistsResponse.ok) {
        const topArtistsData = await topArtistsResponse.json();
        console.log("Top Artists Data:", topArtistsData);
        // The ArtistGrid component will handle the transformation
        // Just pass the data directly as received from the API
        setTopArtists(topArtistsData);
      }
    } catch (error) {
      console.error("Error fetching top artists:", error);
      throw error; // Re-throw the error so we can catch it in the calling function
    }
  };

  const fetchDownloadActivity = async (headers: HeadersInit) => {
    try {
      const activityResponse = await fetch('https://songporter.onrender.com/api/users/download-activity/?period=week', {
        headers
      });
      
      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        if (activityData.activity_data && activityData.activity_data.length > 0) {
          setDownloadActivity(activityData.activity_data);
        }
      }
    } catch (error) {
      console.error("Error fetching download activity:", error);
    }
  };

  const fetchFavoriteGenres = async (headers: HeadersInit) => {
    try {
      const genresResponse = await fetch('https://songporter.onrender.com/api/songs/user/favorite-genres/', {
        headers
      });
      
      if (genresResponse.ok) {
        const genresData = await genresResponse.json();
        if (genresData.genre_distribution && genresData.genre_distribution.length > 0) {
          setFavoriteGenres(genresData.genre_distribution);
          
          // Update user stats with the top 3 genres
          const topGenres = genresData.genre_distribution
            .filter((genre: GenreDistribution) => genre.genre !== "Unknown")
            .slice(0, 3)
            .map((genre: GenreDistribution) => ({
              name: genre.genre.charAt(0).toUpperCase() + genre.genre.slice(1),
              count: genre.count
            }));
          
          setUserStats(prev => ({
            ...prev,
            genres: topGenres
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching favorite genres:", error);
    }
  };

  const fetchTopCountries = async (headers: HeadersInit) => {
    try {
      const countriesResponse = await fetch('https://songporter.onrender.com/api/songs/user/top-countries/', {
        headers
      });
      
      if (countriesResponse.ok) {
        const countriesData = await countriesResponse.json();
        if (countriesData.country_distribution && countriesData.country_distribution.length > 0) {
          setTopCountries(countriesData.country_distribution);
        }
      }
    } catch (error) {
      console.error("Error fetching top countries:", error);
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
      
      const response = await fetch('https://songporter.onrender.com/api/songs/songs/download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({ url, format }),
      });
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Download failed: ${response.status}`;
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.detail || errorMessage;
          } catch (parseError) {
            console.error('Error parsing JSON from error response:', parseError);
            errorMessage = `Download failed: ${response.status} ${response.statusText}`;
          }
        } else {
          errorMessage = `Download failed: ${response.status} ${response.statusText}`;
        }
        
        throw new Error(errorMessage);
      }
      
      toast({
        title: "Download Initiated",
        description: "Your download is processing...",
      });
      
      // Update local state without triggering a refetch
      setUserStats(prev => ({
        ...prev,
        downloadsRemaining: Math.max(0, prev.downloadsRemaining - 1),
        totalDownloads: prev.totalDownloads + 1,
        dailyDownloads: prev.dailyDownloads + 1,
        lastDownloadDate: new Date().toISOString()
      }));
      
      // Don't fetch songs immediately after download - this prevents the chain of API calls
      // fetchSongs() removed from here
      
    } catch (error) {
      console.error('Dashboard download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchSongs = async (headers?: HeadersInit) => {
    const token = localStorage.getItem('token');
    const authHeaders = headers || { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' };
    try {
      if (!token && !headers) {
        console.warn("Cannot fetch songs without auth token or provided headers.");
        return;
      }
      const songsResponse = await fetch('https://songporter.onrender.com/api/songs/songs/', {
        headers: authHeaders
      });
      if (!songsResponse.ok) throw new Error('Failed to fetch songs for count update');
      const songsData = await songsResponse.json();
      setSongs(songsData);
      console.log(songsData);
      setUserStats(prev => ({ ...prev, totalDownloads: songsData.length }));
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
      setIsLoading(true);
      Promise.all([
        fetchRecommendations(headers),
        fetchTopArtists(headers)
      ])
      .catch(error => {
        console.error("Error refreshing data:", error);
        toast({
          title: "Refresh Failed",
          description: "Could not refresh recommendations and artists",
          variant: "destructive"
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
    }
  };

  // Get download history data for mini chart (for demo purposes)
  const getDownloadActivityData = () => {
    if (downloadActivity.length > 0) {
      return downloadActivity.map(activity => activity.downloads);
    }
    return Array.from({ length: 7 }, () => Math.floor(Math.random() * 5)); // 7 days of random download counts
  };

  const downloadActivityData = getDownloadActivityData();

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-8">
      {/* Stats Cards */}
      <DashboardStats 
        userStats={userStats}
        downloadActivityData={downloadActivityData}
        downloadActivity={downloadActivity}
        favoriteGenres={favoriteGenres}
        topCountries={topCountries}
      />

      {/* Download Section - Render DownloadTab directly */}
      <div className="mt-8">
        <DownloadTab 
          onDownload={handleDownload}
          isLoading={isLoading}
          isDownloading={isDownloading}
          isPremium={userStats.isPremium}
        />
      </div>
      
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

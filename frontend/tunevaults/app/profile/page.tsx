'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import apiCaller from '@/utils/apiCaller'
import { Music, ListMusic } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Crown, Calendar, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GenreChart } from '@/components/profile/genre-chart'
import { CountryMap } from '@/components/profile/country-map'
import { MusicShelf } from '@/components/profile/music-shelf'
// import { FeedbackCard } from '@/components/profile/feedback-card'
// import { ProfileCard } from '@/components/profile/profile-card' // Import our new component

// Types
interface Song {
  id: number
  title: string
  artist: string
  album?: string
  song_url: string
  thumbnail_url?: string | null
  image_url?: string | null
  source: string
  created_at: string
  file_url: string
}

interface Playlist {
  id: number
  name: string
  source: string
  source_url: string
  created_at: string
  songs: Song[]
}

interface GenreDistributionItem {
  genre: string
  count: number
}

interface CountryDistributionItem {
  country: string
  count: number
}

interface ListeningStats {
  total_plays: number;
  unique_songs: number;
  total_listen_time: number;
  favorite_time: string;
}

interface TopArtist {
  artist: string;
  count: number;
}

interface UsageMetrics {
  songs_added_last_week: number;
  last_download: string;
  most_active_day: string;
}

interface UserProfile {
  id: number
  username: string
  email: string;
  date_joined: string;
  is_premium: boolean
  downloads_remaining: number
  total_songs_downloaded: number
  total_songs: number
  listening_stats?: ListeningStats;
  top_artists?: TopArtist[];
  usage_metrics?: UsageMetrics;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [genres, setGenres] = useState<GenreDistributionItem[]>([])
  const [countries, setCountries] = useState<CountryDistributionItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfileData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [profileRes, songsRes, playlistsRes, genresRes, countriesRes] = await Promise.all([
          apiCaller('songs/user/profile/', 'GET'),
          apiCaller('songs/songs/', 'GET'),
          apiCaller('songs/playlists/', 'GET'),
          apiCaller('songs/user/favorite-genres/', 'GET'),
          apiCaller('songs/user/top-countries/', 'GET')
        ]);

        if (profileRes && profileRes.status === 200) {
          setProfile(profileRes.data as UserProfile);
          localStorage.setItem('isPremium', profileRes.data.is_premium.toString());
        } else {
          throw new Error('Failed to fetch profile data');
        }

        if (songsRes && songsRes.status === 200) {
          setSongs(songsRes.data)
        } else {
          console.warn('Failed to fetch songs data or no songs found')
          setSongs([])
        }

        if (playlistsRes && playlistsRes.status === 200) {
          setPlaylists(playlistsRes.data)
        } else {
          console.warn('Failed to fetch playlists data or no playlists found')
          setPlaylists([])
        }

        if (genresRes && genresRes.status === 200 && genresRes.data.success) {
          setGenres(genresRes.data.genre_distribution || [])
        } else {
          console.warn('Failed to fetch genre distribution or data format error')
          setGenres([])
        }

        if (countriesRes && countriesRes.status === 200 && countriesRes.data.success) {
          setCountries(countriesRes.data.country_distribution || [])
        } else {
          console.warn('Failed to fetch country distribution or data format error')
          setCountries([])
        }
      } catch (err) {
        console.error('Error fetching profile data:', err)
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
        setProfile(null)
        setSongs([])
        setPlaylists([])
        setGenres([])
        setCountries([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfileData()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('isPremium')
    window.location.href = '/login'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto px-4 py-8 text-center mt-20">
        <h1 className="text-3xl font-bold mb-4">Profile Error</h1>
        <p className="text-red-500 mb-4">{error || 'Failed to load profile data. Please try again later.'}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 pb-24">
      {/* Profile Card - with cover image background */}
      <div className="flex flex-col items-center justify-center pt-24 pb-10">
        <div className="relative flex flex-col items-center w-full max-w-2xl rounded-2xl bg-background shadow-xl border border-border/30 p-0 overflow-hidden">
          {/* Cover image background */}
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-r from-violet-600/80 via-indigo-500/80 to-purple-500/80 overflow-hidden">
            <div className="absolute inset-0 bg-[url('/album-covers/pattern1.jpg')] opacity-30 bg-center bg-cover mix-blend-overlay"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/90"></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center w-full mt-16">
            {/* Avatar with aura */}
            <div className="mb-4">
              <div className={`relative ${profile?.is_premium ? 'ring-8 ring-pink-400/60 animate-pulse-slow' : ''} rounded-full`}>
                <Avatar className="h-32 w-32 border-4 border-background shadow-2xl">
                  <AvatarImage src={`https://api.dicebear.com/8.x/thumbs/svg?seed=${profile?.username}`} alt={profile?.username} />
                  <AvatarFallback className="text-3xl">{profile?.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                {profile?.is_premium && (
                  <span className="absolute bottom-0 right-0 block h-8 w-8 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 ring-2 ring-background flex items-center justify-center">
                    <Crown className="h-5 w-5 text-black" />
                  </span>
                )}
              </div>
            </div>
            
            {/* Username and badges */}
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">{profile?.username}</h1>
            <div className="flex flex-wrap gap-2 mb-2 justify-center">
              <Badge variant={profile?.is_premium ? 'default' : 'secondary'} className={`${profile?.is_premium ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black font-semibold border-amber-500/50' : 'border'} rounded-md px-2 py-0.5`}>{profile?.is_premium ? 'Premium Member' : 'Free Member'}</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {profile?.date_joined ? formatDistanceToNow(parseISO(profile.date_joined), { addSuffix: true }) : 'N/A'}</span>
            </div>
            
            {/* Email */}
            <span className="text-xs text-muted-foreground mb-4">{profile?.email}</span>
            
            {/* Stats - bold, playful */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-6 w-full px-8">
              <div className="bg-muted/50 rounded-xl p-6 flex flex-col items-center shadow-sm border border-border/20">
                <Download className="h-7 w-7 text-primary mb-2" />
                <span className="text-lg font-bold">{profile?.is_premium ? '∞' : profile?.downloads_remaining}</span>
                <span className="text-xs text-muted-foreground mt-1">Downloads Left</span>
              </div>
              <div className="bg-muted/50 rounded-xl p-6 flex flex-col items-center shadow-sm border border-border/20">
                <Music className="h-7 w-7 text-primary mb-2" />
                <span className="text-lg font-bold">{profile?.total_songs_downloaded}</span>
                <span className="text-xs text-muted-foreground mt-1">Songs Downloaded</span>
              </div>
              <div className="bg-muted/50 rounded-xl p-6 flex flex-col items-center shadow-sm border border-border/20">
                <ListMusic className="h-7 w-7 text-primary mb-2" />
                <span className="text-lg font-bold">{profile?.total_songs}</span>
                <span className="text-xs text-muted-foreground mt-1">Library Size</span>
              </div>
            </div>
            
            {/* Logout button */}
            <div className="w-full px-8 mb-6">
              <Button variant="outline" className="w-full" onClick={handleLogout}>Log out</Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Genre Chart and Country Map */}
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
        {/* Genre Chart Card */}

          {genres && genres.length > 0 ? (
            <GenreChart data={genres} />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p>Not enough genre data yet</p>
            </div>
          )}
        
        
        {/* Country Map Card */}

          {countries && countries.length > 0 ? (
            <CountryMap data={countries} />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p>Not enough country data yet</p>
            </div>
          )}
      </div>
  
      <div className="max-w-5xl mx-auto px-4 mt-10">
        <Tabs defaultValue="songs" className="w-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Your Music Collection</h2>
            <TabsList>
              <TabsTrigger value="songs">Songs</TabsTrigger>
              <TabsTrigger value="playlists">Playlists</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="songs" className="mt-0">
            {songs && songs.length > 0 ? (
              <MusicShelf 
                items={songs} 
                type="songs" 
                nowPlayingId={songs.length > 0 ? songs[0].id : undefined}
              />
            ) : (
              <div className="text-center p-8 bg-muted/30 border border-dashed border-border rounded-lg">
                <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Your collection is empty. Start adding songs!</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="playlists" className="mt-0">
            {playlists && playlists.length > 0 ? (
              <MusicShelf 
                items={playlists} 
                type="playlists" 
              />
            ) : (
              <div className="text-center p-8 bg-muted/30 border border-dashed border-border rounded-lg">
                <ListMusic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">You haven&apos;t created any playlists yet. Create your first playlist!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
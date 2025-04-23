/* eslint-disable */
'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from '@/components/ui/badge'
import { 
  Download, 
  Music, 
  ListMusic, 
  Crown, 
  Star, 
  Settings, 
  User, 
  LogOut, 
  Calendar, 
  Mail, 
  Headphones,
  Activity
} from 'lucide-react'
import Link from 'next/link'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import VinylPlayer from '../custom/VinylPlayer'

// Type definitions
interface ListeningStats {
  total_plays: number;
  unique_songs: number;
  total_listen_time: number; // Assuming seconds
  favorite_time: string;
}

interface TopArtist {
  artist: string;
  count: number;
}

interface UsageMetrics {
  songs_added_last_week: number;
  last_download: string; // ISO date string
  most_active_day: string; // ISO date string
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

interface ProfileCardProps {
  profile: UserProfile;
  onLogout: () => void;
}

// Helper functions
const formatListenTime = (seconds: number | undefined): string => {
  if (seconds === undefined || isNaN(seconds) || seconds < 0) return "N/A";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  let timeString = "";
  if (hours > 0) timeString += `${hours}h `;
  timeString += `${minutes}m ${secs}s`;
  return timeString;
};

const formatDate = (dateString: string | undefined, formatStr: string = 'PPP'): string => {
  if (!dateString) return 'N/A';
  try {
    return format(parseISO(dateString), formatStr);
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return 'Invalid Date';
  }
};

export function ProfileCard({ profile, onLogout, genres = [] }: ProfileCardProps & { genres?: { genre: string, count: number }[] }) {
  const joinDate = profile.date_joined ? parseISO(profile.date_joined) : null;
  const joinDateFormatted = joinDate ? formatDistanceToNow(joinDate, { addSuffix: true }) : 'N/A';
  const topArtist = profile.top_artists && profile.top_artists.length > 0 ? profile.top_artists[0] : null;

  return (
    <>
      {/* Navigation Bar */}
      <div className="w-full bg-background/90 backdrop-blur-lg fixed top-0 left-0 right-0 z-50 h-16 border-b border-border/40 shadow-md">
        <div className="container flex items-center justify-between h-full px-4 md:px-6">
          {/* Replace logo with VinylPlayer */}
          <Link href="/dashboard" className="flex items-center space-x-2 group">
            <VinylPlayer />
            <span className="font-bold text-xl tracking-tight ml-2">Songfer</span>
          </Link>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <Link href="/dashboard">
              <Button variant="secondary" size="sm" className="font-medium">Dashboard</Button>
            </Link>
            <Link href="/profile">
              <Button variant="secondary" size="sm" className="font-medium">Profile</Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full relative group border border-border/50 hover:border-primary">
                   <User className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  {profile.is_premium && (
                     <span className="absolute -top-1 -right-1 block h-3 w-3 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 ring-2 ring-background" title="Premium Member"></span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{profile.username}</p>
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {profile.is_premium ? "Premium Member" : "Free Member"}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="flex items-center w-full">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="flex items-center">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Profile Card */}
      <Card className="w-full max-w-5xl mx-auto overflow-hidden shadow-xl border border-border/30 bg-card/95 backdrop-blur rounded-xl mt-20">
        {/* Premium Ribbon */}
        {profile.is_premium && (
          <div className="bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400 text-black p-2 text-center font-semibold text-xs flex items-center justify-center shadow-inner">
            <Crown className="h-3.5 w-3.5 mr-1.5" />
            Premium Account - Unlimited Downloads
          </div>
        )}

        <CardContent className="p-0">
          {/* Background Header */}
          <div className="relative h-32 bg-gradient-to-r from-primary/30 via-primary/20 to-secondary/30">
            {/* Premium Accents */}
            {profile.is_premium && (
              <>
                <div className="absolute top-6 left-6 text-primary-foreground/20">
                  <Crown className="h-20 w-20 opacity-20" />
                </div>
                <div className="absolute bottom-4 right-8">
                  <div className="flex items-center space-x-1">
                    <Star className="h-3 w-3 text-amber-300" />
                    <Star className="h-4 w-4 text-amber-300" />
                    <Star className="h-3 w-3 text-amber-300" />
                  </div>
                </div>
              </>
            )}
            
            {/* Avatar Overlay */}
            <div className="absolute -bottom-12 left-8">
              <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                <AvatarImage src={`https://api.dicebear.com/8.x/thumbs/svg?seed=${profile.username}`} alt={profile.username} />
                <AvatarFallback className="text-xl">{profile.username.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {profile.is_premium && (
                <span className="absolute bottom-0 right-0 block h-6 w-6 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 ring-2 ring-background flex items-center justify-center">
                  <Crown className="h-3 w-3 text-black" />
                </span>
              )}
            </div>
          </div>

          {/* User Info Section */}
          <div className="px-8 pt-16 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              {/* User Info */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">{profile.username}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
                  <Badge variant={profile.is_premium ? "default" : "secondary"} 
                    className={`${profile.is_premium 
                      ? "bg-gradient-to-r from-amber-400 to-orange-500 text-black font-semibold border-amber-500/50" 
                      : "border"} rounded-md px-2 py-0.5`}>
                    {profile.is_premium ? "Premium Member" : "Free Member"}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Joined {joinDateFormatted}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {profile.email}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex-shrink-0 flex gap-2">
                {!profile.is_premium ? (
                  <Button size="sm" className="bg-gradient-to-r from-primary to-purple-600 hover:opacity-95 text-primary-foreground shadow group" asChild>
                    <Link href="/pricing">
                      <Star className="mr-1.5 h-4 w-4 group-hover:animate-pulse" />
                      Upgrade to Premium
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10 hover:border-primary" asChild>
                    <Link href="/settings">
                      <Settings className="mr-1.5 h-4 w-4" />
                      Settings
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              {/* Downloads Left Card */}
              <div className="bg-background/60 rounded-lg p-4 border border-border/30 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/15 rounded-full">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Downloads Left</p>
                    <p className="text-xl font-semibold mt-0.5">{profile.is_premium ? '∞' : profile.downloads_remaining}</p>
                  </div>
                </div>
                {!profile.is_premium && profile.downloads_remaining < 5 && (
                  <Badge variant="destructive" className="mt-2 text-xs font-normal px-1.5 py-0.5">Running Low</Badge>
                )}
              </div>

              {/* Songs Downloaded Card */}
              <div className="bg-background/60 rounded-lg p-4 border border-border/30 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/15 rounded-full">
                    <Music className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Songs Downloaded</p>
                    <p className="text-xl font-semibold mt-0.5">{profile.total_songs_downloaded}</p>
                  </div>
                </div>
              </div>

              {/* Library Size Card */}
              <div className="bg-background/60 rounded-lg p-4 border border-border/30 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary/15 rounded-full">
                    <ListMusic className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium">Library Size</p>
                    <p className="text-xl font-semibold mt-0.5">{profile.total_songs}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Section */}
            {(profile.listening_stats || profile.usage_metrics || topArtist) && (
              <>
                <Separator className="my-6" />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Listening Stats */}
                  {profile.listening_stats && (
                    <div className="rounded-lg border border-border/30 p-4 bg-background/60 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                      <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-primary" /> 
                        Listening Habits
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Plays:</span>
                          <span className="font-medium">{profile.listening_stats.total_plays}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Unique Songs:</span>
                          <span className="font-medium">{profile.listening_stats.unique_songs}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total Time:</span>
                          <span className="font-medium">{formatListenTime(profile.listening_stats.total_listen_time)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Favorite Time:</span>
                          <span className="font-medium capitalize">{profile.listening_stats.favorite_time || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Usage Metrics */}
                  {profile.usage_metrics && (
                    <div className="rounded-lg border border-border/30 p-4 bg-background/60 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                      <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" /> 
                        Usage Metrics
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Added Last Week:</span>
                          <span className="font-medium">{profile.usage_metrics.songs_added_last_week} songs</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Last Download:</span>
                          <span className="font-medium">{formatDate(profile.usage_metrics.last_download, 'PP')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Most Active:</span>
                          <span className="font-medium">{formatDate(profile.usage_metrics.most_active_day, 'PP')}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Artist */}
                  {topArtist && (
                    <div className="rounded-lg border border-border/30 p-4 bg-background/60 shadow-sm hover:shadow-md transition-all hover:border-primary/30">
                      <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                        <Star className="h-4 w-4 text-primary" /> 
                        Top Artist
                      </h3>
                      <div className="flex flex-col items-center justify-center p-2">
                        <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                          <Music className="h-8 w-8 text-primary/60" />
                        </div>
                        <h4 className="font-medium text-lg">{topArtist.artist}</h4>
                        <p className="text-sm text-muted-foreground">{topArtist.count} plays</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
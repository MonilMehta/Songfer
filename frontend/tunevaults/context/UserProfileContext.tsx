'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Define the user profile data structure based on API response
interface UserProfile {
  id: number
  username: string
  email: string
  total_songs_downloaded: number
  downloads_remaining: number
  total_downloads_today: number
  is_premium: boolean
  recent_songs: Array<{
    id: number
    title: string
    artist: string
    album: string
    image_url: string
    file_url: string
    created_at: string
  }>
  last_download?: string
  // Add other fields as needed
}

interface UserProfileContextType {
  userProfile: UserProfile | null
  isLoading: boolean
  error: string | null
  refreshUserProfile: () => Promise<void>
  updateDownloadsCount: (newDownload: boolean) => void
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<number>(0)

  // Cache expiration time in milliseconds (5 minutes)
  const CACHE_EXPIRATION = 5 * 60 * 1000

  // Get auth token from local storage
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || ''
    }
    return ''
  }

  const fetchUserProfile = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const token = getAuthToken()
      
      if (!token) {
        throw new Error('No authentication token found')
      }

      const response = await fetch('http://localhost:8000/api/songs/user/profile', {
        headers: {
          'Authorization': `Token ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`)
      }

      const data = await response.json()
      setUserProfile(data)
      setLastFetch(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      console.error('Error fetching user profile:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Refresh user profile if data is stale or on demand
  const refreshUserProfile = async () => {
    const now = Date.now()
    if (!userProfile || now - lastFetch > CACHE_EXPIRATION) {
      await fetchUserProfile()
    }
  }

  // Update downloads count without making an API call
  const updateDownloadsCount = (newDownload: boolean) => {
    if (!userProfile) return

    setUserProfile(prev => {
      if (!prev) return prev
      
      return {
        ...prev,
        downloads_remaining: Math.max(0, prev.downloads_remaining - (newDownload ? 1 : 0)),
        total_downloads_today: prev.total_downloads_today + (newDownload ? 1 : 0),
        total_songs_downloaded: prev.total_songs_downloaded + (newDownload ? 1 : 0),
        last_download: newDownload ? new Date().toISOString() : prev.last_download
      }
    })
  }

  // Initial fetch on mount
  useEffect(() => {
    // Only attempt to fetch if we're in a browser context where localStorage is available
    if (typeof window !== 'undefined') {
      fetchUserProfile()
    }
  }, [])

  const value = {
    userProfile,
    isLoading,
    error,
    refreshUserProfile,
    updateDownloadsCount
  }

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export const useUserProfile = () => {
  const context = useContext(UserProfileContext)
  if (context === undefined) {
    throw new Error('useUserProfile must be used within a UserProfileProvider')
  }
  return context
}
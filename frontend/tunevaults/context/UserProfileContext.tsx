'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'

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
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<number>(0)
  const isFetchingRef = useRef(false)
  const authInitializedRef = useRef(false) // Track if auth has been initialized

  // Cache expiration time in milliseconds (5 minutes)
  const CACHE_EXPIRATION = 5 * 60 * 1000

  // Get auth token from local storage
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || ''
    }
    return ''
  }

  // Check if a session exists by looking for session cookie or other auth indicators
  const hasAuthSession = () => {
    if (typeof window === 'undefined') return false
    
    // Check for token in localStorage
    const hasToken = !!localStorage.getItem('token')
    
    // Check for session cookie (adjust name based on your auth implementation)
    const hasSessionCookie = document.cookie.includes('next-auth.session-token=')
    
    return hasToken || hasSessionCookie
  }

  const fetchUserProfile = async () => {
    // If we're already fetching, don't start another fetch
    if (isFetchingRef.current) return
    
    isFetchingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      const token = getAuthToken()
      
      if (!token) {
        // No need to throw an error for new users without a token
        setIsLoading(false)
        isFetchingRef.current = false
        return
      }

      const response = await fetch('https://songporter.onrender.com/api/songs/user/profile', {
        headers: {
          'Authorization': `Token ${token}`
        },
        // Add cache: 'no-store' to prevent browser caching
        cache: 'no-store'
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.statusText}`)
      }

      const data = await response.json()
      setUserProfile(data)
      setLastFetch(Date.now())
      // Mark auth as initialized once we've successfully loaded profile data
      authInitializedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      console.error('Error fetching user profile:', err)
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
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

  // Check for valid session and fetch profile data
  useEffect(() => {
    // Don't make requests if we've already determined there's no auth
    if (typeof window === 'undefined') return
    
    // Function to check session and fetch user data if needed
    const checkSessionAndFetchProfile = async () => {
      // If we've already successfully initialized auth, skip redundant check
      if (authInitializedRef.current) return
      
      const hasSession = hasAuthSession()
      const token = getAuthToken()
      
      // Only fetch if we have a token and haven't fetched recently
      if (token && hasSession && (Date.now() - lastFetch > CACHE_EXPIRATION)) {
        await fetchUserProfile()
      } else if (!token && !hasSession) {
        // No auth present, no need to keep checking
        authInitializedRef.current = true
      }
    }
    
    // Initial fetch with a delay to avoid race conditions during auth
    const timeoutId = setTimeout(() => {
      checkSessionAndFetchProfile()
    }, 800) // Increased timeout to give OAuth login more time to complete
    
    // Set up a listener for storage events to detect token changes
    // This helps with OAuth flows where the token might be set by another tab/process
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' && e.newValue) {
        checkSessionAndFetchProfile()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [lastFetch])

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
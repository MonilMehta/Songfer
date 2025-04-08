'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Download, Music, CreditCard, Settings, LogOut, User, Crown } from 'lucide-react'
import Link from 'next/link'
import apiCaller from '@/utils/apiCaller'

interface UserProfile {
  username: string
  email: string
  isPremium: boolean
  downloadsRemaining: number
  totalDownloads: number
  savingsAmount: number
  joinDate: string
  subscriptionEndDate?: string
}

interface DownloadHistory {
  id: number
  title: string
  artist: string
  downloadDate: string
  format: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>({
    username: 'User',
    email: 'user@example.com',
    isPremium: false,
    downloadsRemaining: 10,
    totalDownloads: 5,
    savingsAmount: 25,
    joinDate: '2023-01-01',
    subscriptionEndDate: undefined
  })
  
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        // TODO: Replace with actual API call when available
        // const profileResponse = await apiCaller('users/profile/', 'GET')
        // if (profileResponse && profileResponse.status === 200) {
        //   setProfile(profileResponse.data)
        // }
        
        // For now, using mock data
        const isPremiumUser = localStorage.getItem('isPremium') === 'true'
        setProfile({
          username: 'JohnDoe',
          email: 'john.doe@example.com',
          isPremium: isPremiumUser,
          downloadsRemaining: isPremiumUser ? 50 : 10,
          totalDownloads: 15,
          savingsAmount: 75,
          joinDate: '2023-06-15',
          subscriptionEndDate: isPremiumUser ? '2024-06-15' : undefined
        })
        
        // TODO: Replace with actual API call when available
        // const historyResponse = await apiCaller('users/downloads/', 'GET')
        // if (historyResponse && historyResponse.status === 200) {
        //   setDownloadHistory(historyResponse.data)
        // }
        
        // For now, using mock data
        setDownloadHistory([
          {
            id: 1,
            title: 'Song 1',
            artist: 'Artist 1',
            downloadDate: '2023-06-20',
            format: 'MP3'
          },
          {
            id: 2,
            title: 'Song 2',
            artist: 'Artist 2',
            downloadDate: '2023-06-18',
            format: 'MP3'
          },
          {
            id: 3,
            title: 'Song 3',
            artist: 'Artist 3',
            downloadDate: '2023-06-15',
            format: 'MP3'
          }
        ])
        
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching profile data:', error)
        setIsLoading(false)
      }
    }
    
    fetchProfileData()
  }, [])

  const handleLogout = () => {
    // Clear local storage
    localStorage.removeItem('token')
    localStorage.removeItem('isPremium')
    
    // Redirect to login page
    window.location.href = '/login'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Profile</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Info */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src="https://via.placeholder.com/150" />
                  <AvatarFallback>{profile.username.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="text-xl">{profile.username}</CardTitle>
              <CardDescription>{profile.email}</CardDescription>
              <div className="mt-2">
                {profile.isPremium ? (
                  <Badge variant="default" className="bg-gradient-to-r from-amber-500 to-yellow-500">
                    <Crown className="h-3 w-3 mr-1" />
                    Premium
                  </Badge>
                ) : (
                  <Badge variant="outline">Free</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span>{new Date(profile.joinDate).toLocaleDateString()}</span>
                </div>
                {profile.isPremium && profile.subscriptionEndDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subscription ends</span>
                    <span>{new Date(profile.subscriptionEndDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Downloads remaining</span>
                  <span>{profile.downloadsRemaining}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total downloads</span>
                  <span>{profile.totalDownloads}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Money saved</span>
                  <span>${profile.savingsAmount}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </Button>
              <Button variant="outline" className="w-full" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        {/* Tabs Content */}
        <div className="md:col-span-2">
          <Tabs defaultValue="downloads">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="downloads">
                <Download className="mr-2 h-4 w-4" />
                Downloads
              </TabsTrigger>
              <TabsTrigger value="subscription">
                <CreditCard className="mr-2 h-4 w-4" />
                Subscription
              </TabsTrigger>
              <TabsTrigger value="account">
                <User className="mr-2 h-4 w-4" />
                Account
              </TabsTrigger>
            </TabsList>
            
            {/* Downloads Tab */}
            <TabsContent value="downloads" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Download History</CardTitle>
                  <CardDescription>
                    Your recent downloads
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {downloadHistory.length > 0 ? (
                    <div className="space-y-4">
                      {downloadHistory.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-4">
                            <div className="bg-muted p-2 rounded-full">
                              <Music className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="font-medium">{item.title}</h3>
                              <p className="text-sm text-muted-foreground">{item.artist}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">{new Date(item.downloadDate).toLocaleDateString()}</p>
                            <Badge variant="outline" className="mt-1">{item.format}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium">No downloads yet</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start downloading songs to see your history here
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Subscription Tab */}
            <TabsContent value="subscription" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription Details</CardTitle>
                  <CardDescription>
                    Manage your subscription
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">Current Plan</h3>
                        <p className="text-sm text-muted-foreground">
                          {profile.isPremium ? 'Premium' : 'Free'}
                        </p>
                      </div>
                      <Badge variant={profile.isPremium ? "default" : "outline"}>
                        {profile.isPremium ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    {profile.isPremium && profile.subscriptionEndDate && (
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">Renewal Date</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(profile.subscriptionEndDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">Manage</Button>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">Downloads</h3>
                        <p className="text-sm text-muted-foreground">
                          {profile.downloadsRemaining} remaining today
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{profile.totalDownloads} total</p>
                        <p className="text-xs text-muted-foreground">${profile.savingsAmount} saved</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  {!profile.isPremium ? (
                    <Button className="w-full" asChild>
                      <Link href="/pricing">Upgrade to Premium</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full">Manage Subscription</Button>
                  )}
                </CardFooter>
              </Card>
            </TabsContent>
            
            {/* Account Tab */}
            <TabsContent value="account" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>
                    Manage your account information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="font-medium">Username</h3>
                      <div className="flex items-center space-x-2">
                        <p>{profile.username}</p>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">Email</h3>
                      <div className="flex items-center space-x-2">
                        <p>{profile.email}</p>
                        <Button variant="ghost" size="sm">Edit</Button>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <h3 className="font-medium">Password</h3>
                      <div className="flex items-center space-x-2">
                        <p>••••••••</p>
                        <Button variant="ghost" size="sm">Change</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full">Save Changes</Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
} 
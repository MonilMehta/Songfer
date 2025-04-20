'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import apiCaller from '@/utils/apiCaller'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import VinylPlayer from '@/components/custom/VinylPlayer'
import { signIn, useSession } from 'next-auth/react'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { data: session, status } = useSession()
  
  // Function to handle backend authentication with Google credentials
  const authenticateWithBackend = useCallback(async (email: string | null | undefined, name: string | null | undefined, accessToken: string | undefined) => {
    if (!email) {
      setError('Email not provided by Google authentication')
      return false
    }
    
    try {
      // Make a request to your backend to authenticate or register the Google user
      const response = await apiCaller('users/google-auth/', 'POST', { 
        email, 
        name: name || email.split('@')[0],
        google_token: accessToken 
      })
      
      if (response && response.status === 200) {
        // Store the token from your backend
        localStorage.setItem('token', response.data.token)
        return true
      } else {
        setError('Backend authentication failed after Google sign-in')
        return false
      }
    } catch (error: any) {
      console.error('Backend authentication error:', error)
      setError(error?.response?.data?.detail || 'Failed to authenticate with the backend')
      return false
    }
  }, [])
  
  // Check session and handle backend authentication when session changes
  useEffect(() => {
    const handleSessionChange = async () => {
      if (status === 'authenticated' && session?.user?.email) {
        setIsLoading(true)
        try {
          // Authenticate with backend using Google credentials
          const success = await authenticateWithBackend(
            session.user.email,
            session.user.name,
            session.accessToken
          )
          
          if (success) {
            router.push('/dashboard')
          }
        } finally {
          setIsLoading(false)
        }
      }
    }
    
    handleSessionChange()
  }, [session, status, router, authenticateWithBackend])
  
  // Check if user is already authenticated with a token
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      router.push('/dashboard')
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      const response = await apiCaller('users/login/', 'POST', { username, password })

      if (response && response.status === 200) {
        const data = response.data
        localStorage.setItem('token', data.token)
        router.push('/dashboard')
      } else {
        setError('Invalid username or password')
      }
    } catch (error: any) {
      console.error('Error:', error)
      if (error.response && error.response.data) {
        setError(error.response.data.detail || 'Login failed')
      } else {
        setError('Login failed. Please check your credentials and try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('google', { callbackUrl: '/login' }) // Redirect back to login to process in useEffect
    } catch (error) {
      console.error('Google sign-in error:', error)
      setError('Failed to sign in with Google')
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="flex items-center gap-2 mb-8 ">
        <div className="w-8 h-8 mr-4 mb-2">
          <VinylPlayer />
        </div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Song Porter</h1>
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/15 p-3 rounded-md mb-4 text-sm text-destructive">
              {error}
            </div>
          )}
        
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter your username"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

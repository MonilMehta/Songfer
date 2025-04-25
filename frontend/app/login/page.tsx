/* eslint-disable */
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import apiCaller from '@/utils/apiCaller'
import Link from 'next/link'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import VinylPlayer from '@/components/custom/VinylPlayer'
import { signIn, useSession } from 'next-auth/react' // Import useSession
import { useAuthRedirect } from '@/hooks/useAuthRedirect'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const router = useRouter()
  const { data: session, status } = useSession() // Use useSession hook

  // useAuthRedirect handles post-Google-auth flow and localStorage token check
  const { isAuthLoading, authError, setAuthError } = useAuthRedirect()

  // Combine loading states
  const isLoading = formLoading || isAuthLoading || status === 'loading';

  // Combine error states
  const displayError = formError || authError

  

  // Clear form-specific errors when inputs change
  useEffect(() => {
    if (username || password) {
      setFormError('');
      // Keep authError managed by useAuthRedirect
    }
  }, [username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    // ... existing handleSubmit logic ...
    // This handles username/password login via your backend API
    // It sets localStorage token upon success
    e.preventDefault()
    if (!username || !password) {
      setFormError('Please enter both username and password.')
      return
    }
    setFormLoading(true)
    setFormError('')
    setAuthError('') // Clear potential errors from Google flow

    try {
      const response = await apiCaller('users/login/', 'POST', { username, password })

      if (response && response.status === 200 && response.data.token) {
        localStorage.setItem('token', response.data.token)
        // Redirect immediately after successful username/password login
        router.push('/dashboard') 
      } else {
        setFormError(response?.data?.detail || 'Invalid username or password.')
      }
    } catch (error: any) {
      console.error('Login Error:', error)
      setFormError(error.response?.data?.detail || 'Login failed. Please check credentials or network.')
    } finally {
      setFormLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setFormLoading(true) // Use formLoading for the button state
    setFormError('')
    setAuthError('')
    try {
      // Callback URL is /login because useAuthRedirect handles the logic *after* returning here
      await signIn('google', { callbackUrl: '/login' }) 
      // Don't setFormLoading(false) here, as the page might navigate away
      // or useAuthRedirect will take over the loading state (isAuthLoading)
    } catch (error) {
      console.error('Google sign-in initiation error:', error)
      setAuthError('Failed to start Google sign-in process.')
      setFormLoading(false) // Set loading false only on error
    }
  }

  // Render loading state or the form
  if (status === 'loading') {
    return <div className="flex justify-center items-center min-h-screen">Loading session...</div>; // Or a proper loading spinner
  }



  return (
    // ... existing JSX structure ...
    // Make sure buttons use the combined 'isLoading' state
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[80vh]">
      {/* ... existing header ... */}
      <div className="flex items-center gap-2 mb-8 ">
        <div className="w-8 h-8 mr-4 mb-2">
          <VinylPlayer />
        </div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Songfer</h1>
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {displayError && (
             <Alert variant="destructive" className="mb-4">
               <AlertCircle className="h-4 w-4" />
               <AlertDescription>{displayError}</AlertDescription>
             </Alert>
          )}
        
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ... existing username input ... */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Enter your username"
                disabled={isLoading} // Use combined loading state
              />
            </div>
            {/* ... existing password input ... */}
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
                  disabled={isLoading} // Use combined loading state
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading} // Use combined loading state
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}> 
              {formLoading ? 'Signing in...' : isAuthLoading ? 'Processing...' : 'Sign In'}
            </Button>
          </form>
          
          {/* ... existing separator ... */}
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
            className="w-full mt-6" // Added mt-6 for spacing after separator
            onClick={handleGoogleSignIn}
            disabled={isLoading} // Use combined loading state
          >
            {/* ... existing Google SVG ... */}
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
            {isAuthLoading ? 'Processing Google Sign-In...' : 'Sign in with Google'}
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

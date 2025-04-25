'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import apiCaller from '@/utils/apiCaller'
import VinylPlayer from '@/components/custom/VinylPlayer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { signIn } from 'next-auth/react'
import { useAuthRedirect } from '@/hooks/useAuthRedirect'

export default function SignUp() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('') // Error state for form validation/submission
  const [formLoading, setFormLoading] = useState(false) // Loading state for form submission
  const router = useRouter()

  // Use the custom hook for auth redirection and Google sign-in handling
  const { isAuthLoading, authError, setAuthError } = useAuthRedirect()

  // Combine loading states
  const isLoading = formLoading || isAuthLoading

  // Combine error states (prioritize form error if both exist)
  const displayError = formError || authError

  // Clear errors when input changes
  useEffect(() => {
    if (username || email || password) {
      setFormError('');
      setAuthError(''); // Also clear auth errors potentially shown from Google flow
    }
  }, [username, email, password, setAuthError]);

  const validateForm = () => {
    setFormError('') // Reset error

    if (!username || !email || !password) {
      setFormError('All fields are required')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setFormError('Please enter a valid email address')
      return false
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long')
      return false
    }
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)
    if (!(hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar)) {
      setFormError('Password must contain uppercase, lowercase, numbers, and special characters')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }
    setFormLoading(true)
    setAuthError('') // Clear any previous auth errors

    try {
      const response = await apiCaller('users/register/', 'POST', {
        username,
        email,
        password
      })

      if (response && response.status === 201) {
        // Redirect to login page after successful sign-up
        // Optionally show a success message first
        router.push('/login?signup=success') // Add query param to potentially show message on login
      } else {
         // Use detail from response if available, otherwise generic message
        setFormError(response?.data?.detail || 'Failed to sign up. Please try again.')
      }
    } catch (error: any) {
      console.error('Sign Up Error:', error)
      if (error.response?.data) {
        const data = error.response.data
        if (data.username) setFormError(`Username error: ${data.username.join(', ')}`)
        else if (data.email) setFormError(`Email error: ${data.email.join(', ')}`)
        else if (data.password) setFormError(`Password error: ${data.password.join(', ')}`)
        else if (data.detail) setFormError(data.detail)
        else setFormError('An error occurred during sign up.')
      } else {
        setFormError('Network error. Please check connection.')
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setFormLoading(true) // Use formLoading to indicate user action initiated loading
    setFormError('')
    setAuthError('')
    try {
       // Redirect back to signup page; the useAuthRedirect hook will handle the session change
      await signIn('google', { callbackUrl: '/signup' })
       // Loading state will be managed by useAuthRedirect after redirect
    } catch (error) {
      console.error('Google sign-in initiation error:', error)
      setAuthError('Failed to start Google sign-in process.')
      setFormLoading(false) // Stop loading if signIn itself fails immediately
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 mr-4 mb-2">
          <VinylPlayer />
        </div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Songfer</h1>
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Sign up to get started with Songfer
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
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="Choose a username"
                disabled={isLoading}
                aria-describedby={formError && formError.toLowerCase().includes('username') ? 'error-message' : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
                disabled={isLoading}
                aria-describedby={formError && formError.toLowerCase().includes('email') ? 'error-message' : undefined}
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
                  placeholder="Create a password"
                  disabled={isLoading}
                  aria-describedby={formError && formError.toLowerCase().includes('password') ? 'error-message' : 'password-hint'}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p id="password-hint" className="text-xs text-muted-foreground mt-1">
                Must be 8+ characters with uppercase, lowercase, numbers, & special characters.
              </p>
            </div>
            {displayError && <p id="error-message" className="sr-only">{displayError}</p>}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {formLoading ? 'Signing up...' : isAuthLoading ? 'Processing...' : 'Sign Up'}
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
            {isAuthLoading ? 'Processing Google Sign-Up...' : 'Sign up with Google'}
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}


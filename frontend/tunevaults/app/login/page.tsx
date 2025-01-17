'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import apiCaller from '@/utils/apiCaller'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await apiCaller('users/login/', 'POST', { username, password })

      if (response && response.status === 200) {
        const data = response.data
        localStorage.setItem('token', data.token)
        router.push('/dashboard')
      } else {
        console.error('Failed to login')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 relative">
      {/* Rotating CD animation */}
      <div className="absolute inset-0 flex items-center justify-center z-0">
        <div className="w-64 h-64 border-8 border-dashed border-gray-300 rounded-full animate-spin" />
      </div>

      <div className="max-w-md mx-auto relative z-10">
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  )
}

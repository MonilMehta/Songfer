/* eslint-disable */
"use client";
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { Moon, Sun, Github, Disc } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const RotatingVinylDisc = () => (
  <motion.div
    className="relative w-8 h-8 mr-2 flex items-center justify-center"
    animate={{ rotate: 360 }}
    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
  >
    <Disc className="w-full h-full text-primary" />
    <motion.div 
      className="absolute inset-0 w-2 h-2 bg-background rounded-full m-auto"
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    />
  </motion.div>
)

export default function Header() {
  const { theme, setTheme } = useTheme()
  const [isloggedin, setisloggedin] = useState<string | undefined>(undefined)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    setisloggedin(token ? 'true' : undefined)

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header className={`bg-background/80 backdrop-blur-sm border-b sticky top-0 z-50 transition-all duration-300 ${isScrolled ? 'py-2' : 'py-4'}`}>
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" className="text-2xl font-bold text-primary flex items-center">
          <RotatingVinylDisc />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Song Porter</span>
        </Link>
        <nav className="flex items-center space-x-2 md:space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('light')}>
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="https://github.com/yourusername/Song Porter" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
              <Github className="h-[1.2rem] w-[1.2rem]" />
              <span className="sr-only">GitHub</span>
            </Button>
          </Link>
          {isloggedin ? (
            <Link href="/dashboard">
              <Button variant="default" size="sm" className="ml-2">Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Login</Button>
              </Link>
              <Link href="/signup">
                <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90">Sign Up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}


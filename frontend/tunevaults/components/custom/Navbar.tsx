/* eslint-disable */
"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Menu, Github, Sun, Moon, LogOut, User, Home, UserCircle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const VinylPlayer = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
  
    const togglePlay = () => {
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    };
  
    return (
      <div className="relative w-12 h-12 cursor-pointer" onClick={togglePlay}>
        {/* Player base/platter */}
        <div className={cn(
          "absolute w-full h-full rounded-full shadow-md",
          isDark ? "bg-gray-800" : "bg-gray-200"
        )} />
        
        {/* Vinyl disc */}
        <motion.div
          className="absolute top-[10%] left-[10%] transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full overflow-hidden"
          animate={{ rotate: isPlaying ? 360 : 0 }}
          transition={{ duration: 6, repeat: isPlaying ? Infinity : 0, ease: "linear" }}
        >
          <div className={cn(
            "w-full h-full rounded-full",
            isDark ? "bg-gray-900" : "bg-gray-800"
          )}>
            {/* Vinyl grooves - more detailed and realistic */}
            {[...Array(8)].map((_, i) => (
              <div key={i} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-700 opacity-60" 
                   style={{ width: `${9 - i*0.8}px`, height: `${9 - i*0.8}px` }} />
            ))}
            
            {/* Reflective highlights */}
            <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-white opacity-50 rounded-full" />
            <div className="absolute bottom-1/3 right-1/3 w-0.5 h-2 bg-white opacity-30 rounded-full" />
            
            {/* Record label */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-red-700">
              {/* Label details */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-gray-900" />
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-red-800" />
            </div>
          </div>
        </motion.div>
        
        {/* Tonearm */}
        <motion.div
          className="absolute top-1/2 right-0 w-6 h-1 origin-right"
          animate={{ rotate: isPlaying ? -30 : -45 }}
          transition={{ duration: 0.8 }}
        >
          <div className={cn(
            "h-full rounded-full",
            isDark ? "bg-gray-600" : "bg-gray-500"
          )} />
          {/* Tonearm head */}
          <div className={cn(
            "absolute w-1.5 h-1.5 rounded-sm -rotate-45 top-0 left-0 -mt-0.5 -ml-0.5",
            isDark ? "bg-gray-500" : "bg-gray-400"
          )} />
        </motion.div>
        
        {/* Hidden audio element */}
        <audio 
          ref={audioRef} 
          src="/songs/Low Life feat. The Weeknd - Future.aac" 
          onEnded={() => setIsPlaying(false)}
          style={{ display: "none" }} 
        />

        {/* Play/Pause indicator - subtle visual cue */}
        <div className={`absolute bottom-1 right-1 w-3 h-3 rounded-full transition-opacity ${isPlaying ? 'bg-green-500 opacity-70' : 'bg-gray-400 opacity-40'}`}></div>
      </div>
    );
  };
  

export default function Navbar() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isloggedin, setisloggedin] = useState<string | undefined>(undefined);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  // Add window width tracking
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Add click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        !menuButtonRef.current?.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const progress = Math.min(1, window.scrollY / (window.innerHeight * 0.1));
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Add scroll handler for mobile view
  useEffect(() => {
    const handleScroll = () => {
      if (windowWidth < 768) {
        // Check if in mobile view
        setIsNavbarVisible(window.scrollY < 50); // Show navbar if scrolled less than 50px
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [windowWidth]);

  // Check if user is logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    setisloggedin(token ? 'true' : undefined);
  }, []);
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <motion.nav 
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        scrollProgress > 0.1 && "shadow-md"
      )}
      style={{
        transform: scrollProgress > 0.1 ? `translateY(${Math.max(0, 5 - scrollProgress * 10)}px)` : "translateY(0)",
        borderRadius: scrollProgress > 0.1 ? "0 0 8px 8px" : "0",
        margin: scrollProgress > 0.1 ? "0 25px" : "0",
        width: scrollProgress > 0.1 ? "calc(100% - 50px)" : "100%",
      }}
    >
      <div className="container flex h-14 items-center px-4">
        {/* Logo and brand name - left side */}
        <VinylPlayer />
        <div className="flex items-center ml-2 sm:ml-4">
          <Link href="/" className="flex items-center space-x-2">
            
            <span className="font-bold sm:inline-block">
              Song Porter
            </span>
          </Link>
        </div>
        
        {/* Right side - navigation and buttons */}
        <div className="flex flex-1 items-center justify-end">
          {/* Desktop navigation for non-logged in users */}
          {!isloggedin && (
            <div className="hidden md:flex items-center space-x-6 mr-6 text-sm font-medium">
              <Link
                href="/features"
                className="transition-colors hover:text-foreground/80 text-foreground"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="transition-colors hover:text-foreground/80 text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className="transition-colors hover:text-foreground/80 text-foreground"
              >
                About
              </Link>
            </div>
          )}
          
          {/* Desktop navigation for logged in users */}
          {isloggedin && (
            <div className="hidden md:flex items-center space-x-6 mr-6 text-sm font-medium">
              <Link
                href="/dashboard"
                className="transition-colors hover:text-foreground/80 text-foreground flex items-center"
              >
                <Home className="mr-1 h-4 w-4" />
                Home
              </Link>
              <Link
                href="/profile"
                className="transition-colors hover:text-foreground/80 text-foreground flex items-center"
              >
                <UserCircle className="mr-1 h-4 w-4" />
                Profile
              </Link>
            </div>
          )}
          
          {/* Theme toggle and GitHub - always visible */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="h-8 w-8"
            >
              <Sun className="h-[1.1rem] w-[1.1rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.1rem] w-[1.1rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            
            <Button variant="ghost" size="icon" asChild className="h-8 w-8">
              <Link href="https://github.com/MonilMehta/Song Porter" target="_blank">
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </Link>
            </Button>
          </div>
          
          {/* Login/Signup - visible on desktop only when not logged in */}
          {!isloggedin && (
            <div className="hidden md:flex items-center space-x-2 ml-4">
              <Link
                href="/login"
                className="text-sm font-medium transition-colors hover:text-foreground/80 text-foreground"
              >
                Login
              </Link>
              <Button asChild size="sm" className="h-8">
                <Link href="/signup">Sign Up</Link>
              </Button>
            </div>
          )}
          
          {/* Profile dropdown for logged in users */}
          {isloggedin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2">
                  <User className="h-4 w-4" />
                  <span className="sr-only">Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Mobile menu button */}
          <Button
            ref={menuButtonRef}
            className="ml-2 px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
            variant="ghost"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden" ref={mobileMenuRef}>
          <div className="space-y-1 px-2 pb-3 pt-2">
            {isloggedin ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
                <Link
                  href="/profile"
                  className="flex items-center rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </Link>
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground flex items-center"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/features"
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Features
                </Link>
                <Link
                  href="/pricing"
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Pricing
                </Link>
                <Link
                  href="/about"
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  About
                </Link>
                <div className="border-t border-border my-2"></div>
                <Link
                  href="/login"
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </motion.nav>
  );
}
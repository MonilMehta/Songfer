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
import VinylPlayer from "./VinylPlayer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    // Clear localStorage items
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Clear any Next Auth session data
    // This handles removing cookies and session data from Next Auth
    fetch('/api/auth/signout', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    }).finally(() => {
      // Clear any cookies that might be related to authentication
      document.cookie.split(';').forEach(cookie => {
        const [name] = cookie.trim().split('=');
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      });
      
      // Redirect to login page
      window.location.href = '/login';
    });
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
            
            <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent sm:inline-block">
              Songfer
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
              <Link href="https://github.com/MonilMehta/Songfer" target="_blank">
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
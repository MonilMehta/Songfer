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
  DropdownMenuSeparator, // Import Separator
} from "@/components/ui/dropdown-menu";
import { useSession, signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; // Import Avatar components

export default function Navbar() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasLocalToken, setHasLocalToken] = useState<boolean | undefined>(undefined); // State for local token check
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { data: session, status: nextAuthStatus } = useSession(); // Renamed status for clarity
  const isNextAuthAuthenticated = nextAuthStatus === "authenticated";

  // Check for local token on mount and when session status changes
  useEffect(() => {
    const token = localStorage.getItem('token');
    setHasLocalToken(!!token);
  }, [nextAuthStatus]); // Re-check if session status changes

  // Determine overall authentication status
  // Consider authenticated if NextAuth says so OR if local token exists
  // Wait until local token check is done (not undefined) and nextAuth status is not loading
  const isLoadingAuth = nextAuthStatus === 'loading' || hasLocalToken === undefined;
  const isAuthenticated = !isLoadingAuth && (isNextAuthAuthenticated || hasLocalToken === true);

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

  const handleLogout = () => {
    localStorage.removeItem('token'); // Clear local token
    setHasLocalToken(false); // Update local state immediately
    setIsMenuOpen(false); // Close mobile menu if open
    signOut({ callbackUrl: '/login' }); // Sign out from next-auth
  };

  // Helper to get initials from name or email
  const getInitials = (name?: string | null, email?: string | null): string => {
    if (name) {
      const names = name.split(' ');
      if (names.length > 1) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U'; // Default fallback
  };

  // Function to close mobile menu
  const closeMobileMenu = () => setIsMenuOpen(false);

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
              Songfer {/* Updated Brand Name */}
            </span>
          </Link>
        </div>
        
        {/* Right side - navigation and buttons */}
        <div className="flex flex-1 items-center justify-end">
          {/* Desktop navigation for non-logged in users */}
          {/* Show only when loading is finished and user is not authenticated */}
          {!isLoadingAuth && !isAuthenticated && (
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
          {/* Show only when loading is finished and user is authenticated */}
          {!isLoadingAuth && isAuthenticated && (
            <div className="hidden md:flex items-center space-x-6 mr-6 text-sm font-medium">
              <Link
                href="/dashboard"
                className="transition-colors hover:text-foreground/80 text-foreground flex items-center"
              >
                <Home className="mr-1 h-4 w-4" />
                Home
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
              <Link href="https://github.com/MonilMehta/SongPorter" target="_blank"> {/* Updated GitHub Link */}
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </Link>
            </Button>
          </div>
          
          {/* Login/Signup OR User Dropdown - visible on desktop */}
          <div className="hidden md:flex items-center space-x-2 ml-4">
            {/* Show Login/Signup only when loading is finished and user is not authenticated */}
            {!isLoadingAuth && !isAuthenticated && (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium transition-colors hover:text-foreground/80 text-foreground"
                >
                  Login
                </Link>
                <Button asChild size="sm" className="h-8">
                  <Link href="/signup">Sign Up</Link>
                </Button>
              </>
            )}

            {/* Show User Dropdown only when loading is finished and user is authenticated */}
            {!isLoadingAuth && isAuthenticated && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      {/* Prioritize session data, fallback if only local token exists (basic initials) */}
                      <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? session?.user?.email ?? 'User'} />
                      <AvatarFallback>{getInitials(session?.user?.name, session?.user?.email)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuItem asChild>
                     <Link href="/profile" className="flex items-center cursor-pointer">
                       <UserCircle className="mr-2 h-4 w-4" />
                       <span>Profile</span>
                     </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
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
            {/* Show based on combined isAuthenticated, hide while loading */}
            {!isLoadingAuth && isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={closeMobileMenu} // Close menu on click
                  className="flex items-center rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
                <Link
                  href="/profile"
                  onClick={closeMobileMenu} // Close menu on click
                  className="flex items-center rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </Link>
                <Button
                  variant="ghost"
                  onClick={handleLogout} // Logout also closes menu
                  className="w-full justify-start rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground flex items-center"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </>
            ) : !isLoadingAuth && !isAuthenticated ? (
              <>
                <Link
                  href="/features"
                  onClick={closeMobileMenu} // Close menu on click
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Features
                </Link>
                <Link
                  href="/pricing"
                  onClick={closeMobileMenu} // Close menu on click
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Pricing
                </Link>
                <Link
                  href="/about"
                  onClick={closeMobileMenu} // Close menu on click
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  About
                </Link>
                <div className="border-t border-border my-2"></div>
                <Link
                  href="/login"
                  onClick={closeMobileMenu} // Close menu on click
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={closeMobileMenu} // Close menu on click
                  className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Sign Up
                </Link>
              </>
            ) : null /* Optionally show a loading indicator here */}
          </div>
        </div>
      )}
    </motion.nav>
  );
}
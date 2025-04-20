"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Github, Sun, Moon, LogOut, User, Crown } from "lucide-react";
import { useEffect, useState } from "react";
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
import VinylPlayer from "./VinylPlayer";

export default function DashboardNavbar() {
  const [isPremium, setIsPremium] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  // Check if user is premium
  useEffect(() => {
    const checkPremiumStatus = async () => {
      try {
        // This would be replaced with an actual API call to check premium status
        // For now, we'll just check localStorage
        const isPremiumUser = localStorage.getItem('isPremium') === 'true';
        setIsPremium(isPremiumUser);
      } catch (error) {
        console.error('Error checking premium status:', error);
      }
    };

    checkPremiumStatus();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <motion.nav 
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm"
    >
      <div className="container flex h-14 items-center px-4">
        {/* Logo and brand name - left side */}
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <VinylPlayer />
            <span className="font-bold sm:inline-block">
              Song Porter
            </span>
          </Link>
        </div>
        
        {/* Right side - navigation and buttons */}
        <div className="flex flex-1 items-center justify-end">
          {/* Premium badge */}
          {isPremium && (
            <div className="mr-4 flex items-center">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2.5 py-0.5 text-xs font-medium text-white">
                <Crown className="mr-1 h-3 w-3" />
                Premium
              </span>
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
              <Link href="https://github.com/yourusername/Song Porter" target="_blank">
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </Link>
            </Button>
          </div>
          
          {/* Profile dropdown */}
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
        </div>
      </div>
    </motion.nav>
  );
} 
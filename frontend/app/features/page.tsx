"use client";

import React from 'react';
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Download, BarChart, User, Zap, ListMusic, FileAudio } from 'lucide-react'; // Replaced Music with ListMusic, FileAudio

const features = [
  {
    Icon: Download,
    name: "Seamless Downloads",
    description: "Grab tracks from YouTube & Spotify in MP3/AAC. High-quality audio offline.",
    href: "/", // Link to main download section
    cta: "Try Now",
    background: <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:row-start-1 lg:row-end-3 lg:col-start-1 lg:col-end-2", // Spans 2 rows
  },
  {
    Icon: ListMusic, // New Icon for Playlists
    name: "Playlist Power",
    description: "Download entire YouTube playlists with just one click. No command lines needed!",
    href: "/login", // Feature likely requires login
    cta: "Get Started",
    background: <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-teal-500/10 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:row-start-1 lg:row-end-3 lg:col-start-2 lg:col-end-3", // Spans 2 rows - Adjusted for balance
  },
  {
    Icon: BarChart,
    name: "Smart Recommendations",
    description: "Discover new music tailored to your taste based on your download history.",
    href: "/dashboard", // Feature likely in dashboard
    cta: "Explore",
    background: <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-orange-500/10 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2", // Spans 1 row
  },
  {
    Icon: User,
    name: "Profile & Stats",
    description: "Track your downloads, manage your account, and view listening insights.",
    href: "/profile",
    cta: "View Profile",
    background: <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-pink-500/10 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4", // Moved to bottom left - Spans 1 row
  },
  {
    Icon: Zap,
    name: "Clean & Intuitive UI",
    description: "Enjoy a beautifully designed, user-friendly interface for easy navigation.",
    href: "#",
    cta: "See Design",
    background: <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-3",
  },
   {
    Icon: FileAudio, // New Icon for Formats
    name: "Multiple Formats",
    description: "Choose between high-quality MP3 and AAC formats for your downloads.",
    href: "/",
    cta: "Check Options",
    background: <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-sky-500/10 opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>,
    className: "lg:col-start-3 lg:col-end-4 lg:row-start-3 lg:row-end-4",
  },
];

export default function FeaturesPage() {
  return (
    <div className="container mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          Songfer Features
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
          Unlock a world of music with powerful tools designed for seamless downloading and discovery.
        </p>
      </div>

      <BentoGrid className="lg:grid-rows-3">
        {features.map((feature) => (
          <BentoCard key={feature.name} {...feature} />
        ))}
      </BentoGrid>
    </div>
  );
}

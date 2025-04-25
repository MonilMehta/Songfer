"use client";

import React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Phone, Code, Server, Cloud, Wind, Github, Linkedin, ExternalLink, MessageSquare } from 'lucide-react'; // Added MessageSquare
import { Button } from '@/components/ui/button';
import { FeedbackFish } from '@feedback-fish/react'; // Import FeedbackFish
import { useSession } from "next-auth/react"; // Import useSession

// Enhanced Tech Icon component with animation and bigger size
const TechIcon = ({ IconComponent, label }: { IconComponent: React.ElementType, label: string }) => (
  <div className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-accent/50 transition-all duration-300 group">
    <IconComponent className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
  </div>
);

// Social link component
const SocialLink = ({ href, icon: IconComponent, label }: { href: string, icon: React.ElementType, label: string }) => (
  <a 
    href={href} 
    target="_blank" 
    rel="noopener noreferrer"
    className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/50 text-foreground hover:bg-primary/20 transition-colors duration-300"
  >
    <IconComponent className="h-4 w-4" />
    <span>{label}</span>
  </a>
);

export default function AboutPage() {
  const { data: session } = useSession(); // Get session data
  const userEmail = session?.user?.email; // Get user email if logged in

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80">
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="max-w-4xl mx-auto space-y-16">
          {/* Hero Section with Animation */}
          <div className="text-center space-y-4 mb-16 animate-fade-in">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground tracking-tight">
              About <span className="text-primary">Songfer</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A modern solution for downloading your favorite music playlists
            </p>
          </div>
          
          {/* Creator Section - Enhanced */}
          <Card className="overflow-hidden bg-gradient-to-br from-card/80 to-card/95 backdrop-blur-xl border-2 shadow-xl hover:shadow-2xl transition-all duration-500">
            <CardHeader className="text-center pb-4 border-b">
              <CardTitle className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Meet the Creator
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 md:p-10">
              <div className="flex flex-col md:flex-row items-center gap-12">
                <div className="flex-shrink-0 relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-primary/50 rounded-full blur opacity-70 group-hover:opacity-100 transition duration-500"></div>
                  <div className="relative">
                    <Image
                      src="/me.jpg"
                      alt="Monil Mehta"
                      width={220}
                      height={220}
                      className="rounded-full border-4 border-background object-cover shadow-lg transform group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold text-foreground mb-1">Monil Mehta</h2>
                    <p className="text-lg text-primary font-medium">
                      Third Year Engineering Student
                    </p>
                    <p className="text-muted-foreground">
                      DJ Sanghvi College Of Engineering, Mumbai
                    </p>
                  </div>
                  
                  <p className="text-foreground leading-relaxed">
                    Passionate about building innovative projects and constantly learning new technologies. 
                    Dedicated to creating user-friendly and impactful applications. 
                    Always exploring the intersection of code and creativity!
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-center md:justify-start items-center gap-4 text-sm">
                      <a href="mailto:monilmehta5@gmail.com" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors group">
                        <Mail className="h-4 w-4 group-hover:animate-bounce" />
                        monilmehta5@gmail.com
                      </a>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        +91 9082228927
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                      <SocialLink href="https://github.com/MonilMehta" icon={Github} label="GitHub" />
                      <SocialLink href="https://linkedin.com/in/monilmeh" icon={Linkedin} label="LinkedIn" />
                      <SocialLink href="https://yourportfolio.com" icon={ExternalLink} label="Portfolio" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Project Section - Enhanced */}
          <Card className="bg-card/90 backdrop-blur-md border shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-primary/5 rounded-full blur-3xl -z-10"></div>
            
            <CardHeader className="border-b pb-6">
              <CardTitle className="text-2xl sm:text-3xl font-bold text-center text-primary">
                About Songfer
              </CardTitle>
              <CardDescription className="text-center text-muted-foreground max-w-2xl mx-auto pt-2 text-lg">
                The story behind the music downloader.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="p-8 space-y-10">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold text-foreground">The Motivation</h3>
                  <div className="w-20 h-1 bg-primary/70 rounded-full"></div>
                </div>
                <p className="text-muted-foreground leading-relaxed text-lg">
                  Songfer was born out of a simple frustration: the lack of a user-friendly, web-based tool to download entire YouTube playlists without resorting to command-line interfaces or potentially shady software. I wanted to create a seamless experience for music lovers to grab their favorite playlists quickly and easily.
                </p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold text-foreground">Tech Stack</h3>
                  <div className="w-20 h-1 bg-primary/70 rounded-full"></div>
                </div>
                <p className="text-muted-foreground mb-6 leading-relaxed text-lg">
                  Built with a modern stack to ensure performance and scalability:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <TechIcon IconComponent={Wind} label="Next.js" />
                  <TechIcon IconComponent={Server} label="Django" />
                  <TechIcon IconComponent={Cloud} label="Vercel" />
                  <TechIcon IconComponent={Code} label="Render" />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold text-foreground">Features</h3>
                  <div className="w-20 h-1 bg-primary/70 rounded-full"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="bg-accent/50 border-0 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-6 space-y-2">
                      <h4 className="font-semibold text-lg">Playlist Downloads</h4>
                      <p className="text-muted-foreground">Download entire YouTube playlists with just a few clicks</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-accent/50 border-0 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-6 space-y-2">
                      <h4 className="font-semibold text-lg">High Quality Audio</h4>
                      <p className="text-muted-foreground">Get the best audio quality available for your music</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-accent/50 border-0 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-6 space-y-2">
                      <h4 className="font-semibold text-lg">No Ads or Malware</h4>
                      <p className="text-muted-foreground">Clean, safe interface without intrusive advertising</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-accent/50 border-0 shadow-sm hover:shadow transition-shadow">
                    <CardContent className="p-6 space-y-2">
                      <h4 className="font-semibold text-lg">User-Friendly</h4>
                      <p className="text-muted-foreground">Simple interface that anyone can use without technical knowledge</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Feedback Section - Updated with Feedback Fish */}
          <Card className="bg-gradient-to-br from-primary/10 to-accent/20 backdrop-blur-md border shadow-md overflow-hidden">
            <CardHeader>
              <CardTitle className="text-2xl sm:text-3xl font-semibold text-center text-foreground">
                Feedback & Suggestions
              </CardTitle>
              <CardDescription className="text-center text-muted-foreground max-w-2xl mx-auto pt-2">
                Have ideas on how to improve Songfer? Share your feedback!
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 md:p-8 flex justify-center">
              {/* Feedback Fish Integration */}
              <FeedbackFish projectId="3633dc3af20bbf" userId={userEmail ?? undefined}>
                <Button variant="outline" size="lg" className="group">
                  <MessageSquare className="mr-2 h-5 w-5 group-hover:animate-wiggle" />
                  Send Feedback
                </Button>
              </FeedbackFish>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
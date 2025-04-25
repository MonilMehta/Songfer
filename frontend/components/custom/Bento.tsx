/* eslint-disable */
import {
  Download,
  Music,
  Headphones,
  Zap,
  Share2,
  Youtube,
  CircleDot
} from "lucide-react";
  
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { motion } from "framer-motion";
import Link from "next/link";

const DownloadMusicContent = () => (
    <div className="flex flex-col h-full justify-between p-6">
      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-center">Download Music</h3>
        
        <div className="flex justify-center">
          <Download className="h-16 w-16 text-primary" />
        </div>
        
        <p className="text-sm text-muted-foreground text-center">
          Easily download your favorite tracks in high quality format.
        </p>
      </div>
      
      <div className="my-6">
        <h4 className="text-sm font-medium mb-4 text-center">Supported Platforms</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-3 rounded-lg bg-card/60 hover:bg-card/80 transition-colors">
            <Youtube className="h-8 w-8 text-red-500 mb-2" />
            <span className="text-xs font-medium">YouTube</span>
          </div>
          
          <div className="flex flex-col items-center p-3 rounded-lg bg-card/60 hover:bg-card/80 transition-colors">
            <CircleDot className="h-8 w-8 text-green-500 mb-2" />
            <span className="text-xs font-medium">Spotify</span>
          </div>
          
          <div className="flex flex-col items-center p-3 rounded-lg bg-card/30 opacity-70">
            <Music className="h-8 w-8 text-blue-500 mb-2" />
            <span className="text-xs font-medium">Apple Music</span>
            <span className="text-xs text-muted-foreground">Soon</span>
          </div>
        </div>
      </div>
      
      <Button asChild className="w-full">
        <Link href="/login" className="flex items-center justify-center space-x-2">
          <span>Try it now</span>
          <Download className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
  
  const features = [
    {
      Icon: Download,
      name: "Download Music",
      description: "Easily download your favorite tracks from YouTube and Spotify in high quality.",
      href: "#download-section",
      cta: "Try it now",
      background: <img className="absolute -right-20 -top-20 opacity-60" />,
      className: "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
      content: <DownloadMusicContent />,
    },
  {
    Icon: Music,
    name: "Discover New Tunes",
    description: "Get personalized recommendations based on your music taste and listening history.",
    href: "#features",
    cta: "Learn more",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
  },
  {
    Icon: Headphones,
    name: "Offline Listening",
    description: "Enjoy your downloaded music anytime, anywhere, even without an internet connection.",
    href: "#features",
    cta: "Learn more",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
  },
  {
    Icon: Zap,
    name: "Lightning Fast",
    description: "Experience rapid downloads and smooth performance with our optimized system.",
    href: "#features",
    cta: "Learn more",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2",
  },
  {
    Icon: Share2,
    name: "Share Playlists",
    description: "Create and share your curated playlists with friends and the community.",
    href: "#features",
    cta: "Learn more",
    background: <img className="absolute -right-20 -top-20 opacity-60" />,
    className: "lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4",
  },
];
  
function BentoDemo() {
  return (
    <BentoGrid className="lg:grid-rows-3">
      {features.map((feature) => (
        <BentoCard key={feature.name} {...feature} />
      ))}
    </BentoGrid>
  );
}
  
export { BentoDemo };
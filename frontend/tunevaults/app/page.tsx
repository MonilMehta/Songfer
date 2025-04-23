/* eslint-disable */
"use client";

import { useState, useEffect } from 'react';
import Hero from '@/components/custom/Hero'
// import { Download, Music, Headphones, Zap, Share2, Lock, Disc } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import Cookies from 'js-cookie';
import { ButtonCta } from '@/components/ui/button-shiny';
import { Cover } from '@/components/ui/cover';
import { motion } from 'framer-motion';
import { BentoDemo } from '@/components/custom/Bento';
// import Navbar from '@/components/custom/Navbar';
import { PricingSectionDemo } from '@/components/blocks/pricing-section-demo';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Home() {
  const [url, setUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedSong, setDownloadedSong] = useState<any>(null);
  const [format, setFormat] = useState<'mp3' | 'aac'>('mp3');
  const { toast } = useToast();
  const router = useRouter();

  // Redirect to login if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleDownload = async (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handlePublicDownload = async () => {
    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube or Spotify URL.",
        variant: "destructive"
      });
      return;
    }

    const songsDownloaded = Cookies.get('songsDownloaded');
    if (songsDownloaded) {
      toast({
        title: "Download Limit Reached",
        description: "Please wait 5 minutes before downloading another song.",
        variant: "destructive"
      });
      return;
    }

    setDownloading(true);
    setProgress(0);
    setDownloadedSong(null);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + 5;
      });
    }, 200);

    try {
      const response = await fetch('https://songporter.onrender.com/api/songs/songs/public-download/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, format }),
      });

      clearInterval(interval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('audio/')) {
        const contentDisposition = response.headers.get('content-disposition');
        const filenameMatch = contentDisposition?.match(/filename="(.+?)"(?:;|$)/) || [];
        const defaultFilename = `download.${format}`;
        
        const songTitleHeader = response.headers.get('x-song-title');
        const songArtistHeader = response.headers.get('x-song-artist');
        const thumbnailUrlHeader = response.headers.get('x-thumbnail-url');

        const songTitle = songTitleHeader || (filenameMatch[1] ? filenameMatch[1].replace(/\.[^/.]+$/, "") : 'Downloaded Song');
        const filename = filenameMatch[1] || `${songTitle}.${format}`;
        const songArtist = songArtistHeader || 'Unknown Artist';
        const thumbnailUrl = thumbnailUrlHeader;

        const blob = await response.blob();
        handleDownload(blob, filename);
        
        setDownloadedSong({
          title: songTitle,
          artist: songArtist,
          thumbnailUrl,
          format
        });
        
        setProgress(100);
        
        // Set a cookie to limit downloads
        Cookies.set('songsDownloaded', 'true', { expires: 1/48 }); // 30 minutes
        
        toast({
          title: "Download Complete",
          description: `${songTitle} by ${songArtist} has been downloaded.`,
        });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error.message || "An error occurred while downloading the song.",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleLogin = () => {
    router.push('/login');
  };

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <Hero />
        
        <section className="py-16 sm:py-24 bg-background">
          <div className="container mx-auto px-4 text-center">
            <Cover className="inline-block mb-4">
              <h2 className="text-3xl sm:text-4xl font-bold text-primary">
                Ultra-Fast Music Downloads
              </h2>
            </Cover>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Experience our seamless interface. Simply paste your Spotify or YouTube URL below to try out one free download on us!
            </p>

            <div className="w-full max-w-lg mx-auto bg-card p-6 rounded-lg shadow-lg border hover-light-mode">
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <Input
                  placeholder="Enter YouTube or Spotify URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-grow"
                  disabled={downloading}
                />
                <div className="flex gap-2 justify-center sm:justify-start">
                  <Button
                    variant={format === 'mp3' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormat('mp3')}
                    className="w-20"
                    disabled={downloading}
                  >
                    MP3
                  </Button>
                  <Button
                    variant={format === 'aac' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormat('aac')}
                    className="w-20"
                    disabled={downloading}
                  >
                    AAC
                  </Button>
                </div>
              </div>

              <ButtonCta
                label={downloading ? "Processing..." : "Download Your Free Song"}
                onClick={handlePublicDownload}
                disabled={downloading}
                className="w-full"
              />

              {downloading && (
                <div className="mt-4 w-full">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-2 bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {progress < 100 ? `Downloading... ${Math.round(progress)}%` : 'Preparing download...'}
                  </p>
                </div>
              )}

              {downloadedSong && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 border rounded-lg bg-background/80 backdrop-blur-sm shadow-inner"
                >
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {downloadedSong.thumbnailUrl && (
                      <Image
                        src={downloadedSong.thumbnailUrl}
                        alt="Song thumbnail"
                        className="h-20 w-20 object-cover rounded-md border"
                      />
                    )}
                    <div className="text-center sm:text-left">
                      <h3 className="font-semibold text-lg text-foreground">{downloadedSong.title}</h3>
                      {downloadedSong.artist && <p className="text-sm text-muted-foreground">{downloadedSong.artist}</p>}
                      <p className="text-sm text-green-500 mt-1">Downloaded successfully!</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </section>
        
        <div className="py-24">
          <BentoDemo />
        </div>
        
        {downloadedSong && (
          <section className="py-16 bg-muted/30">
            <div className="container px-4 md:px-6">
              <div className="flex flex-col items-center justify-center space-y-4 text-center">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                    Ready to Download More?
                  </h2>
                  <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                    Create an account to download more songs and access premium features
                  </p>
                </div>
                <ButtonCta onClick={handleLogin}>
                  Sign Up Now
                </ButtonCta>
              </div>
            </div>
          </section>
        )}
        
        <section className="py-16 bg-muted/50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                  Simple, Transparent Pricing
                </h2>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Choose the plan that&apos;s right for you
                </p>
              </div>
            </div>
            <PricingSectionDemo />
          </div>
        </section>
      </main>
    </div>
  );
}


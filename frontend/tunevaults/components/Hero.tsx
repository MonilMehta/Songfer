"use client";
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import WaveformAnimation from './WaveformAnimation'
import apiCaller from '@/utils/apiCaller'

const Hero: React.FC = () => {
  const [url, setUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadedSong, setDownloadedSong] = useState<any>(null)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
    }
  }, [router])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please login to download songs.",
        variant: "destructive"
      });
      router.push('/login');
      return;
    }

    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube or Spotify URL.",
        variant: "destructive"
      });
      return;
    }

    setDownloading(true);
    setProgress(0);

    try {
      const response = await apiCaller('songs/download/', 'POST', { url }, {
        responseType: 'blob',
        headers: {
          'Accept': 'audio/mpeg, application/json',
        }
      });

      if (response.status === 401) {
        toast({
          title: "Session Expired",
          description: "Please login again.",
          variant: "destructive"
        });
        router.push('/login');
        return;
      }

      if (!response) {
        throw new Error("No response received from the server.");
      }
      const contentType = response.headers['content-type'];
      if (contentType.includes('audio/mpeg')) {
        const contentDisposition = response.headers['content-disposition'];
        const filenameMatch = contentDisposition?.match(/filename="(.+)"/) || [];
        const defaultFilename = filenameMatch[1] || 'download.mp3';
      
        // Retrieve headers
        const songTitle = response.headers['x-song-title'] || defaultFilename;
        const songArtist = response.headers['x-song-artist'] || 'Unknown Artist';
        const thumbnailUrl = response.headers['x-thumbnail-url'];

        // Use songTitle for the filename
        const filename = songTitle;

        // Download the file
        await handleDownload(response.data, filename);

        // Update state for UI
        setDownloadedSong({
          title: songTitle,
          artist: songArtist,
          thumbnail: thumbnailUrl,
          status: 'Downloaded successfully',
        });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const data = JSON.parse(reader.result as string);
          if (data.message) {
            toast({
              title: "Download Started",
              description: data.message,
            });
          }
        };
        reader.readAsText(response.data);
      }

      setProgress(100);
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: "Download Failed",
        description: error.message || "An error occurred while downloading the song.",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-background to-primary/10 py-20 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center text-center">
          <motion.h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            Unlock Your{' '}
            <span className="bg-gradient-to-r from-primary to-purple-600 text-transparent bg-clip-text">
              Musical Vault
            </span>
          </motion.h1>
          <motion.p
            className="text-xl text-muted-foreground mb-8 max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Download, discover, and enjoy your favorite tunes from YouTube and Spotify. Your personal music treasure trove awaits!
          </motion.p>
          <div className="w-full max-w-2xl mb-8">
            <WaveformAnimation />
          </div>
          <motion.form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Input
              placeholder="Enter YouTube or Spotify URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-grow"
            />
            <Button type="submit" size="lg" disabled={downloading}>
              {downloading ? 'Downloading...' : 'Start Downloading'}
            </Button>
          </motion.form>
          {downloading && (
            <div className="w-full max-w-2xl mt-4">
              <div className="h-2 bg-gray-200 rounded">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
          {downloadedSong && (
            <div className="border p-4 mt-4">
              {downloadedSong.thumbnail && (
                <img
                  src={downloadedSong.thumbnail}
                  alt="Song thumbnail"
                  className="h-24 w-24 object-cover mb-2"
                />
              )}
              <h2 className="font-bold">{downloadedSong.title}</h2>
              {downloadedSong.artist && <p>Artist: {downloadedSong.artist}</p>}
              <p>{downloadedSong.status}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Hero;
import Hero from '@/components/Hero'
import FeatureCard from '@/components/FeatureCard'
import { Download, Music, Headphones, Zap, Share2, Lock } from 'lucide-react'

export default function Home() {
  return (
    <div>
      <Hero />
      <div className="container mx-auto px-4 py-12">
        <h2 className="text-3xl font-semibold mb-8 text-center">Amazing Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            title="Download Music"
            description="Easily download your favorite tracks from YouTube and Spotify."
            icon={<Download className="w-6 h-6" />}
          />
          <FeatureCard
            title="Discover New Tunes"
            description="Get personalized recommendations based on your music taste."
            icon={<Music className="w-6 h-6" />}
          />
          <FeatureCard
            title="Offline Listening"
            description="Enjoy your downloaded music anytime, anywhere, even without an internet connection."
            icon={<Headphones className="w-6 h-6" />}
          />
          <FeatureCard
            title="Lightning Fast"
            description="Experience rapid downloads and smooth performance."
            icon={<Zap className="w-6 h-6" />}
          />
          <FeatureCard
            title="Share Playlists"
            description="Create and share your curated playlists with friends."
            icon={<Share2 className="w-6 h-6" />}
          />
          <FeatureCard
            title="Secure Storage"
            description="Your music library is securely stored and backed up."
            icon={<Lock className="w-6 h-6" />}
          />
        </div>
      </div>
    </div>
  )
}


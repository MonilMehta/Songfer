"use client";
import { useEffect } from 'react'
import { motion, useScroll, useTransform, stagger, useAnimate } from 'framer-motion'
import { ChevronDown, Disc } from 'lucide-react'
import Floating, { FloatingElement } from '@/components/ui/parallax-floating'
import { ButtonCta } from '@/components/ui/button-shiny'

// Album cover images for the parallax effect
const albumCovers = [
  {
    url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop",
    title: "Vinyl Record",
  },
  {
    url: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?q=80&w=2070&auto=format&fit=crop",
    title: "Music Studio",
  },
  {
    url: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=2070&auto=format&fit=crop",
    title: "Headphones",
  },
  {
    url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop",
    title: "Vinyl Collection",
  },
  {
    url: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?q=80&w=2070&auto=format&fit=crop",
    title: "Music Equipment",
  },
  {
    url: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=2070&auto=format&fit=crop",
    title: "Audio Device",
  },
  {
    url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop",
    title: "Record Player",
  },
  {
    url: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?q=80&w=2070&auto=format&fit=crop",
    title: "Studio Microphone",
  },
]

const Hero: React.FC = () => {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 500], [0, 150])
  const opacity = useTransform(scrollY, [0, 300], [1, 0])
  const [scope, animate] = useAnimate()

  useEffect(() => {
    animate("img", { opacity: [0, 1] }, { duration: 0.5, delay: stagger(0.15) })
  }, [animate])

  const scrollToDownload = () => {
    const downloadSection = document.getElementById('download-section')
    if (downloadSection) {
      downloadSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-background to-background/80" ref={scope}>
      {/* Parallax Album Covers */}
      <Floating sensitivity={-1} className="overflow-hidden">
        <FloatingElement depth={0.5} className="top-[8%] left-[11%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[0].url}
            alt={albumCovers[0].title}
            className="w-16 h-16 md:w-32 md:h-32 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[10%] left-[32%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[1].url}
            alt={albumCovers[1].title}
            className="w-20 h-20 md:w-28 md:h-28 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        <FloatingElement depth={2} className="top-[2%] left-[53%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[2].url}
            alt={albumCovers[2].title}
            className="w-28 h-40 md:w-44 md:h-58 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[4%] left-[83%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[3].url}
            alt={albumCovers[3].title}
            className="w-24 h-24 md:w-36 md:h-36 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>

        <FloatingElement depth={1} className="top-[40%] left-[2%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[4].url}
            alt={albumCovers[4].title}
            className="w-28 h-28 md:w-36 md:h-36 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        <FloatingElement depth={2} className="top-[70%] left-[77%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[5].url}
            alt={albumCovers[5].title}
            className="w-28 h-28 md:w-36 md:h-48 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>

        <FloatingElement depth={4} className="top-[73%] left-[15%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[6].url}
            alt={albumCovers[6].title}
            className="w-40 md:w-52 h-full object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        <FloatingElement depth={1} className="top-[78%] left-[50%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={albumCovers[7].url}
            alt={albumCovers[7].title}
            className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
      </Floating>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60"
        >
          TuneVault
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 text-muted-foreground max-w-2xl"
        >
          Your personal music treasure trove. Download, organize, and enjoy your favorite tracks.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-md mx-auto"
        >
          <ButtonCta
            label="Try Free Download Now" 
            onClick={scrollToDownload}
            className="w-fit mx-auto px-8 py-3 flex items-center justify-center gap-2"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="inline-flex mr-2"
            >
              <Disc size={20} className="text-white" />
            </motion.div>
          </ButtonCta>
        </motion.div>
      </div>

      {/* Scroll Down Indicator */}
      <motion.div 
        style={{ opacity }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 cursor-pointer"
        onClick={scrollToDownload}
      >
        <ChevronDown className="w-8 h-8 animate-bounce" />
      </motion.div>
    </div>
  );
};

export default Hero;
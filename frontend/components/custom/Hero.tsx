/* eslint-disable */
"use client";
import { useEffect, useState } from 'react'
import { motion, useScroll, useTransform, stagger, useAnimate } from 'framer-motion'
import { ChevronDown, Disc } from 'lucide-react'
import Floating, { FloatingElement } from '@/components/ui/parallax-floating'
import { ButtonCta } from '@/components/ui/button-shiny'

// Full list of album cover images
const allAlbumCovers = [
  {
    url: "/album-covers/21pilots.jpg",
    title: "21 Pilots",
  },
  {
    url: "/album-covers/Avici.jpg",
    title: "Avicii",
  },
  {
    url: "/album-covers/coldplay.jpg",
    title: "Coldplay",
  },
  {
    url: "/album-covers/Eminem.jpg",
    title: "Eminem",
  },
  {
    url: "/album-covers/Frank.jpeg",
    title: "Frank Ocean",
  },
  {
    url: "/album-covers/future.jpeg",
    title: "Future",
  },
  {
    url: "/album-covers/hardwell.jpg",
    title: "Hardwell",
  },
  {
    url: "/album-covers/Kanye.jpg",
    title: "Kanye West",
  },
  {
    url: "/album-covers/LinkingPark.jpeg",
    title: "Linkin Park",
  },
  {
    url: "/album-covers/Nirvana.jpg",
    title: "Nirvana",
  },
  {
    url: "/album-covers/SM.jpg",
    title: "Shawn Mendes",
  },
  {
    url: "/album-covers/Tyler.jpeg",
    title: "Tyler, the Creator",
  },
];

// Function to shuffle an array (Fisher-Yates shuffle)
function shuffleArray<T>(array: T[]): T[] {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array]; // Create a copy
  
  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }

  return newArray;
}

const Hero: React.FC = () => {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 500], [0, 150])
  const opacity = useTransform(scrollY, [0, 300], [1, 0])
  const [scope, animate] = useAnimate()
  const [displayedCovers, setDisplayedCovers] = useState(allAlbumCovers.slice(0, 8)); // Initial state

  useEffect(() => {
    // Shuffle and set the covers on component mount
    setDisplayedCovers(shuffleArray(allAlbumCovers).slice(0, 8));

    // Animate images
    animate("img", { opacity: [0, 1] }, { duration: 0.5, delay: stagger(0.15) })
  }, [animate]) // Rerun animation logic if animate changes

  const scrollToDownload = () => {
    const downloadSection = document.getElementById('download-section')
    if (downloadSection) {
      downloadSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Ensure we have enough covers before rendering
  if (displayedCovers.length < 8) {
    return null; // Or a loading state
  }

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-b from-background to-background/80" ref={scope}>
      {/* Parallax Album Covers - Using randomized displayedCovers */}
      <Floating sensitivity={-1} className="overflow-hidden">
        {/* Hidden on mobile */}
        <FloatingElement depth={0.5} className="top-[4%] left-[11%] hidden md:block">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[0].url}
            alt={displayedCovers[0].title}
            className="w-24 h-24 md:w-48 md:h-48 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        {/* Hidden on mobile */}
        <FloatingElement depth={1} className="top-[10%] left-[32%] hidden md:block">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[1].url}
            alt={displayedCovers[1].title}
            className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        {/* Visible on mobile, adjusted position/size */}
        <FloatingElement depth={2} className="top-[5%] left-[15%] md:top-[2%] md:left-[53%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[2].url}
            alt={displayedCovers[2].title}
            className="w-28 h-28 md:w-40 md:h-44 lg:w-52 lg:h-52 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
         {/* Hidden on mobile */}
        <FloatingElement depth={1} className="top-[4%] left-[83%] hidden lg:block">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[3].url}
            alt={displayedCovers[3].title}
            className="w-36 h-36 md:w-52 md:h-52 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>

        {/* Visible on mobile, adjusted position/size */}
        <FloatingElement depth={1} className="top-[20%] left-[70%] md:top-[40%] md:left-[6%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[4].url}
            alt={displayedCovers[4].title}
            className="w-32 h-32 md:w-40 md:h-40 lg:w-52 lg:h-52 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        {/* Hidden on mobile */}
        <FloatingElement depth={2} className="top-[70%] left-[70%] ">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[5].url}
            alt={displayedCovers[5].title}
            className="w-36 h-36 md:w-52 md:h-52 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>

        {/* Visible on mobile, adjusted position/size */}
        <FloatingElement depth={4} className="top-[80%] left-[15%] md:top-[70%] md:left-[30%]">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[6].url}
            alt={displayedCovers[6].title}
            className="w-36 h-36 md:w-60 lg:w-60 md:h-60 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
          />
        </FloatingElement>
        {/* Hidden on mobile */}
        <FloatingElement depth={1} className="top-[72%] left-[50%] hidden lg:block">
          <motion.img
            initial={{ opacity: 0 }}
            src={displayedCovers[7].url}
            alt={displayedCovers[7].title}
            className="w-36 h-36 md:w-48 md:h-48 object-cover rounded-lg shadow-xl hover:scale-105 duration-200 cursor-pointer transition-transform"
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
          Songfer
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 text-muted-foreground max-w-xs sm:max-w-md md:max-w-2xl"
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
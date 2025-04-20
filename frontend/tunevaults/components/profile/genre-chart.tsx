'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Music, Tags } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface GenreDistributionItem {
  genre: string
  count: number
}

interface GenreChartProps {
  data: GenreDistributionItem[]
}

// Define a vibrant color palette for tags
const TAG_COLORS = [
  'text-pink-500',
  'text-purple-500',
  'text-blue-500',
  'text-teal-500',
  'text-amber-500',
  'text-red-500',
  'text-indigo-500',
  'text-green-500',
];

// Function to determine font size based on count (simple scaling)
const getFontSize = (count: number, maxCount: number) => {
  if (maxCount <= 1) return 'text-sm'; // Base size if all counts are 1
  const scale = Math.max(0.8, Math.min(2, 0.8 + (count / maxCount) * 1.2)); // Scale between 0.8rem and 2rem
  // Use Tailwind JIT mode for dynamic classes (ensure it's enabled)
  // Or use inline styles for simplicity if JIT is complex
  // return `text-[${scale}rem]`; // Requires Tailwind JIT
  // Using inline style for broader compatibility:
  return { fontSize: `${scale}rem`, lineHeight: `${scale * 1.2}rem` }; 
};

export function GenreChart({ data }: GenreChartProps) {
  const processedGenres = React.useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Sort for consistent cloud layout, maybe alphabetically?
    const sortedData = [...data].sort((a, b) => a.genre.localeCompare(b.genre));
    const maxCount = Math.max(...sortedData.map(item => item.count), 1); // Avoid maxCount being 0
    
    return sortedData.map((item, index) => ({
      ...item,
      style: getFontSize(item.count, maxCount),
      colorClass: TAG_COLORS[index % TAG_COLORS.length],
    }));
  }, [data]);

  if (!processedGenres || processedGenres.length === 0) {
    return (
      <Card className="h-full flex flex-col items-center justify-center bg-muted/30 border border-dashed min-h-[350px]">
        <CardHeader className="text-center">
           <Tags className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <CardTitle>Your Genre Cloud</CardTitle>
          <CardDescription>Not enough data to visualize your music taste yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-md border-border/10 bg-card/90 backdrop-blur-sm min-h-[350px]">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Tags className="mr-2 h-5 w-5 text-primary" /> 
          Your Genre Cloud
        </CardTitle>
        <CardDescription>Genres based on your downloaded music.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-6">
        <TooltipProvider delayDuration={100}>
          {processedGenres.map((genre) => (
            <Tooltip key={genre.genre}>
              <TooltipTrigger asChild>
                <span 
                  className={`font-semibold capitalize cursor-default transition-all duration-300 hover:opacity-80 ${genre.colorClass}`}
                  style={genre.style} // Apply dynamic font size
                >
                  {genre.genre}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {genre.count} {genre.count === 1 ? 'track' : 'tracks'}
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
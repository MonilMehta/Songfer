/* eslint-disable */
'use client'

import React, { useRef, useMemo } from "react";
import { motion } from "framer-motion";
import DottedMap from "dotted-map";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Globe, Music } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from "@/components/ui/badge";

interface CountryDistributionItem {
  country: string
  count: number
}

interface CountryMapProps {
  data: CountryDistributionItem[]
}

// Mapping of country names to coordinates (Corrected Australia, Added More)
const COUNTRY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "United States": { lat: 37.0902, lng: -95.7129 },
  "United Kingdom": { lat: 55.3781, lng: -3.4360 },
  "Australia": { lat: -25.2744, lng: 133.7751 }, // Corrected longitude
  "Canada": { lat: 56.1304, lng: -106.3468 },
  "Germany": { lat: 51.1657, lng: 10.4515 },
  "France": { lat: 46.2276, lng: 2.2137 },
  "Brazil": { lat: -14.2350, lng: -51.9253 },
  "India": { lat: 20.5937, lng: 78.9629 },
  "Japan": { lat: 36.2048, lng: 138.2529 },
  "Mexico": { lat: 23.6345, lng: -102.5528 },
  "Spain": { lat: 40.4637, lng: -3.7492 },
  "Italy": { lat: 41.8719, lng: 12.5674 },
  "China": { lat: 35.8617, lng: 104.1954 },
  "South Korea": { lat: 35.9078, lng: 127.7669 },
  "Russia": { lat: 61.5240, lng: 105.3188 },
  "South Africa": { lat: -30.5595, lng: 22.9375 },
  "Nigeria": { lat: 9.0820, lng: 8.6753 },
  "Argentina": { lat: -38.4161, lng: -63.6167 },
  "Sweden": { lat: 60.1282, lng: 18.6435 },
  "Norway": { lat: 60.4720, lng: 8.4689 },
  "Netherlands": { lat: 52.1326, lng: 5.2913 },
  "Ireland": { lat: 53.1424, lng: -7.6921 },
  "New Zealand": { lat: -40.9006, lng: 174.8860 },
  "Colombia": { lat: 4.5709, lng: -74.2973 },
  "Chile": { lat: -35.6751, lng: -71.5430 },
  "Philippines": { lat: 12.8797, lng: 121.7740 },
  "Indonesia": { lat: -0.7893, lng: 113.9213 },
  "Turkey": { lat: 38.9637, lng: 35.2433 },
  "Egypt": { lat: 26.8206, lng: 30.8025 },
  // Add more countries as needed
};

// Define a base point (optional, e.g., user's location if known, or a central point)
const BASE_LOCATION = { lat: 51.5074, lng: -0.1278 }; // Example: London

export function CountryMap({ data }: CountryMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();
  const map = new DottedMap({ height: 100, grid: "diagonal" });

  const svgMap = map.getSVG({
    radius: 0.22,
    color: theme === "dark" ? "#FFFFFF40" : "#00000040",
    shape: "circle",
    backgroundColor: "transparent", // Make background transparent
  });

  // Prepare dots data for the map based on input data
  const dots = useMemo(() => {
    return data
      .filter(item => COUNTRY_COORDINATES[item.country])
      .sort((a, b) => b.count - a.count)
      .slice(0, 15) // Show slightly more points if available
      .map(item => ({
        start: BASE_LOCATION, // Use a fixed start point or make it dynamic
        end: { ...COUNTRY_COORDINATES[item.country], label: item.country, count: item.count },
      }));
  }, [data]);

  const projectPoint = (lat: number, lng: number) => {
    // Adjust projection logic if needed based on DottedMap's coordinate system
    // Assuming a standard Mercator-like projection for viewBox 0 0 800 400
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  const createCurvedPath = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const midX = start.x + dx * 0.5;
    const midY = start.y + dy * 0.5;
    // Control point calculation for curve height
    const controlY = Math.min(start.y, end.y) - Math.abs(dx) * 0.2;
    return `M ${start.x} ${start.y} Q ${midX} ${controlY} ${end.x} ${end.y}`;
  };

  const lineColor = "hsl(var(--primary))"; // Use theme primary color

  if (!data || data.length === 0) {
    return (
      <Card className="h-full flex flex-col items-center justify-center bg-muted/30 border border-dashed min-h-[350px]">
        <CardHeader className="text-center">
          <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <CardTitle>Global Music Origins</CardTitle>
          <CardDescription>No country data available yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-md border-border/10 bg-card/90 backdrop-blur-sm overflow-hidden min-h-[350px]">
      <CardHeader>
        <CardTitle className="flex items-center text-lg">
          <Globe className="mr-2 h-5 w-5 text-primary" /> Global Music Origins
        </CardTitle>
        <CardDescription>Where your music comes from.</CardDescription>
      </CardHeader>
      <CardContent className="p-0 relative aspect-[2/1]">
        <TooltipProvider delayDuration={100}>
          <div className="w-full h-full relative">
            {/* Base map image */}
            <Image
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
              className="h-full w-full object-cover pointer-events-none select-none"
              alt="world map background"
              fill
              draggable={false}
            />
            {/* SVG overlay for paths and points */}
            <svg
              ref={svgRef}
              viewBox="0 0 800 400" // Ensure this matches projection logic
              className="w-full h-full absolute inset-0 pointer-events-none select-none"
            >
              <defs>
                <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0" />
                  <stop offset="15%" stopColor={lineColor} stopOpacity="1" />
                  <stop offset="85%" stopColor={lineColor} stopOpacity="1" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Draw curved paths */}
              {dots.map((dot, i) => {
                const startPoint = projectPoint(dot.start.lat, dot.start.lng);
                const endPoint = projectPoint(dot.end.lat, dot.end.lng);
                return (
                  <motion.path
                    key={`path-${i}`}
                    d={createCurvedPath(startPoint, endPoint)}
                    fill="none"
                    stroke="url(#path-gradient)"
                    strokeWidth="1.5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: 1.2,
                      delay: 0.3 * i,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}

              {/* Draw end points with tooltips and animation */}
              {dots.map((dot, i) => {
                const point = projectPoint(dot.end.lat, dot.end.lng);
                const markerBaseRadius = 4; // Increase base radius for the marker
                const pulseMaxRadius = markerBaseRadius * 2.5; // Make pulse larger
                const iconSize = 14; // Increase icon size

                return (
                  <Tooltip key={`tooltip-${i}`}>
                    <TooltipTrigger asChild>
                      {/* Make the <g> element the trigger and interactive */}
                      <g
                        transform={`translate(${point.x}, ${point.y})`}
                        className="pointer-events-auto cursor-pointer" // Ensure group is interactive
                      >
                        {/* Animated pulse */}
                        <motion.circle
                          r={markerBaseRadius} // Start radius
                          fill={lineColor}
                          opacity="0.5" // Start opacity
                          initial={{ scale: 1, opacity: 0.5 }}
                          animate={{
                            // Animate scale and opacity
                            scale: [1, pulseMaxRadius / markerBaseRadius, 1],
                            opacity: [0.5, 0, 0.5],
                          }}
                          transition={{
                            duration: 2.0, // Slightly slower pulse
                            repeat: Infinity,
                            delay: 0.3 * i + 0.5, // Stagger animation start
                            ease: "easeInOut",
                          }}
                        />
                        {/* Static center circle - slightly larger */}
                        <circle r={markerBaseRadius} fill={lineColor} />
                        {/* Music Icon inside the circle - larger and centered */}
                       
                      </g>
                    </TooltipTrigger>
                    {/* Ensure TooltipContent is correctly associated */}
                    <TooltipContent side="top" className="bg-background/90 backdrop-blur-sm border-border/50 shadow-lg rounded-md px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {/* Ensure text color is visible */}
                        <span className="font-semibold text-sm text-foreground">{dot.end.label}</span> 
                        <Badge variant="secondary" className="text-xs px-1.5 py-0.5">{dot.end.count}</Badge>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </svg>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
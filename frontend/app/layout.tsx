/* eslint-disable */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import Footer from "@/components/custom/Footer";
import Navbar from "@/components/custom/Navbar";
import { PlayerProvider } from '@/context/PlayerContext'
import { UserProfileProvider } from '@/context/UserProfileContext'
import { AuthProvider } from "@/components/auth-provider";
import { FloatingPlayerBar } from '@/components/player/FloatingPlayerBar'; // Import the player bar
import { Analytics } from "@vercel/analytics/react"
const inter = Inter({ subsets: ["latin"] });

// Updated Metadata
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://songfer.vercel.app'),
  // New Title
  title: "Download YouTube & Spotify Songs Free",
  // New Description
  description: "Download up to 50 songs daily from YouTube & Spotify in premium MP3 or AAC formats. High audio quality. Easy, fast, and free. Start downloading music today with Songfer!",
  // Updated Icons (assuming logo.svg and logo.ico are in /public)
  icons: {
    icon: "/logo.ico", // Path to .ico in /public
    apple: "/logo.svg", // Path to .svg in /public (can also be a dedicated apple-touch-icon.png)
  },
  keywords: ["music", "download", "youtube", "spotify", "mp3", "aac", "high quality", "songfer", "free music downloader", "youtube downloader", "spotify downloader"],
  authors: [{ name: "Songfer" }],
  robots: { index: true, follow: true },
  // Updated Google Verification Code
  verification: {
    google: "1_m8HFrcva-hhyZtlxH69QlTufF57fTV_kzS1GnP7lo",
  },
  openGraph: {
    // Updated OG Title
    title: "Download YouTube & Spotify Songs Free",
    // Updated OG Description
    description: "Download up to 50 songs daily from YouTube & Spotify in premium MP3 or AAC formats. High audio quality. Easy, fast, and free.",
    // Corrected URL
    url: "https://songfer.vercel.app",
    images: [
      {
        // Path to logo in /public
        url: "/logo.svg", // Use relative path for public assets
        width: 512, // Specify dimensions if known
        height: 512,
        alt: 'Songfer Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  // Added theme-color via metadata
  themeColor: '#000000',
  // Added Twitter card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'Download YouTube & Spotify Songs Free',
    description: 'Download up to 50 songs daily from YouTube & Spotify in premium MP3 or AAC formats.',
    images: ['/logo.svg'], // Use relative path for public assets
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Remove manual head tags handled by metadata object */}
      <head>
         {/* Keep essential tags not directly controlled by standard metadata fields if necessary */}
         {/* Viewport is automatically handled by Next.js unless you need specific overrides */}
         <meta name="viewport" content="width=device-width, initial-scale=1.0" />
         {/* theme-color is now handled by metadata */}
         {/* google-site-verification is now handled by metadata */}
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <PlayerProvider>
              <UserProfileProvider>
                <main className="min-h-screen flex flex-col">
                  <Navbar />
                  {children}
                  <Footer />
                </main>
                <FloatingPlayerBar /> {/* Render the player bar here */}
              </UserProfileProvider>
            </PlayerProvider>
          </AuthProvider>
          <Toaster />
          <Analytics /> {/* Ensure Vercel Analytics is included */}
        </ThemeProvider>
      </body>
    </html>
  );
}


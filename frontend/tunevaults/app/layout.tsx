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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://songfer.vercel.app'),
  title: "Songfer - Download Music from YouTube and Spotify",
  description: "Download your favorite music from YouTube and Spotify in high quality MP3 and AAC formats.",
  // Define icons here, Next.js will generate the appropriate link tags
  icons: {
    icon: "/Logo.svg", // Standard favicon
    apple: "/Logo.svg", // Apple touch icon
  },
  // Add other metadata here if needed
  keywords: ["music", "download", "youtube", "spotify", "mp3", "aac", "high quality", "songfer"],
  authors: [{ name: "Songfer" }],
  robots: { index: true, follow: true },
  verification: {
    google: "your-google-site-verification-code", // Add your verification code here
  },
  openGraph: {
    title: "Songfer - Download Music from YouTube and Spotify",
    description: "Download your favorite music from YouTube and Spotify in high quality MP3 and AAC formats.",
    url: "https://www.songporter.vercel.app", // Make sure this is your actual production URL
    images: [
      {
        url: "/Logo.svg", // Provide absolute URL in production if possible
        width: 800, // Optional: Specify image dimensions
        height: 600,
        alt: 'Songfer Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  // Add theme-color if desired via metadata
  // themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Remove manual head tags that are handled by the metadata object */}
      <head>
        {/* Keep essential tags not directly controlled by standard metadata fields if necessary */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* theme-color can also be set via metadata */}
        <meta name="theme-color" content="#000000" /> 
        {/* Verification is handled by metadata, but keeping it here won't hurt if preferred */}
        {/* <meta name="google-site-verification" content="your-google-site-verification-code" /> */}
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
        </ThemeProvider>
      </body>
    </html>
  );
}


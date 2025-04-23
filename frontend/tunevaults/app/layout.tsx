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

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Songfer - Download Music from YouTube and Spotify",
  description: "Download your favorite music from YouTube and Spotify in high quality MP3 and AAC formats.",
  icons: {
    icon: "/Logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
    <link rel="apple-touch-icon" href="/Logo.svg" />
    <link rel="icon" href="/Logo.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content={metadata.description} />
    <meta name="keywords" content="music, download, youtube, spotify, mp3, aac, high quality" />
    <meta name="author" content="Songfer" />
    <meta name="robots" content="index, follow" />
    <meta name="google-site-verification" content="your-google-site-verification-code" />
    <meta property="og:title" content={metadata.title ?? "Default Title"} />
    <meta property="og:description" content={metadata.description} />
    <meta property="og:image" content="/Logo.svg" />
    <meta property="og:url" content="https://www.songporter.vercel.app" />
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
              </UserProfileProvider>
            </PlayerProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}


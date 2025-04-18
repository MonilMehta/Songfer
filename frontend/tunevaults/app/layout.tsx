import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import Footer from "@/components/custom/Footer";
import { PlayerProvider } from '@/context/PlayerContext'

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TuneVault - Download Music from YouTube and Spotify",
  description: "Download your favorite music from YouTube and Spotify in high quality MP3 and AAC formats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PlayerProvider>
            <main className="min-h-screen flex flex-col">
              {children}
              <Footer />
            </main>
          </PlayerProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}


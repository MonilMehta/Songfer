"use client";

import React from 'react';
import { Magnetic } from "@/components/ui/magnetic";
import { Github, Twitter, Linkedin, Music, Heart } from 'lucide-react';
import Link from 'next/link';

type SocialLink = {
  label: string;
  link: string;
  icon: React.ReactNode;
};

function MagneticSocialLink({
  children,
  link,
  icon
}: {
  children: React.ReactNode;
  link: string;
  icon: React.ReactNode;
}) {
  return (
    <Magnetic springOptions={{ bounce: 0 }} intensity={0.3}>
      <a
        href={link}
        className="group relative inline-flex shrink-0 items-center gap-[1px] rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-black transition-colors duration-200 hover:bg-zinc-950 hover:text-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
      >
        <span className="mr-1">{icon}</span>
        {children}
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3"
        >
          <path
            d="M3.64645 11.3536C3.45118 11.1583 3.45118 10.8417 3.64645 10.6465L10.2929 4L6 4C5.72386 4 5.5 3.77614 5.5 3.5C5.5 3.22386 5.72386 3 6 3L11.5 3C11.6326 3 11.7598 3.05268 11.8536 3.14645C11.9473 3.24022 12 3.36739 12 3.5L12 9.00001C12 9.27615 11.7761 9.50001 11.5 9.50001C11.2239 9.50001 11 9.27615 11 9.00001V4.70711L4.35355 11.3536C4.15829 11.5488 3.84171 11.5488 3.64645 11.3536Z"
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
          ></path>
        </svg>
      </a>
    </Magnetic>
  );
}

const SOCIAL_LINKS: SocialLink[] = [
  {
    label: 'Github',
    link: 'https://github.com/yourusername/Songfer',
    icon: <Github className="w-4 h-4" />
  },
  {
    label: 'Twitter',
    link: 'https://twitter.com/Songfer',
    icon: <Twitter className="w-4 h-4" />
  },
  {
    label: 'LinkedIn',
    link: 'https://linkedin.com/in/yourusername',
    icon: <Linkedin className="w-4 h-4" />
  },
];

export default function Footer() {
  return (
    <footer className="py-12 bg-background border-t">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center space-y-8">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">Songfer</h2>
          </div>
          
          <p className="text-center text-muted-foreground max-w-md">
            Your personal music treasure trove. Download, discover, and enjoy music like never before.
          </p>
          
          <div className="flex items-center justify-center space-x-3">
            {SOCIAL_LINKS.map((link) => (
              <MagneticSocialLink key={link.label} link={link.link} icon={link.icon}>
                {link.label}
              </MagneticSocialLink>
            ))}
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
            <span className="hidden md:inline">•</span>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <span className="hidden md:inline">•</span>
            <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            <p>Made with <Heart className="inline-block w-4 h-4 text-red-500" /> by a solo developer</p>
            <p className="mt-1">&copy; {new Date().getFullYear()} Songfer. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}


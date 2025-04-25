'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import Lottie from "lottie-react";
import VinylAnimation from "@/components/lottie/VinylAnimation.json";
import { AlertTriangle } from "lucide-react";

export default function Error({ reset }: { reset?: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-background/80 p-8 text-center">
            <div className="mb-8 flex flex-row items-center">
              <div className="relative flex items-center justify-center mb-4">
                <Lottie animationData={VinylAnimation} loop={true} className="w-108 h-108 mt-8" />
        </div>
        <h1 className="text-4xl font-bold mb-2 text-primary">We are experiencing high volume</h1>
      </div>
      <p className="text-lg text-muted-foreground mb-8 max-w-xl">
        Sorry, our servers are currently handling a lot of requests. Please try again in a few minutes.<br />
        If the problem persists, contact support or check our status page.
      </p>
      <Button asChild>
        <Link href="/">Go back home</Link>
      </Button>
      {reset && (
        <Button variant="outline" className="mt-4" onClick={() => reset()}>
          Try again
        </Button>
      )}
    </div>
  );
}
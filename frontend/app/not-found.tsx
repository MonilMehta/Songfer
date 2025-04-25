"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { Terminal } from 'lucide-react';

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <section className="bg-background text-foreground min-h-screen flex items-center justify-center p-4">
      <div className="container mx-auto">
        <div className="flex justify-center">
          <div className="w-full sm:w-10/12 md:w-8/12 lg:w-6/12 text-center">
            
            <div className="mb-8">
              <Terminal className="mx-auto h-20 w-20 text-primary animate-pulse" />
              <h1 className="text-center text-6xl sm:text-7xl md:text-8xl font-bold mt-4">
                404
              </h1>
            </div>

            <div className="mt-[-20px]">
              <h3 className="text-2xl sm:text-3xl font-semibold mb-3">
                Oops! Page Not Found
              </h3>
              <p className="mb-6 text-muted-foreground sm:mb-8 max-w-md mx-auto">
              Looks like this record can&apos;t find its groove. The page you&apos;re looking for doesn&apos;t exist. Let&apos;s spin you back to the homepage!
              </p>

              <Button
                variant="default"
                onClick={() => router.push('/')}
                className="my-5 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2"
              >
                Go to Homepage
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
} 
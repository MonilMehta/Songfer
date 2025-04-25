/* eslint-disable */
'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Megaphone } from 'lucide-react'
import { FeedbackFish } from '@feedback-fish/react';
import { useSession } from "next-auth/react";

export function FeedbackCard() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email;

  return (
    <FeedbackFish projectId="3633dc3af20bbf" userId={userEmail ?? undefined}>
      <Button
        size="lg"
        className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2 bg-primary text-primary-foreground shadow-xl 
        transition-all duration-300 hover:scale-105 hover:shadow-2xl group flex items-center gap-2"
        aria-label="Send feedback"
      >
        <Megaphone className="h-5 w-5 relative z-10 group-hover:animate-wiggle" />
        <span className="font-medium">Feedback</span>
      </Button>
    </FeedbackFish>
  )
}
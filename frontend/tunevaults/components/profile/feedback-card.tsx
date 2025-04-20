'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MessageSquare, Headphones, X, Send, Music, Star } from 'lucide-react'

export function FeedbackCard() {
  const [isOpen, setIsOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  
  const handleSubmit = () => {
    // In a real app, you would send this feedback to your backend
    console.log({
      type: feedbackType,
      feedback: feedbackText
    })
    
    setSubmitted(true)
    
    // Reset after showing thank you message
    setTimeout(() => {
      setSubmitted(false)
      setFeedbackType(null)
      setFeedbackText('')
      setIsOpen(false)
    }, 3000)
  }
  
  if (!isOpen) {
    return (
      <Button 
        size="lg" 
        className="rounded-full h-14 w-14 shadow-xl bg-primary text-primary-foreground fixed bottom-6 right-6 z-50 transition-all duration-300 hover:scale-110"
        aria-label="Send feedback"
        onClick={() => setIsOpen(true)}
      >
        <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-20"></div>
        <MessageSquare className="h-6 w-6" />
      </Button>
    )
  }
  
  return (
    <Card className="fixed bottom-6 right-6 z-50 w-80 md:w-96 shadow-2xl border-primary/20 overflow-hidden">
      {/* Music note decorations */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -left-4 top-10 text-primary/10 transform rotate-12">
          <Music className="h-10 w-10" />
        </div>
        <div className="absolute right-10 bottom-16 text-primary/10 transform -rotate-12">
          <Headphones className="h-12 w-12" />
        </div>
        <div className="absolute right-4 top-16 text-primary/5">
          <Star className="h-8 w-8" />
        </div>
      </div>
      
      <CardHeader className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground pb-3 relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-2 right-2 h-8 w-8 text-primary-foreground/90 hover:bg-primary-foreground/10 hover:text-primary-foreground" 
          onClick={() => setIsOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        <CardTitle className="flex items-center text-lg">
          <MessageSquare className="mr-2 h-5 w-5" />
          Music Feedback
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-4 pt-6">
        {submitted ? (
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-1">Thank You!</h3>
            <p className="text-muted-foreground">We appreciate your feedback.</p>
          </div>
        ) : feedbackType ? (
          <>
            <h3 className="font-medium mb-3">
              {feedbackType === 'suggestion' ? 'Suggest an Improvement' : 
               feedbackType === 'issue' ? 'Report an Issue' : 
               'General Feedback'}
            </h3>
            <Textarea
              placeholder="Tell us your thoughts..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full min-h-24 mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setFeedbackType(null)}
              >
                Back
              </Button>
              <Button 
                size="sm" 
                onClick={handleSubmit}
                disabled={!feedbackText.trim()}
                className="flex items-center"
              >
                <Send className="mr-1 h-4 w-4" />
                Submit
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              How can we make your music experience better?
            </p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start hover:bg-primary/10 hover:text-primary hover:border-primary"
                onClick={() => setFeedbackType('suggestion')}
              >
                <Star className="mr-2 h-4 w-4" />
                Suggest a Feature
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start hover:bg-primary/10 hover:text-primary hover:border-primary"
                onClick={() => setFeedbackType('issue')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Report an Issue
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start hover:bg-primary/10 hover:text-primary hover:border-primary"
                onClick={() => setFeedbackType('other')}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                General Feedback
              </Button>
            </div>
          </>
        )}
      </CardContent>
      
      <CardFooter className="bg-muted/30 p-3 text-xs text-center justify-center border-t">
        <div className="flex items-center text-muted-foreground">
          <Music className="h-3 w-3 mr-1" />
          Help us fine-tune your experience
        </div>
      </CardFooter>
    </Card>
  )
}
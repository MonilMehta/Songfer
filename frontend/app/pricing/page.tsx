'use client'

import { PricingSectionDemo } from '@/components/blocks/pricing-section-demo'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-8">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Choose Your Plan</h1>
        <p className="text-muted-foreground mt-2">
          Select the plan that best fits your needs
        </p>
      </div>
      
      <PricingSectionDemo />
      
      <div className="mt-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="text-left">
            <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
            <p className="text-muted-foreground">
              We accept all major credit cards, PayPal, and Apple Pay.
            </p>
          </div>
          <div className="text-left">
            <h3 className="font-semibold mb-2">Can I upgrade or downgrade my plan?</h3>
            <p className="text-muted-foreground">
              Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.
            </p>
          </div>
          <div className="text-left">
            <h3 className="font-semibold mb-2">Is there a free trial?</h3>
            <p className="text-muted-foreground">
              Yes, you can try our service with the free Starter plan which includes 10 downloads per day.
            </p>
          </div>
          <div className="text-left">
            <h3 className="font-semibold mb-2">What happens if I exceed my daily download limit?</h3>
            <p className="text-muted-foreground">
              If you reach your daily limit, you&apos;ll need to wait until the next day or upgrade to a higher plan for more downloads.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
        <p className="text-muted-foreground mb-6">
          Our support team is here to help you with any questions you may have.
        </p>
        <Button asChild>
          <Link href="/contact">Contact Support</Link>
        </Button>
      </div>
    </div>
  )
} 
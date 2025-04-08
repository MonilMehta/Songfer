"use client"

import { Sparkles, Zap, Check, Music, ArrowRight } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import confetti from 'canvas-confetti'

const defaultTiers = [
  {
    name: "Starter",
    price: {
      monthly: 0,
      yearly: 0,
    },
    description: "Perfect for casual music lovers",
    icon: (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-500/30 to-gray-500/30 blur-2xl rounded-full" />
        <Zap className="w-7 h-7 relative z-10 text-gray-500 dark:text-gray-400 animate-[float_3s_ease-in-out_infinite]" />
      </div>
    ),
    features: [
      {
        name: "10 Downloads Daily",
        description: "Download up to 10 songs per day",
        included: true,
      },
      {
        name: "Basic Audio Quality",
        description: "Standard MP3 quality downloads",
        included: true,
      },
      {
        name: "YouTube Support",
        description: "Download from YouTube videos and playlists",
        included: true,
      },
      {
        name: "Spotify Support",
        description: "Download from Spotify tracks and playlists",
        included: false,
      },
    ],
  },
  {
    name: "Premium",
    price: {
      monthly: 4.99,
      yearly: 49.99,
    },
    description: "Ideal for music enthusiasts",
    highlight: true,
    badge: "Most Popular",
    icon: (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 blur-2xl rounded-full" />
        <Sparkles className="w-7 h-7 relative z-10 text-amber-500 animate-[float_3s_ease-in-out_infinite]" />
      </div>
    ),
    features: [
      {
        name: "50 Downloads Daily",
        description: "Download up to 50 songs per day",
        included: true,
      },
      {
        name: "High Audio Quality",
        description: "Premium MP3 and AAC quality downloads",
        included: true,
      },
      {
        name: "YouTube Support",
        description: "Download from YouTube videos and playlists",
        included: true,
      },
      {
        name: "Spotify Support",
        description: "Download from Spotify tracks and playlists",
        included: true,
      },
    ],
    comparisons: [
      {
        name: "Spotify Premium",
        price: {
          monthly: 11.99,
          yearly: 99.99,
        },
        description: "Streaming only, no downloads",
      },
      {
        name: "YouTube Music",
        price: {
          monthly: 13.99,
          yearly: 119.99,
        },
        description: "Streaming only, no downloads",
      },
    ],
  },
]

export function PricingSectionDemo() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")
  const [selectedTier, setSelectedTier] = useState<string | null>(null)

  const handleSelectPlan = (tier: any, cycle: "monthly" | "yearly") => {
    setSelectedTier(tier.name)
    console.log(`Selected plan: ${tier.name} (${cycle})`)
    console.log(`Price: $${cycle === "monthly" ? tier.price.monthly : tier.price.yearly}`)
    
    // Trigger confetti for premium plan
    if (tier.name === "Premium") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      
      // Play a sound effect (optional)
      const audio = new Audio('/sounds/click.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log("Audio play failed:", e));
    }
    
    // Here you would implement the payment gateway integration
    // For now, we'll just log a message
    console.log("Redirecting to payment gateway...")
  }

  return (
    <div className="w-full py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mb-8">
            Choose the plan that's right for you. No hidden fees.
          </p>
          
          <div className="flex items-center justify-center space-x-2 bg-muted p-1 rounded-lg mb-8">
            <Button
              variant={billingCycle === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("monthly")}
              className="rounded-md"
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("yearly")}
              className="rounded-md"
            >
              Yearly
              <span className="ml-1 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                Save 17%
              </span>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {defaultTiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-8 transition-all duration-300 hover:shadow-lg",
                tier.highlight
                  ? "border-primary/50 bg-primary/5"
                  : "border-border",
                selectedTier === tier.name && "ring-2 ring-primary ring-offset-2"
              )}
            >
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    {tier.badge}
                  </div>
                </div>
              )}
              
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {tier.icon}
                  <h3 className="text-xl font-bold">{tier.name}</h3>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold">
                    ${billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly}
                  </span>
                  <span className="text-muted-foreground ml-1">/{billingCycle === "monthly" ? "month" : "year"}</span>
                </div>
                <p className="text-muted-foreground mt-1">{tier.description}</p>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature.name} className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-primary" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />
                      )}
                    </div>
                    <div>
                      <p className={cn(
                        "font-medium",
                        !feature.included && "text-muted-foreground"
                      )}>
                        {feature.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              
              {tier.comparisons && (
                <div className="mb-8 p-4 bg-muted/50 rounded-lg">
                  <h4 className="text-sm font-medium mb-3">Compare with other services:</h4>
                  <div className="space-y-3">
                    {tier.comparisons.map((comparison) => (
                      <div key={comparison.name} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{comparison.name}</p>
                          <p className="text-xs text-muted-foreground">{comparison.description}</p>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm font-medium line-through text-muted-foreground">
                            ${billingCycle === "monthly" ? comparison.price.monthly : comparison.price.yearly}
                          </span>
                          <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
                          <span className="text-sm font-medium text-green-600">
                            ${billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <Button
                className={cn(
                  "w-full",
                  tier.highlight ? "bg-primary hover:bg-primary/90" : ""
                )}
                onClick={() => handleSelectPlan(tier, billingCycle)}
              >
                {tier.name === "Starter" ? "Get Started" : "Upgrade Now"}
                {tier.name === "Premium" && <Music className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 
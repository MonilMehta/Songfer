"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface PricingTier {
  name: string
  price: {
    monthly: number
    yearly: number
  }
  description: string
  icon: React.ReactNode
  features: {
    name: string
    description: string
    included: boolean
  }[]
  highlight?: boolean
  badge?: string
}

interface PricingSectionProps {
  tiers: PricingTier[]
  onSelectPlan?: (tier: PricingTier, billingCycle: "monthly" | "yearly") => void
}

export function PricingSection({ tiers, onSelectPlan }: PricingSectionProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")

  const handleSelectPlan = (tier: PricingTier) => {
    if (onSelectPlan) {
      onSelectPlan(tier, billingCycle)
    } else {
      console.log(`Selected plan: ${tier.name} (${billingCycle})`)
      console.log(`Price: $${billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly}`)
    }
  }

  return (
    <div className="py-12">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Choose the plan that's right for you
            </p>
          </div>
          <div className="flex items-center space-x-2 rounded-lg border p-1">
            <Button
              variant={billingCycle === "monthly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("monthly")}
              className="rounded-md px-3"
            >
              Monthly
            </Button>
            <Button
              variant={billingCycle === "yearly" ? "default" : "ghost"}
              size="sm"
              onClick={() => setBillingCycle("yearly")}
              className="rounded-md px-3"
            >
              Yearly
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Save 20%
              </span>
            </Button>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 pt-12 md:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={cn(
                "flex flex-col",
                tier.highlight && "border-primary shadow-lg"
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {tier.badge && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {tier.badge}
                    </span>
                  )}
                </div>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-bold">
                    ${billingCycle === "monthly" ? tier.price.monthly : tier.price.yearly}
                  </span>
                  <span className="ml-1 text-muted-foreground">/{billingCycle === "monthly" ? "month" : "year"}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature.name} className="flex items-start">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          feature.included ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div>
                        <span
                          className={cn(
                            "text-sm",
                            feature.included ? "font-medium" : "text-muted-foreground"
                          )}
                        >
                          {feature.name}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={tier.highlight ? "default" : "outline"}
                  onClick={() => handleSelectPlan(tier)}
                >
                  {tier.name === "Starter" ? "Get Started" : "Upgrade"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
} 
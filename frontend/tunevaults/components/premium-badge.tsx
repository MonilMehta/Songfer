import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Crown } from 'lucide-react'

interface PremiumBadgeProps {
  isPremium: boolean
  savingsAmount?: number
}

export function PremiumBadge({ isPremium, savingsAmount }: PremiumBadgeProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {isPremium ? 'Premium Member' : 'Free Member'}
        </CardTitle>
        <Crown className={`h-4 w-4 ${isPremium ? 'text-yellow-500' : 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-4">
          <div className="space-y-1">
            {isPremium ? (
              <>
                <p className="text-2xl font-bold">Premium</p>
                {savingsAmount && (
                  <p className="text-xs text-muted-foreground">
                    Saved ${savingsAmount.toFixed(2)} this month
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">Free</p>
                <p className="text-xs text-muted-foreground">
                  Upgrade to Premium for more downloads
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 
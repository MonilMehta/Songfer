import * as React from 'react'
import { cn } from '@/lib/utils'

interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  size?: 'sm' | 'md' | 'lg'
  strokeWidth?: number
  showValue?: boolean
}

export function CircularProgress({
  value,
  size = 'md',
  strokeWidth = 4,
  showValue = true,
  className,
  ...props
}: CircularProgressProps) {
  const radius = size === 'sm' ? 20 : size === 'md' ? 30 : 40
  const circumference = 2 * Math.PI * radius
  const progress = value / 100
  const dashOffset = circumference * (1 - progress)

  const sizeClass = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  }

  return (
    <div className={cn('relative inline-flex items-center justify-center', sizeClass[size], className)} {...props}>
      <svg className="transform -rotate-90" viewBox={`0 0 ${radius * 2 + strokeWidth} ${radius * 2 + strokeWidth}`}>
        <circle
          className="stroke-gray-200 dark:stroke-gray-700 fill-none"
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="stroke-primary fill-none transition-all duration-300 ease-in-out"
          cx={radius + strokeWidth / 2}
          cy={radius + strokeWidth / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium">{Math.round(value)}%</span>
        </div>
      )}
    </div>
  )
} 
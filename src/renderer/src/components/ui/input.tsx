import * as React from 'react'
import { cn } from '@renderer/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:border-primary',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
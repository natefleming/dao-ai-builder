import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-slate-700 text-slate-300',
      success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      danger: 'bg-red-500/20 text-red-400 border-red-500/30',
      info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };

    return (
      <span
        ref={ref}
        className={clsx(
          'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;


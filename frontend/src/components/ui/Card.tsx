import { HTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'highlight';
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-slate-800/50 border-slate-700/50',
      interactive: 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/70 cursor-pointer transition-all duration-200',
      highlight: 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30',
    };

    return (
      <div
        ref={ref}
        className={clsx(
          'rounded-xl border p-4',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;


import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils';

const buttonVariants = cva(
    // Base styles
    [
        'inline-flex items-center justify-center gap-2',
        'font-semibold rounded-xl',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:pointer-events-none',
        'active:scale-95',
        'spring-tap',
    ],
    {
        variants: {
            variant: {
                primary: [
                    'bg-brand text-white',
                    'hover:bg-brand-hover hover:-translate-y-0.5',
                    'shadow-[var(--glow-brand)]',
                    'hover:shadow-[var(--glow-brand-hover)]',
                ],
                secondary: [
                    'bg-foreground text-background',
                    'hover:bg-foreground/90 hover:-translate-y-0.5',
                    'shadow-sm hover:shadow-md',
                ],
                ghost: [
                    'bg-transparent text-foreground/80',
                    'hover:bg-foreground/5 hover:text-foreground',
                    'border border-transparent hover:border-border',
                ],
                outline: [
                    'bg-transparent border border-border text-foreground',
                    'hover:bg-foreground/5 hover:border-border-strong',
                ],
                danger: [
                    'bg-error/10 text-error border border-error/30',
                    'hover:bg-error hover:text-white hover:border-transparent',
                ],
            },
            size: {
                sm: 'h-8  px-3  text-xs',
                md: 'h-10 px-4  text-sm',
                lg: 'h-12 px-6  text-sm',
                xl: 'h-14 px-8  text-base',
                icon: 'h-10 w-10 p-0',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'lg',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
    loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, isLoading, loadingText, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(buttonVariants({ variant, size }), className)}
                disabled={disabled || isLoading}
                aria-busy={isLoading}
                aria-disabled={disabled || isLoading}
                {...props}
            >
                {isLoading ? (
                    <>
                        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" role="status" aria-label="Loading" />
                        <span className="animate-pulse">{loadingText ?? 'Loading...'}</span>
                    </>
                ) : (
                    children
                )}
            </button>
        );
    }
);

Button.displayName = 'Button';

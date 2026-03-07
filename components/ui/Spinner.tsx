import React from 'react';
import { cn } from '@/utils';

interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    label?: string;
    fullScreen?: boolean;
    inline?: boolean;
}

const sizeMap = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-2',
    xl: 'h-16 w-16 border-2',
};

export const Spinner: React.FC<SpinnerProps> = ({
    size = 'md',
    className,
    label = 'Loading',
    fullScreen,
    inline,
}) => (
    <div
        role="status"
        aria-label={label}
        className={cn(
            'flex justify-center items-center',
            fullScreen && 'min-h-screen',
            inline ? 'h-full' : 'p-4',
            className
        )}
    >
        <div
            className={cn(
                'animate-spin rounded-full border-foreground/20 border-t-brand',
                sizeMap[size]
            )}
        />
        <span className="sr-only">{label}</span>
    </div>
);

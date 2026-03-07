import React from 'react';
import { cn } from '@/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, hint, id, ...props }, ref) => {
        const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="block text-xs font-semibold tracking-wide text-foreground/70 uppercase ml-0.5"
                    >
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={cn(
                        'w-full bg-background/50 border rounded-xl px-4 py-3.5 text-sm',
                        'placeholder:text-foreground/40',
                        'outline-none transition-all duration-200',
                        'focus:border-brand focus:ring-1 focus:ring-brand focus:bg-background/70',
                        error
                            ? 'border-error/60 focus:border-error focus:ring-error/50'
                            : 'border-border',
                        className
                    )}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                    {...props}
                />
                {error && (
                    <p id={`${inputId}-error`} role="alert" className="text-error text-xs font-medium ml-0.5 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {error}
                    </p>
                )}
                {hint && !error && (
                    <p id={`${inputId}-hint`} className="text-foreground/50 text-xs ml-0.5">{hint}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

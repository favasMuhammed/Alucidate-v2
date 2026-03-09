import React, { useRef, useCallback, KeyboardEvent, ClipboardEvent } from 'react';
import { cn } from '@/utils';

interface OtpInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    length?: number;
    disabled?: boolean;
    hasError?: boolean;
    autoFocus?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({
    value,
    onChange,
    length = 6,
    disabled,
    hasError,
    autoFocus,
}) => {
    const refs = useRef<(HTMLInputElement | null)[]>([]);

    const focus = useCallback((index: number) => {
        refs.current[index]?.focus();
    }, []);

    const handleChange = useCallback((index: number, rawVal: string) => {
        // Handle paste
        if (rawVal.length > 1) {
            const pasted = rawVal.replace(/\D/g, '').slice(0, length).split('');
            const next = [...value];
            pasted.forEach((char, i) => {
                if (index + i < length) next[index + i] = char;
            });
            onChange(next);
            focus(Math.min(index + pasted.length, length - 1));
            return;
        }

        const digit = rawVal.replace(/\D/g, '');
        const next = [...value];
        next[index] = digit;
        onChange(next);
        if (digit && index < length - 1) focus(index + 1);
    }, [value, onChange, length, focus]);

    const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !value[index] && index > 0) {
            focus(index - 1);
        }
        if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            focus(index - 1);
        }
        if (e.key === 'ArrowRight' && index < length - 1) {
            e.preventDefault();
            focus(index + 1);
        }
    }, [value, focus, length]);

    const handlePaste = useCallback((index: number, e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length).split('');
        const next = [...value];
        pasted.forEach((char, i) => {
            if (index + i < length) next[index + i] = char;
        });
        onChange(next);
        focus(Math.min(index + pasted.length, length - 1));
    }, [value, onChange, length, focus]);

    return (
        <div
            className="flex justify-center gap-2 sm:gap-3"
            role="group"
            aria-label="One-time password input"
        >
            {Array.from({ length }).map((_, index) => (
                <input
                    key={index}
                    ref={el => { refs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={value[index] ?? ''}
                    onChange={e => handleChange(index, e.target.value)}
                    onKeyDown={e => handleKeyDown(index, e)}
                    onPaste={e => handlePaste(index, e)}
                    onFocus={e => e.target.select()}
                    disabled={disabled}
                    autoFocus={autoFocus && index === 0}
                    aria-label={`Digit ${index + 1} of ${length}`}
                    className={cn(
                        'w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold',
                        'bg-background/50 rounded-xl border outline-none',
                        'transition-all duration-200',
                        'focus:ring-2 focus:ring-offset-0',
                        hasError
                            ? 'border-error/60 focus:border-error focus:ring-error/30 text-error'
                            : 'border-border focus:border-brand focus:ring-brand/30',
                        value[index] && !hasError && 'border-brand/60 bg-brand/5',
                        disabled && 'opacity-50 cursor-not-allowed'
                    )}
                />
            ))}
        </div>
    );
};

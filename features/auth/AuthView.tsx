import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendOTP, verifyOTP } from '@/services/otpService';
import { dbService } from '@/services/dbService';
import { User } from '@/types';
import { cn } from '@/utils';
import { useFadeUp } from '@/hooks/useScrollAnimation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { OtpInput } from '@/components/ui/OtpInput';

const AlucidateLogo: React.FC = () => (
    <h1 className="text-4xl sm:text-5xl font-light tracking-wider text-foreground">
        <span className="font-bold shimmer-text">AI</span>
        <span className="font-light">ucidate</span>
    </h1>
);

interface AuthViewProps {
    onLogin: (user: User) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [step, setStep] = useState<'email' | 'otp'>('email');

    const [email, setEmail] = useState('');
    const [signupName, setSignupName] = useState('');
    const [signupClass, setSignupClass] = useState('');
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.1 });

    // Cooldown timer
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    // Play subtle success sound via Web Audio API
    const playSuccessSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch {
            // Silently fail — audio isn't critical
        }
    }, []);

    const playClickSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
        } catch {
            // Silently fail
        }
    }, []);

    const handleSendOTP = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');
        playClickSound();

        if (!isLogin && (!signupName.trim() || !signupClass.trim() || !email.trim())) {
            setError('Please fill out all fields.');
            return;
        }

        setIsLoading(true);
        try {
            const existingUser = await dbService.getUser(email.trim().toLowerCase());
            if (isLogin && !existingUser) {
                setError('No account found with that email. Please sign up first.');
                setIsLoading(false);
                return;
            }
            if (!isLogin && existingUser) {
                setError('An account with this email already exists. Please log in.');
                setIsLoading(false);
                return;
            }

            await sendOTP(email.trim().toLowerCase());
            setStep('otp');
            setCooldown(30);
        } catch (err: any) {
            setError(err.message || 'Failed to send verification code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = otpCode.join('');
        if (code.length !== 6) {
            setError('Please enter all 6 digits.');
            return;
        }

        setError('');
        setIsLoading(true);
        try {
            await verifyOTP(email.trim().toLowerCase(), code);
            playSuccessSound();

            if (isLogin) {
                const user = await dbService.getUser(email.trim().toLowerCase());
                if (user) onLogin(user);
                else setError('Account not found. Please try again.');
            } else {
                const newUser: User = {
                    name: signupName.trim(),
                    className: signupClass.trim(),
                    email: email.trim().toLowerCase(),
                };
                await dbService.addUser(newUser);
                onLogin(newUser);
            }
        } catch (err: any) {
            setError(err.message || 'Invalid code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setStep('email');
        setOtpCode(['', '', '', '', '', '']);
        setError('');
        playClickSound();
    };

    const handleModeSwitch = () => {
        setIsLogin(l => !l);
        setError('');
        playClickSound();
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 bg-background cosmic-bg overflow-hidden relative">
            {/* Ambient glow blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-[20%] -left-[10%] w-[55%] h-[55%] rounded-full bg-brand/8 blur-[140px] animate-pulse" style={{ animationDuration: '6s' }} />
                <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] rounded-full bg-info/6 blur-[120px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '1s' }} />
                <div className="absolute top-[40%] left-[40%] w-[25%] h-[25%] rounded-full bg-brand/4 blur-[80px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
            </div>

            <div ref={containerRef} className="max-w-md w-full relative z-10">
                {/* Logo */}
                <div data-animate className="text-center mb-10">
                    <AlucidateLogo />
                    <p className="mt-3 text-sm text-foreground/60 tracking-wide">
                        {step === 'email'
                            ? (isLogin ? 'Welcome back. Enter your email to continue.' : 'Create your student account.')
                            : `Enter the 6-digit code sent to ${email}`}
                    </p>
                </div>

                {/* Card */}
                <div
                    data-animate
                    className="bg-elevated/80 backdrop-blur-2xl p-8 sm:p-10 rounded-[var(--radius-2xl)] border border-border shadow-2xl relative overflow-hidden neon-border"
                >
                    {/* Card decorative blur */}
                    <div className="absolute -top-20 -right-20 w-48 h-48 bg-brand/8 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

                    {step === 'email' ? (
                        <form onSubmit={handleSendOTP} className="space-y-5 relative z-10" noValidate>
                            {!isLogin && (
                                <>
                                    <Input
                                        label="Full Name"
                                        id="signup-name"
                                        type="text"
                                        value={signupName}
                                        onChange={e => setSignupName(e.target.value)}
                                        placeholder="John Doe"
                                        required
                                        autoComplete="name"
                                    />
                                    <Input
                                        label="Class / Year"
                                        id="signup-class"
                                        type="text"
                                        value={signupClass}
                                        onChange={e => setSignupClass(e.target.value)}
                                        placeholder="e.g. Class 12 / Year 2"
                                        required
                                    />
                                </>
                            )}

                            <Input
                                label="Email Address"
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoComplete="email"
                            />

                            {error && (
                                <p role="alert" className="text-error text-xs font-medium flex items-center gap-1 animate-fade-up">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {error}
                                </p>
                            )}

                            <Button
                                type="submit"
                                variant={isLogin ? 'primary' : 'secondary'}
                                size="xl"
                                isLoading={isLoading}
                                loadingText="Sending code..."
                                className="w-full mt-4"
                            >
                                {isLogin ? 'Send Login Code' : 'Create Account'}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyOTP} className="space-y-6 relative z-10" noValidate>
                            <div className="text-center space-y-1">
                                <p className="text-sm font-semibold text-foreground">{email}</p>
                                <p className="text-xs text-foreground/50">Check your inbox and spam folder</p>
                            </div>

                            <OtpInput
                                value={otpCode}
                                onChange={setOtpCode}
                                hasError={!!error}
                                autoFocus
                            />

                            {error && (
                                <p role="alert" className="text-error text-xs font-medium text-center animate-fade-up">
                                    {error}
                                </p>
                            )}

                            <Button
                                type="submit"
                                variant="primary"
                                size="xl"
                                isLoading={isLoading}
                                loadingText="Verifying..."
                                className="w-full"
                            >
                                Verify &amp; Sign In
                            </Button>

                            <div className="flex justify-center items-center gap-3 pt-1 text-xs">
                                <button
                                    type="button"
                                    onClick={() => handleSendOTP()}
                                    disabled={cooldown > 0 || isLoading}
                                    className="font-medium text-foreground/50 hover:text-brand disabled:opacity-40 transition-colors"
                                    aria-label={cooldown > 0 ? `Resend code in ${cooldown} seconds` : 'Resend verification code'}
                                >
                                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
                                </button>
                                <span className="text-border" aria-hidden="true">|</span>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="font-medium text-foreground/50 hover:text-brand transition-colors"
                                >
                                    Change Email
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 'email' && (
                        <div className="mt-8 text-center relative z-10 border-t border-border/40 pt-6">
                            <p className="text-sm text-foreground/60">
                                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                                <button
                                    type="button"
                                    onClick={handleModeSwitch}
                                    className="font-semibold text-brand hover:text-brand-hover transition-colors"
                                >
                                    {isLogin ? 'Sign up' : 'Log in'}
                                </button>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

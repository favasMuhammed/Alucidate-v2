import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Class, SubjectData } from '@/types';

import { dbService } from '@/services/dbService';
import { sendOTP, verifyOTP } from '@/services/otpService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface AuthViewProps {
    onLogin: (user: User) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('signup');
    const [step, setStep] = useState<'form' | 'otp'>('form');

    // Form fields
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [className, setClassName] = useState('Class 11');


    // Entrance Exam specific fields
    const [isEntrance, setIsEntrance] = useState(false);
    const [entranceName, setEntranceName] = useState('');
    const [entranceSubjects, setEntranceSubjects] = useState<string[]>([]);
    const [availableSubjects, setAvailableSubjects] = useState<SubjectData[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);


    const ADMIN_EMAILS = ['nayrix2025@gmail.com', 'info@nayix.com'];

    // OTP fields
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [expectedOtp, setExpectedOtp] = useState('');
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        loadClasses();
    }, []);

    const loadClasses = async () => {
        try {
            const data = await dbService.getClasses();
            setClasses(data);
            if (data.length > 0) {
                const firstRegular = data.find(c => c.type === 'class');
                if (firstRegular) setClassName(firstRegular.name);
            }
        } catch (err) {
            console.error('Failed to load classes:', err);
        }
    };

    useEffect(() => {
        if (isEntrance && entranceName) {
            loadSubjectsForEntrance(entranceName);
        }
    }, [isEntrance, entranceName]);

    const loadSubjectsForEntrance = async (clsName: string) => {
        try {
            const subs = await dbService.getSubjectsByClass(clsName);
            setAvailableSubjects(subs);
        } catch (err) {
            console.error('Failed to load subjects:', err);
        }
    };


    // Form variants for Framer Motion
    const formVariants = {
        hidden: { opacity: 0, x: -20 },
        visible: {
            opacity: 1,
            x: 0,
            transition: { staggerChildren: 0.08, ease: 'easeOut' as any }
        },
        exit: { opacity: 0, x: 20 }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as any } }
    };

    // ─── Handlers ─────────────────────────────────────────────────────────── //

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            setError('Please enter a valid email address.');
            return;
        }

        setLoading(true);
        try {
            const isAdmin = ADMIN_EMAILS.includes(email.trim().toLowerCase());
            const existingUser = await dbService.getUser(email);

            if (!isAdmin) {
                if (mode === 'signup' && existingUser) {
                    setError('Email already registered. Please log in.');
                    setLoading(false);
                    return;
                }
                if (mode === 'login' && !existingUser) {
                    setError('No account found for this email.');
                    setLoading(false);
                    return;
                }
            }

            // Generate & Send OTP
            if (email.trim().toLowerCase() === 'test@nayix.com') {
                const generated = Math.floor(100000 + Math.random() * 900000).toString();
                setExpectedOtp(generated);
                console.log(`[DEV OTP]: ${generated}`);
            } else {
                await sendOTP(email);
            }

            setStep('otp');
            setCooldown(30);
        } catch (err: any) {
            setError(err.message || 'Failed to send OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (inputOtp: string) => {
        setError('');
        setLoading(true);
        try {
            const isTestEmail = email.trim().toLowerCase() === 'test@nayix.com';
            const isTestMatch = isTestEmail && inputOtp === expectedOtp;

            if (!isTestMatch) {
                // Call actual backend verification
                await verifyOTP(email, inputOtp);
            }

            // Success Path
            const isAdminEmail = ADMIN_EMAILS.includes(email.trim().toLowerCase());

            if (isAdminEmail) {
                const existingUser = await dbService.getUser(email);
                if (existingUser) {
                    onLogin(existingUser);
                } else {
                    const newAdmin: User = { email, name: 'Admin', className: 'Admin', role: 'admin' };
                    await dbService.addUser(newAdmin);
                    onLogin(newAdmin);
                }
            } else if (mode === 'signup') {
                const finalClassName = isEntrance
                    ? `Entrance Exam: ${entranceName.trim()} [${entranceSubjects.join(', ')}]`
                    : className;

                const newUser: User = { email, name, className: finalClassName, role: 'student' };
                await dbService.addUser(newUser);
                onLogin(newUser);
            } else {
                const existingUser = await dbService.getUser(email);
                if (existingUser) {
                    onLogin(existingUser);
                } else {
                    setError('No account found for this email.');
                }
            }
        } catch (err: any) {
            setError(err.message || 'Verification failed. Try again.');
            document.getElementById('otp-container')?.classList.add('animate-shake');
            setTimeout(() => document.getElementById('otp-container')?.classList.remove('animate-shake'), 500);
        } finally {
            setLoading(false);
        }
    };

    // OTP auto-advance logic
    const handleOtpChange = (index: number, val: string) => {
        if (!/^[0-9]*$/.test(val)) return;
        const newOtp = [...otp];
        newOtp[index] = val;
        setOtp(newOtp);

        if (val && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }

        if (newOtp.every(d => d !== '')) {
            handleVerifyOtp(newOtp.join(''));
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    // Cooldown timer
    useEffect(() => {
        if (cooldown > 0) {
            const t = setTimeout(() => setCooldown(c => c - 1), 1000);
            return () => clearTimeout(t);
        }
    }, [cooldown]);

    return (
        <div className="min-h-screen w-full flex bg-void text-ink font-sans selection:bg-brand/30">
            {/* ── Left Panel (Atmospheric) ── */}
            <div className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-center px-16">
                <div className="absolute inset-0 gradient-mesh opacity-80" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-20" />

                <div className="relative z-10 max-w-lg mb-12">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className="font-instrument italic text-[42px] leading-tight text-ink mb-8"
                    >
                        "Every student deserves a tutor who knows them."
                    </motion.h1>

                    <div className="space-y-4">
                        {[
                            { name: 'Sarah M.', text: 'The mind maps changed how I study Physics.' },
                            { name: 'Rahul K.', text: 'Finally holding my own in Chemistry.' }
                        ].map((t, i) => (
                            <motion.div
                                key={i}
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
                                className="inline-flex items-center gap-3 bg-surface/40 backdrop-blur-md border border-border/50 px-4 py-2.5 rounded-full"
                            >
                                <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-[10px] font-bold text-brand">{t.name[0]}</div>
                                <span className="text-sm text-ink-2">{t.text}</span>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Panel (Form) ── */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12 relative bg-surface">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#161C28_1px,transparent_1px),linear-gradient(to_bottom,#161C28_1px,transparent_1px)] bg-[size:24px_24px] opacity-20" />

                <div className="w-full max-w-[400px] relative z-10">
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-6 text-brand">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            <span className="font-bold text-lg tracking-tight">ALUCIDATE</span>
                        </div>
                        <h2 className="text-2xl font-bold mb-2">
                            {step === 'otp' ? 'Check your email' : (mode === 'signup' ? 'Create your account' : 'Welcome back')}
                        </h2>
                        <p className="text-ink-2 text-sm">
                            {step === 'otp' ? `We sent a 6-digit code to ${email}` : 'Enter your details to continue.'}
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {step === 'form' ? (
                            <motion.form
                                key="form"
                                variants={formVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                onSubmit={handleSubmit}
                                className="space-y-4"
                            >
                                <motion.div variants={itemVariants} className="flex p-1 bg-raised rounded-lg border border-border mb-6">
                                    <button
                                        type="button"
                                        onClick={() => setMode('signup')}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-surface text-ink shadow-sm border border-border-subtle' : 'text-ink-3 hover:text-ink-2'}`}
                                    >
                                        Sign Up
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMode('login')}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-surface text-ink shadow-sm border border-border-subtle' : 'text-ink-3 hover:text-ink-2'}`}
                                    >
                                        Log In
                                    </button>
                                </motion.div>

                                <motion.div variants={itemVariants} className="relative">
                                    <label className="block text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-wider">Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-raised border border-border rounded-lg px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-ink-3"
                                        placeholder="you@school.edu"
                                    />
                                </motion.div>

                                <AnimatePresence>
                                    {mode === 'signup' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-4 overflow-hidden"
                                        >
                                            <div className="relative">
                                                <label className="block text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-wider">Full Name</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    className="w-full bg-raised border border-border rounded-lg px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-ink-3"
                                                    placeholder="Rahul Das"
                                                />
                                            </div>
                                            <div className="space-y-4 mt-4">
                                                <div>
                                                    <label className="block text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-wider">Class or Exam</label>
                                                    <select
                                                        value={isEntrance ? 'Entrance Exam' : className}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            const selectedClass = classes.find(c => c.name === val);
                                                            if (selectedClass?.type === 'entrance') {
                                                                setIsEntrance(true);
                                                                setEntranceName(val);
                                                                setEntranceSubjects([]);
                                                            } else {
                                                                setIsEntrance(false);
                                                                setClassName(val);
                                                            }
                                                        }}
                                                        className="w-full bg-raised border border-border rounded-lg px-3 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none appearance-none"
                                                    >
                                                        {classes.map(c => (
                                                            <option key={c.id} value={c.name}>{c.name} {c.type === 'entrance' ? '(Entrance)' : ''}</option>
                                                        ))}
                                                    </select>
                                                </div>


                                                <AnimatePresence>
                                                    {isEntrance && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="space-y-4 overflow-hidden"
                                                        >
                                                            <div>
                                                                <label className="block text-xs font-semibold text-ink-3 mb-1.5 uppercase tracking-wider">Specify Entrance Test</label>
                                                                <input
                                                                    type="text"
                                                                    required={isEntrance}
                                                                    value={entranceName}
                                                                    onChange={e => setEntranceName(e.target.value)}
                                                                    className="w-full bg-raised border border-border rounded-lg px-4 py-2.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-ink-3"
                                                                    placeholder="e.g., NEET, JEE Advanced"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-semibold text-ink-3 mb-2 uppercase tracking-wider">Select Subjects (Min 1)</label>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {availableSubjects.map(sub => {
                                                                        const isSelected = entranceSubjects.includes(sub.subject);
                                                                        return (
                                                                            <button
                                                                                key={sub.id}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    if (isSelected) {
                                                                                        setEntranceSubjects(prev => prev.filter(s => s !== sub.subject));
                                                                                    } else {
                                                                                        setEntranceSubjects(prev => [...prev, sub.subject]);
                                                                                    }
                                                                                }}
                                                                                className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-all ${isSelected
                                                                                    ? 'bg-brand/10 border-brand text-brand glow-brand cursor-default'
                                                                                    : 'bg-surface border-border text-ink-3 hover:border-border-subtle hover:text-ink'
                                                                                    }`}
                                                                            >
                                                                                {sub.subject}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                    {availableSubjects.length === 0 && (
                                                                        <p className="text-xs text-ink-3 italic">No subjects available for this exam yet.</p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {error && (
                                    <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-danger flex items-center gap-1.5 p-2.5 bg-danger/10 border-l-2 border-danger rounded-r-md">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {error}
                                    </motion.p>
                                )}

                                <motion.button
                                    variants={itemVariants}
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full mt-4 bg-brand hover:bg-brand-dim text-white font-medium py-3 rounded-lg transition-all glow-brand disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
                                    {loading ? <LoadingSpinner size="sm" /> : (mode === 'signup' ? 'Continue →' : 'Log In →')}
                                </motion.button>
                            </motion.form>
                        ) : (
                            <motion.div
                                key="otp"
                                variants={formVariants}
                                initial="hidden"
                                animate="visible"
                                exit="exit"
                                className="space-y-6"
                            >
                                <div id="otp-container" className="flex justify-between gap-2">
                                    {otp.map((d, i) => (
                                        <input
                                            key={i}
                                            ref={el => otpRefs.current[i] = el}
                                            type="text"
                                            maxLength={1}
                                            value={d}
                                            onChange={e => handleOtpChange(i, e.target.value)}
                                            onKeyDown={e => handleOtpKeyDown(i, e)}
                                            className={`w-12 h-14 text-center text-xl font-bold bg-raised border rounded-lg outline-none transition-all ${d ? 'border-brand text-brand shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-border text-ink focus:border-brand-dim'
                                                }`}
                                        />
                                    ))}
                                </div>

                                {error && <p className="text-xs text-danger text-center">{error}</p>}

                                <div className="flex items-center justify-between text-xs">
                                    <button
                                        onClick={() => { setStep('form'); setOtp(['', '', '', '', '', '']); }}
                                        className="text-ink-3 hover:text-ink transition-colors"
                                    >
                                        ← Back
                                    </button>

                                    <button
                                        disabled={cooldown > 0 || loading}
                                        onClick={handleSubmit}
                                        className="text-brand hover:text-brand-dim disabled:text-ink-3 transition-colors flex items-center gap-1.5"
                                    >
                                        {cooldown > 0 ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Resend in {cooldown}s
                                            </>
                                        ) : 'Resend Code'}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

        </div>
    );
};

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SubjectData } from '@/types';
import { dbService } from '@/services/dbService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { hashStringToHue } from '@/utils';

// ── Helpers ────────────────────────────────────────────────────────

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

// ── Components ──────────────────────────────────────────────────────

const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let start = 0;
        const end = value;
        if (start === end) return;
        const incrementTime = Math.max(16, 1000 / end);
        const timer = setInterval(() => {
            start += 1;
            setCount(start);
            if (start === end) clearInterval(timer);
        }, incrementTime);
        return () => clearInterval(timer);
    }, [value]);
    return <span>{count}</span>;
};

export const DashboardView: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        const load = async () => {
            try {
                const data = await dbService.getSubjectsByClass(user.className);
                if (mounted) setSubjects(data);
            } catch (e: any) {
                if (mounted) setError(e.message || 'Failed to load subjects.');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [user?.className]);

    const greeting = useMemo(() => getGreeting(), []);

    if (!user) return <LoadingSpinner fullScreen label="Loading session..." />;

    const renderSkeleton = () => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3].map(i => (
                <div key={i} className="rounded-2xl bg-surface border border-border overflow-hidden relative min-h-[160px]">
                    <div className="h-20 bg-raised border-b border-border animate-pulse" />
                    <div className="p-4 space-y-3">
                        <div className="h-6 w-3/4 bg-raised rounded animate-pulse" />
                        <div className="h-4 w-1/2 bg-raised rounded animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="w-full h-full pb-20 px-6 max-w-[1280px] mx-auto">
            {/* ── Top Section ── */}
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="mb-12 mt-8 flex items-start justify-between flex-wrap gap-4"
            >
                <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-ink mb-2 tracking-tight">
                        {greeting}, {user.name.split(' ')[0]}.
                    </h1>
                    <p className="text-ink-2 text-base sm:text-lg">
                        {loading ? (
                            <span className="w-48 h-6 bg-raised rounded animate-pulse inline-block align-middle" />
                        ) : subjects.length > 0 ? (
                            <>You have <strong className="text-ink"><AnimatedCounter value={subjects.length} /> subjects</strong> to explore.</>
                        ) : (
                            "Ready to start learning?"
                        )}
                    </p>
                </div>
                {user.role === 'admin' && (
                    <button
                        onClick={() => navigate('/admin')}
                        className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-dim text-white text-sm font-bold rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Admin Panel
                    </button>
                )}
            </motion.div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
                    {error}
                </div>
            )}

            {/* ── Grid ── */}
            {loading ? (
                renderSkeleton()
            ) : subjects.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full bg-surface border border-border border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center mt-8"
                >
                    <div className="w-24 h-24 mb-6 text-6xl flex items-center justify-center bg-raised rounded-full shadow-inner">📖</div>
                    <h3 className="text-xl font-bold text-ink mb-2">No subjects yet</h3>
                    <p className="text-ink-2 max-w-sm leading-relaxed">
                        {user.role === 'admin'
                            ? 'Go to the Admin panel to create subjects and upload textbooks.'
                            : `Your teacher hasn't uploaded any content for ${user.className}. Check back soon.`}
                    </p>
                    {user.role === 'admin' && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="mt-6 px-6 py-2.5 bg-brand text-white font-bold rounded-lg hover:bg-brand-dim transition-colors"
                        >
                            Go to Admin →
                        </button>
                    )}
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <AnimatePresence>
                        {subjects.map((s, i) => {
                            const hue = hashStringToHue(s.subject);
                            const gradientParams = `linear-gradient(135deg, hsl(${hue},70%,35%), hsl(${hue + 30},60%,25%))`;
                            const lastStudied = localStorage.getItem(`last_studied_${s.id}`);
                            const chapterCount = s.structure?.children?.length || 0;

                            let totalQs = 0;
                            let answeredQs = 0;
                            if (s.structure?.children) {
                                s.structure.children.forEach(ch => {
                                    totalQs += 10;
                                    answeredQs += parseInt(localStorage.getItem(`qs_${ch.id}`) || '0', 10);
                                });
                            }
                            const progressPercent = totalQs === 0 ? 0 : Math.min(100, Math.round((answeredQs / totalQs) * 100));

                            return (
                                <motion.button
                                    key={s.id}
                                    layoutId={`subject-card-${s.id}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06, ease: 'easeOut' }}
                                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                    onClick={() => navigate(`/subject/${s.id}`)}
                                    className="group text-left relative flex flex-col bg-surface border border-border rounded-2xl overflow-hidden shadow-sm hover:border-border-subtle hover:shadow-[var(--shadow-glow-brand)] transition-all duration-300"
                                >
                                    {/* Gradient Band */}
                                    <motion.div
                                        layoutId={`subject-hero-${s.id}`}
                                        className="h-20 w-full relative z-0"
                                        style={{ background: gradientParams }}
                                    >
                                        <div className="absolute inset-0 bg-void/10 group-hover:bg-transparent transition-colors" />
                                        <div className="absolute -bottom-4 left-4 w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-xl shadow-sm z-10 group-hover:scale-110 transition-transform">
                                            📚
                                        </div>
                                    </motion.div>

                                    {/* Content */}
                                    <div className="p-5 pt-7 flex flex-col flex-1 relative z-10 bg-surface">
                                        <h3 className="text-xl font-bold text-ink leading-tight mb-1 truncate">{s.subject}</h3>
                                        <div className="flex items-center gap-2 text-[13px] text-ink-2 font-medium mb-5">
                                            <span>{user.className}</span>
                                            <span className="w-1 h-1 rounded-full bg-ink-3" />
                                            <span>{chapterCount} Chapter{chapterCount !== 1 && 's'}</span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="mt-auto space-y-2 w-full">
                                            <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
                                                <div className="h-full bg-brand transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-ink-2 font-medium">{progressPercent}% Mastery</span>
                                                <span className="text-ink-3">
                                                    {lastStudied ? new Date(lastStudied).toLocaleDateString() : 'Not started'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

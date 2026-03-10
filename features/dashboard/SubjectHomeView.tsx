import React, { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Star, Lock, Play, ArrowRight } from 'lucide-react';
import { SubjectData, ChapterDetails } from '@/types';
import { dbService } from '@/services/dbService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { hashStringToHue } from '@/utils';
import { staggerReveal } from '@/animations';

const SubjectHero: React.FC<{ subject: SubjectData }> = ({ subject }) => {
    const navigate = useNavigate();
    const hue = useMemo(() => hashStringToHue(subject.subject), [subject]);

    return (
        <div
            className="w-full relative overflow-hidden flex flex-col justify-between"
            style={{
                height: 'clamp(160px, 20vw, 220px)',
                '--subject-hue': hue
            } as React.CSSProperties}
        >
            {/* Dynamic Gradient Mesh Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div
                    className="absolute rounded-full"
                    style={{
                        width: '600px', height: '600px',
                        background: 'radial-gradient(circle, hsl(var(--subject-hue), 70%, 40%) 0%, transparent 70%)',
                        filter: 'blur(80px)', animation: 'blob-drift 12s ease-in-out infinite', opacity: 0.7,
                        top: '-10%', left: '-10%'
                    }}
                />
                <div
                    className="absolute rounded-full"
                    style={{
                        width: '400px', height: '400px',
                        background: 'radial-gradient(circle, hsl(calc(var(--subject-hue) + 40), 60%, 30%) 0%, transparent 70%)',
                        filter: 'blur(60px)', animation: 'blob-drift 16s ease-in-out infinite reverse', opacity: 0.5,
                        top: '-20%', right: '10%'
                    }}
                />
                <div
                    className="absolute rounded-full"
                    style={{
                        width: '300px', height: '300px',
                        background: 'radial-gradient(circle, hsl(calc(var(--subject-hue) - 20), 80%, 55%) 0%, transparent 70%)',
                        filter: 'blur(40px)', animation: 'blob-drift 20s ease-in-out infinite 4s', opacity: 0.3,
                        bottom: 0, left: '40%'
                    }}
                />
                <div className="absolute inset-0 noise opacity-[0.04]" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 60%, var(--void) 100%)' }} />
            </div>

            {/* Content */}
            <div className="relative z-10 w-full h-full p-6 md:p-8 flex flex-col justify-between max-w-[1280px] mx-auto">
                <div className="flex flex-col gap-2">
                    <nav className="font-mono text-[11px] text-ink-2 tracking-[0.08em] uppercase flex items-center gap-1.5 opacity-80">
                        <span className="cursor-pointer hover:text-ink transition-colors" onClick={() => navigate('/dashboard')}>Dashboard</span>
                        <span>/</span>
                        <span className="text-ink">{subject.subject}</span>
                    </nav>
                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="font-serif font-normal text-white leading-[1.1]"
                        style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}
                    >
                        {subject.subject}
                    </motion.h1>
                </div>

                <div className="absolute bottom-6 right-6 md:right-8">
                    <button
                        onClick={() => navigate(`/subject/${subject.id}/chat`)}
                        className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-3 md:px-4 md:py-2 transition-all hover:-translate-y-[1px]"
                        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                    >
                        <MessageSquare className="w-[15px] h-[15px] text-white" />
                        <span className="hidden md:inline font-ui font-medium text-[13px] text-white">Ask Alucidate Anything</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SubjectHomeView: React.FC = () => {
    const { subjectId } = useParams<{ subjectId: string }>();
    const navigate = useNavigate();
    const [subject, setSubject] = useState<SubjectData | null>(null);
    const [chapters, setChapters] = useState<ChapterDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!subjectId) return;
        const load = async () => {
            try {
                const [subj, chaps] = await Promise.all([
                    dbService.getSubject(subjectId),
                    dbService.getChaptersBySubject(subjectId),
                ]);
                if (!subj) { setError('Subject not found.'); return; }
                setSubject(subj); setChapters(chaps);
            } catch (e: any) {
                setError(e.message || 'Failed to load subject.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [subjectId]);

    const chapterStates = useMemo(() => {
        return chapters.map((ch, index) => {
            const questionsAsked = parseInt(localStorage.getItem(`qs_${ch.chapterId}`) || '0', 10);
            let isLocked = false;
            if (index > 0) {
                const prevQs = parseInt(localStorage.getItem(`qs_${chapters[index - 1].chapterId}`) || '0', 10);
                isLocked = prevQs < 3;
            }
            return { ...ch, questionsAsked, isLocked, isCompleted: questionsAsked >= 3 };
        });
    }, [chapters]);

    // GSAP Stagger Reveal
    useLayoutEffect(() => {
        if (!loading && chapterStates.length > 0 && listRef.current) {
            staggerReveal('.chapter-row', listRef.current);
        }
    }, [loading, chapterStates]);

    if (loading) return <LoadingSpinner fullScreen label="Loading subject..." />;
    if (error || !subject) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <p className="text-danger">{error || 'Subject not found.'}</p>
            <button onClick={() => navigate('/dashboard')} className="text-brand underline text-sm">← Back to Dashboard</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-void w-full pb-32">
            <SubjectHero subject={subject} />

            <div className="max-w-[720px] mx-auto px-6 mt-8" ref={listRef}>
                {chapterStates.length === 0 ? (
                    <div className="text-center py-20 text-ink-3">
                        <p className="text-sm">No chapters available yet.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {chapterStates.map((ch, i) => (
                            <div
                                key={ch.id}
                                className={`chapter-row relative flex flex-col md:flex-row md:items-center gap-4 py-5 border-b border-border last:border-0 group select-none ${ch.isLocked ? '' : 'hover:cursor-pointer'}`}
                                onClick={() => { if (!ch.isLocked) navigate(`/subject/${subjectId}/chapter/${ch.chapterId}`) }}
                            >
                                {/* Hover background effect */}
                                {!ch.isLocked && (
                                    <div className="absolute inset-0 bg-raised rounded-[var(--r-md)] scale-x-0 origin-left transition-transform duration-[220ms] ease-out group-hover:scale-x-100 -z-10 -mx-4 px-4" />
                                )}

                                {/* Left Column: Number, Title, Progress */}
                                <div className="flex flex-col flex-1 min-w-0 pr-4 z-10">
                                    <div className="flex items-start gap-4">
                                        <span className={`font-mono font-medium text-[13px] w-8 shrink-0 transition-colors duration-200 ${ch.isLocked ? 'text-ink-4' : 'text-ink-3 group-hover:text-brand'}`}>
                                            [{String(i + 1).padStart(2, '0')}]
                                        </span>
                                        <div className="flex flex-col w-full min-w-0">
                                            <h3 className={`font-[Geist] text-[16px] tracking-[0.04em] uppercase uppercase truncate ${ch.isLocked ? 'font-semibold text-ink-3' : 'font-bold text-ink'}`}>
                                                {ch.chapterTitle}
                                            </h3>

                                            {/* Progress Bar & Stats */}
                                            <div className="mt-2 flex items-center gap-3">
                                                <div className="h-[2px] w-full max-w-[200px] bg-raised-2 relative overflow-hidden rounded-full">
                                                    {!ch.isLocked && (
                                                        <div
                                                            className="absolute top-0 left-0 h-full transition-all duration-700 rounded-full"
                                                            style={{
                                                                width: `${Math.min(100, (ch.questionsAsked / 3) * 100)}%`,
                                                                background: 'linear-gradient(90deg, var(--success), var(--teal))'
                                                            }}
                                                        >
                                                            <div className="absolute inset-0 animate-shimmer" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`font-mono text-[10px] uppercase whitespace-nowrap ${ch.isCompleted ? 'text-success' : 'text-ink-3'}`}>
                                                    {ch.questionsAsked > 0 ? `${ch.questionsAsked} Q'S ASKED` : 'NOT STARTED'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Badge & Button */}
                                <div className="flex items-center md:justify-end gap-3 z-10 ml-12 md:ml-0">
                                    {ch.isCompleted && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                            className="w-5 h-5 flex items-center justify-center rounded bg-success-glow border border-success text-success shrink-0"
                                        >
                                            <Star className="w-3 h-3 fill-current" />
                                        </motion.div>
                                    )}

                                    <button
                                        className={`flex items-center justify-center gap-1.5 px-4 py-2 font-[Geist] text-[13px] rounded-full transition-all duration-200 group/btn w-full md:w-auto shrink-0 ${ch.isLocked
                                                ? 'bg-raised border border-border text-ink-3 cursor-not-allowed'
                                                : ch.isCompleted
                                                    ? 'bg-raised-2 border border-border-strong text-ink hover:border-border-focus hover:shadow-[0_0_12px_var(--brand-glow)] hover:text-brand'
                                                    : 'bg-brand text-white font-semibold shadow-[0_2px_16px_rgba(59,130,246,0.3)] hover:bg-brand-bright'
                                            }`}
                                        disabled={ch.isLocked}
                                    >
                                        {ch.isLocked ? (
                                            <><Lock className="w-3 h-3" /> Locked</>
                                        ) : ch.isCompleted ? (
                                            <>Continue <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-[3px] transition-transform" /></>
                                        ) : (
                                            <>Start <Play className="w-3 h-3 group-hover/btn:rotate-12 transition-transform" fill="currentColor" /></>
                                        )}
                                    </button>
                                </div>

                                {/* Tooltip for locked state */}
                                {ch.isLocked && (
                                    <div className="absolute right-0 -top-8 px-3 py-1.5 bg-raised-2 border border-border rounded shadow-xl text-ink-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden md:block">
                                        Complete Chapter {i} to unlock
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

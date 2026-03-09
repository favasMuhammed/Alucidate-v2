import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, SubjectData, ChapterDetails } from '@/types';

interface SubjectHomeViewProps {
    user: User;
    subject: SubjectData;
    onBack: () => void;
    onSelectChapter: (chapter: ChapterDetails) => void;
}

function hashStringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash % 360);
}

// ── Background Particles ──
const ParticleField = () => {
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
            {Array.from({ length: 20 }).map((_, i) => (
                <div
                    key={i}
                    className="absolute w-1 h-1 bg-white/40 rounded-full"
                    style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                        animation: `float ${10 + Math.random() * 20}s linear infinite alternate`,
                        animationDelay: `-${Math.random() * 10}s`
                    }}
                />
            ))}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes float {
                    0% { transform: translate(0, 0) scale(1); opacity: 0.2; }
                    50% { transform: translate(${Math.random() * 50 - 25}px, ${Math.random() * 50 - 25}px) scale(1.5); opacity: 0.8; }
                    100% { transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(1); opacity: 0.2; }
                }
            `}} />
        </div>
    );
};

export const SubjectHomeView: React.FC<SubjectHomeViewProps> = ({ user, subject, onBack, onSelectChapter }) => {
    const chapters = useMemo(() => subject.structure?.children || [], [subject]);
    const hue = useMemo(() => hashStringToHue(subject.subject), [subject.subject]);
    const gradientLight = `hsl(${hue}, 70%, 50%)`;
    const gradientDark = `hsl(${hue + 30}, 60%, 35%)`;

    // ── Unlock Logic ──
    const chapterStates = useMemo(() => {
        return chapters.map((ch, index) => {
            const questionsAsked = parseInt(localStorage.getItem(`qs_${ch.id}`) || '0', 10);

            // Chapter 1 is always unlocked. Others unlock if the previous chapter has >= 3 questions asked.
            let isLocked = false;
            if (index > 0) {
                const prevQs = parseInt(localStorage.getItem(`qs_${chapters[index - 1].id}`) || '0', 10);
                isLocked = prevQs < 3;
            }

            return {
                ...ch,
                questionsAsked,
                isLocked,
                isCompleted: questionsAsked >= 3
            };
        });
    }, [chapters]);

    return (
        <div className="min-h-screen bg-void w-full pb-24">
            {/* ── Hero Banner ── */}
            <motion.div
                layoutId={`subject-hero-${subject.id}`}
                className="w-full h-48 md:h-64 relative overflow-hidden flex items-end px-6 md:px-12 pb-8 border-b border-border/50"
                style={{ background: `linear-gradient(135deg, ${gradientLight}, ${gradientDark})` }}
            >
                <ParticleField />
                <div className="absolute inset-0 bg-void/20" />

                <div className="relative z-10 w-full max-w-[1280px] mx-auto">
                    {/* Breadcrumbs */}
                    <nav className="flex items-center gap-2 text-white/50 text-xs font-bold uppercase tracking-widest mb-4">
                        <button onClick={onBack} className="hover:text-white transition-colors">Dashboard</button>
                        <span>/</span>
                        <span className="text-white/80">{subject.className}</span>
                    </nav>

                    <motion.h1
                        layoutId={`subject-title-${subject.id}`}
                        className="text-4xl md:text-5xl font-bold text-white tracking-tight mix-blend-screen"
                    >
                        {subject.subject}
                    </motion.h1>
                </div>
            </motion.div>

            {/* ── Chapter List ── */}
            <div className="max-w-[800px] mx-auto w-full px-6 pt-12 space-y-4">
                {chapterStates.length === 0 ? (
                    <div className="text-center py-20 text-ink-3">No chapters loaded yet.</div>
                ) : (
                    chapterStates.map((ch, i) => (
                        <motion.div
                            key={ch.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08, ease: 'easeOut' }}
                            className="relative group"
                        >
                            <div className="absolute inset-0 bg-surface scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] rounded-2xl border border-transparent group-hover:border-border-subtle" />

                            <div className={`relative z-10 p-5 pl-6 flex items-center justify-between transition-all ${ch.isLocked ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-5 min-w-0 pr-6">
                                    <span className="text-xl font-mono font-bold text-ink-3 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-bold text-ink truncate">{ch.title || ch.fileName}</h3>
                                        <div className="mt-1">
                                            {/* Progress Bar under title */}
                                            <div className="h-1 w-32 bg-raised rounded-full overflow-hidden inline-block align-middle mr-3">
                                                <div
                                                    className={`h-full ${ch.isCompleted ? 'bg-success' : 'bg-brand'} transition-all duration-700`}
                                                    style={{ width: `${Math.min(100, (ch.questionsAsked / 10) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-3 inline-block align-middle">
                                                {ch.questionsAsked > 0 ? `${ch.questionsAsked} Questions Asked` : 'Not Started'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-4">
                                    {ch.isCompleted && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', bounce: 0.6 }}
                                            className="w-6 h-6 flex items-center justify-center text-xs bg-success/20 text-success rounded-full"
                                        >
                                            ★
                                        </motion.div>
                                    )}

                                    <button
                                        onClick={() => !ch.isLocked && onSelectChapter({ chapterId: ch.id, chapterTitle: ch.title, keywords: [], mindMap: null } as any)}
                                        disabled={ch.isLocked}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${ch.isLocked
                                                ? 'bg-raised text-ink-3 cursor-not-allowed group-hover:bg-border/50'
                                                : ch.questionsAsked > 0
                                                    ? 'bg-surface border border-border text-ink hover:glow-brand hover:border-brand/40'
                                                    : 'bg-brand text-white hover:bg-brand-dim glow-brand'
                                            }`}
                                    >
                                        {ch.isLocked ? (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                Locked
                                            </>
                                        ) : ch.questionsAsked > 0 ? (
                                            <>
                                                Continue
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </>
                                        ) : (
                                            <>
                                                Start
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};

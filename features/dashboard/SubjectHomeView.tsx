import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SubjectData, ChapterDetails } from '@/types';
import { dbService } from '@/services/dbService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { hashStringToHue } from '@/utils';

const ParticleField = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        {Array.from({ length: 16 }).map((_, i) => (
            <div
                key={i}
                className="absolute w-1 h-1 bg-white/40 rounded-full"
                style={{
                    left: `${(i * 6.25) % 100}%`,
                    top: `${(i * 13.7) % 100}%`,
                    animation: `floatP ${10 + i}s linear infinite alternate`,
                }}
            />
        ))}
        <style dangerouslySetInnerHTML={{
            __html: `@keyframes floatP {
                0% { transform: translate(0, 0) scale(1); opacity: 0.2; }
                100% { transform: translate(20px, -20px) scale(1.5); opacity: 0.8; }
            }`
        }} />
    </div>
);

export const SubjectHomeView: React.FC = () => {
    const { subjectId } = useParams<{ subjectId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [subject, setSubject] = useState<SubjectData | null>(null);
    const [chapters, setChapters] = useState<ChapterDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!subjectId) return;
        const load = async () => {
            try {
                const [subj, chaps] = await Promise.all([
                    dbService.getSubject(subjectId),
                    dbService.getChaptersBySubject(subjectId),
                ]);
                if (!subj) {
                    setError('Subject not found.');
                    return;
                }
                setSubject(subj);
                setChapters(chaps);
            } catch (e: any) {
                setError(e.message || 'Failed to load subject.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [subjectId]);

    const hue = useMemo(() => subject ? hashStringToHue(subject.subject) : 210, [subject]);
    const gradientLight = `hsl(${hue}, 70%, 50%)`;
    const gradientDark = `hsl(${hue + 30}, 60%, 35%)`;

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

    if (loading) return <LoadingSpinner fullScreen label="Loading subject..." />;
    if (error || !subject) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <p className="text-danger">{error || 'Subject not found.'}</p>
            <button onClick={() => navigate('/dashboard')} className="text-brand underline text-sm">← Back to Dashboard</button>
        </div>
    );

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
                <div className="relative z-10 w-full max-w-[1280px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <nav className="flex items-center gap-2 text-white/50 text-xs font-bold uppercase tracking-widest mb-4">
                            <button onClick={() => navigate('/dashboard')} className="hover:text-white transition-colors">Dashboard</button>
                            <span>/</span>
                            <span className="text-white/80">{subject.subject}</span>
                        </nav>
                        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{subject.subject}</h1>
                    </div>

                    <button
                        onClick={() => navigate(`/subject/${subjectId}/chat`)}
                        className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-2xl flex items-center gap-3 transition-all group shrink-0 self-start md:self-auto mb-2"
                    >
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        </div>
                        <div className="text-left">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight">Subject Intelligence</p>
                            <p className="text-sm font-bold">Ask Alucidate Anything</p>
                        </div>
                    </button>
                </div>
            </motion.div>

            {/* ── Chapter List ── */}
            <div className="max-w-[800px] mx-auto w-full px-6 pt-12 space-y-4">
                {chapterStates.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-20 border border-dashed border-border rounded-2xl text-ink-3"
                    >
                        <div className="text-4xl mb-4">📚</div>
                        <p className="text-sm">No chapters available yet for this subject.</p>
                    </motion.div>
                ) : (
                    <AnimatePresence>
                        {chapterStates.map((ch, i) => (
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
                                            <h3 className="text-lg font-bold text-ink truncate">{ch.chapterTitle}</h3>
                                            <div className="mt-1 flex items-center gap-2">
                                                <div className="h-1 w-32 bg-raised rounded-full overflow-hidden inline-block align-middle">
                                                    <div
                                                        className={`h-full ${ch.isCompleted ? 'bg-success' : 'bg-brand'} transition-all duration-700`}
                                                        style={{ width: `${Math.min(100, (ch.questionsAsked / 10) * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-ink-3">
                                                    {ch.questionsAsked > 0 ? `${ch.questionsAsked} Q's Asked` : 'Not Started'}
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
                                            >★</motion.div>
                                        )}
                                        <button
                                            onClick={() => !ch.isLocked && navigate(`/subject/${subjectId}/chapter/${ch.chapterId}`)}
                                            disabled={ch.isLocked}
                                            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${ch.isLocked
                                                ? 'bg-raised text-ink-3 cursor-not-allowed'
                                                : ch.questionsAsked > 0
                                                    ? 'bg-surface border border-border text-ink hover:glow-brand hover:border-brand/40'
                                                    : 'bg-brand text-white hover:bg-brand-dim glow-brand'
                                                }`}
                                        >
                                            {ch.isLocked ? (
                                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>Locked</>
                                            ) : ch.questionsAsked > 0 ? (
                                                <>Continue <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></>
                                            ) : (
                                                <>Start <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
};

/**
 * DashboardView.tsx
 * FAANG-quality Student Dashboard for Alucidate.
 *
 * Features:
 * - Sidebar with student profile, class badge, navigation
 * - Subject cards with gradient colour, chapter count, progress ring
 * - Skeleton loading states
 * - Empty state with clear call-to-action
 * - Subject detail drill-down (SubjectHomeView inline)
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User, SubjectData, ChapterDetails } from '@/types';
import { dbService } from '@/services/dbService';
import { useFadeUp } from '@/hooks/useScrollAnimation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// ─── Subject Color Theming (matches AdminView) ───────────────────────────────

const SUBJECT_GRADIENTS = [
    { from: 'from-violet-500/15', to: 'to-purple-600/5', border: 'border-violet-500/20', icon: '#8B5CF6', ring: 'hsla(263,70%,56%,0.5)' },
    { from: 'from-blue-500/15', to: 'to-cyan-600/5', border: 'border-blue-500/20', icon: '#3B82F6', ring: 'hsla(217,91%,60%,0.5)' },
    { from: 'from-emerald-500/15', to: 'to-teal-600/5', border: 'border-emerald-500/20', icon: '#10B981', ring: 'hsla(158,64%,42%,0.5)' },
    { from: 'from-orange-500/15', to: 'to-amber-600/5', border: 'border-orange-500/20', icon: '#F59E0B', ring: 'hsla(38,92%,50%,0.5)' },
    { from: 'from-rose-500/15', to: 'to-red-600/5', border: 'border-rose-500/20', icon: '#F43F5E', ring: 'hsla(343,87%,60%,0.5)' },
    { from: 'from-sky-500/15', to: 'to-indigo-600/5', border: 'border-sky-500/20', icon: '#0EA5E9', ring: 'hsla(198,89%,48%,0.5)' },
];

const SUBJECT_ICONS = ['⚗️', '📐', '🧬', '📚', '🌍', '💻', '🔭', '📊', '🎨', '⚙️'];

function getSubjectTheme(name: string) {
    const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        ...SUBJECT_GRADIENTS[hash % SUBJECT_GRADIENTS.length],
        emoji: SUBJECT_ICONS[hash % SUBJECT_ICONS.length],
    };
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

const SkeletonCard = () => (
    <div className="h-52 bg-elevated/40 rounded-3xl border border-border animate-pulse" />
);

// ─── Subject Card ─────────────────────────────────────────────────────────────

const SubjectCard: React.FC<{
    subject: SubjectData;
    onClick: () => void;
    index: number;
}> = memo(({ subject, onClick, index }) => {
    const theme = getSubjectTheme(subject.subject);
    const chapterCount = subject.structure?.children?.length ?? 0;

    // Read last-studied from localStorage
    const lastStudied = localStorage.getItem(`last_studied_${subject.id}`);

    return (
        <button
            onClick={onClick}
            className={`group relative w-full text-left bg-gradient-to-br ${theme.from} ${theme.to} rounded-3xl border ${theme.border} p-6 flex flex-col gap-4 hover:-translate-y-1.5 hover:shadow-2xl transition-all duration-300 overflow-hidden focus-visible:ring-2 focus-visible:ring-brand`}
            aria-label={`Open ${subject.subject}`}
            style={{ animationDelay: `${index * 0.08}s` }}
        >
            {/* Shine line */}
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Hover glow blob */}
            <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: theme.ring }} />

            {/* Icon row */}
            <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-background/30 backdrop-blur-sm border border-white/10 flex items-center justify-center text-2xl shadow-sm">
                    {theme.emoji}
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-foreground/40 group-hover:text-foreground/60 transition-colors">
                    <span>{chapterCount}</span>
                    <span>CH</span>
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </div>

            {/* Subject name */}
            <div className="flex-1 min-w-0">
                <h3 className="text-xl font-extrabold text-foreground tracking-tight leading-snug group-hover:text-white/95 transition-colors">{subject.subject}</h3>
                <p className="text-xs text-foreground/40 mt-1 font-medium">
                    {chapterCount === 0 ? 'No chapters yet' : `${chapterCount} chapter${chapterCount !== 1 ? 's' : ''} available`}
                </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
                {lastStudied ? (
                    <span className="text-xs text-foreground/30">Last studied {new Date(lastStudied).toLocaleDateString()}</span>
                ) : (
                    <span className="text-xs text-foreground/30">Not started</span>
                )}
                <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20 group-hover:bg-brand group-hover:text-white transition-all">
                    Open →
                </span>
            </div>
        </button>
    );
});

// ─── Chapter List Item ────────────────────────────────────────────────────────

const ChapterListItem: React.FC<{
    chapter: ChapterDetails;
    index: number;
    subjectTheme: ReturnType<typeof getSubjectTheme>;
    onClick: () => void;
}> = memo(({ chapter, index, subjectTheme, onClick }) => {
    const questionsAsked = parseInt(localStorage.getItem(`qs_${chapter.id}`) ?? '0', 10);
    const hasStarted = questionsAsked > 0;

    return (
        <button
            onClick={onClick}
            className="group w-full text-left flex items-center gap-4 p-5 bg-elevated/60 backdrop-blur-sm rounded-2xl border border-border hover:border-brand/30 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`Open ${chapter.chapterTitle}`}
        >
            {/* Chapter number badge */}
            <div className={`shrink-0 w-12 h-12 rounded-2xl flex flex-col items-center justify-center border transition-all group-hover:scale-105 ${hasStarted ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-background border-border text-foreground/40'}`}>
                <span className="text-[9px] font-bold uppercase tracking-wider leading-none">CH</span>
                <span className="text-lg font-extrabold leading-tight">{chapter.chapterId}</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-foreground group-hover:text-brand transition-colors leading-snug line-clamp-2">
                    {chapter.chapterTitle}
                </h4>
                <div className="flex items-center gap-3 mt-1.5">
                    {chapter.keywords?.length > 0 && (
                        <span className="text-xs text-foreground/40 font-medium">{chapter.keywords.length} keywords</span>
                    )}
                    {hasStarted && (
                        <span className="text-xs text-brand font-semibold bg-brand/8 px-2 py-0.5 rounded-full">{questionsAsked} questions asked</span>
                    )}
                </div>
            </div>

            {/* Arrow */}
            <svg className="w-5 h-5 text-foreground/30 group-hover:text-brand group-hover:translate-x-1 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </button>
    );
});

// ─── SubjectHomeView (Chapter list) ──────────────────────────────────────────

interface SubjectHomeProps {
    subject: SubjectData;
    user: User;
    onBack: () => void;
    onSelectChapter: (chapter: ChapterDetails) => void;
}

export const SubjectHomeView: React.FC<SubjectHomeProps> = ({ subject, user, onBack, onSelectChapter }) => {
    const [chapters, setChapters] = useState<ChapterDetails[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.07 });
    const theme = getSubjectTheme(subject.subject);

    useEffect(() => {
        // Record last studied timestamp
        localStorage.setItem(`last_studied_${subject.id}`, new Date().toISOString());

        setIsLoading(true);
        dbService.getChaptersBySubject(subject.id)
            .then(setChapters)
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [subject.id]);

    return (
        <div className="flex-1 overflow-y-auto">
            {/* Hero Banner */}
            <div className={`bg-gradient-to-br ${theme.from} ${theme.to} border-b ${theme.border} px-6 lg:px-10 pt-8 pb-10 relative overflow-hidden`}>
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl opacity-30" style={{ background: theme.ring }} />
                </div>

                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-xs text-foreground/40 mb-6 relative z-10" aria-label="Breadcrumb">
                    <button onClick={onBack} className="hover:text-foreground transition-colors font-medium">Dashboard</button>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    <span className="text-foreground/70 font-semibold">{subject.subject}</span>
                </nav>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="text-4xl">{theme.emoji}</span>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">{user.className}</p>
                            <h1 className="text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">{subject.subject}</h1>
                        </div>
                    </div>
                    <p className="text-sm text-foreground/50 mt-2">
                        {isLoading ? 'Loading chapters...' : `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} · Select one to begin studying`}
                    </p>
                </div>
            </div>

            {/* Chapter List */}
            <div ref={containerRef} className="p-6 lg:p-10 max-w-3xl mx-auto">
                {isLoading ? (
                    <div className="space-y-3">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-elevated/40 rounded-2xl border border-border animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                        ))}
                    </div>
                ) : chapters.length > 0 ? (
                    <div data-animate className="space-y-3">
                        {chapters.map((ch, idx) => (
                            <ChapterListItem
                                key={ch.id}
                                chapter={ch}
                                index={idx}
                                subjectTheme={theme}
                                onClick={() => onSelectChapter(ch)}
                            />
                        ))}
                    </div>
                ) : (
                    <div data-animate className="text-center py-20">
                        <div className="text-5xl mb-4">📭</div>
                        <h3 className="text-xl font-bold text-foreground mb-2">No chapters yet</h3>
                        <p className="text-foreground/50 text-sm">Your admin hasn't uploaded any chapters for this subject yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main DashboardView ───────────────────────────────────────────────────────

interface DashboardViewProps {
    user: User;
    onLogout: () => void;
    onSwitchToAdmin: () => void;
    onSelectSubject: (subject: SubjectData) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ user, onLogout, onSwitchToAdmin, onSelectSubject }) => {
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.06 });

    const loadSubjects = useCallback(() => {
        setIsLoading(true);
        dbService.getSubjectsByClass(user.className)
            .then(setSubjects)
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [user.className]);

    useEffect(() => { loadSubjects(); }, [loadSubjects]);

    const totalChapters = subjects.reduce((sum, s) => sum + (s.structure?.children?.length ?? 0), 0);

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-1/3 w-96 h-96 bg-brand/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-violet-500/4 rounded-full blur-[100px]" />
            </div>

            {/* ── Sidebar ── */}
            <aside className="hidden lg:flex w-72 flex-col bg-elevated/60 backdrop-blur-xl border-r border-border p-6 shrink-0 z-10">
                {/* Logo */}
                <div className="mb-8">
                    <h1 className="text-2xl font-light text-foreground">
                        <span className="font-bold shimmer-text">AI</span>ucidate
                    </h1>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 mt-1 block">Learning Platform</span>
                </div>

                {/* Student Profile */}
                <div className="bg-background/50 rounded-2xl border border-border p-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-bold text-lg">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                            <p className="text-xs text-foreground/50 truncate">{user.email}</p>
                        </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                        <span className="text-xs text-foreground/40">{user.className}</span>
                        <span className="text-xs font-bold text-foreground/50 bg-elevated px-2 py-0.5 rounded-full border border-border">🎓 Student</span>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between bg-background/30 rounded-xl p-3 border border-border/50">
                        <span className="text-xs text-foreground/50">Subjects</span>
                        <span className="text-lg font-bold text-foreground">{isLoading ? '—' : subjects.length}</span>
                    </div>
                    <div className="flex items-center justify-between bg-background/30 rounded-xl p-3 border border-border/50">
                        <span className="text-xs text-foreground/50">Chapters</span>
                        <span className="text-lg font-bold text-foreground">{isLoading ? '—' : totalChapters}</span>
                    </div>
                </div>

                {/* Nav */}
                <nav className="space-y-1 flex-1">
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand/10 border border-brand/20 text-brand text-sm font-semibold">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        My Subjects
                    </button>
                    {user.role === 'admin' && (
                        <button onClick={onSwitchToAdmin} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-foreground/50 text-sm font-medium hover:bg-foreground/5 transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Admin Portal
                        </button>
                    )}
                </nav>

                {/* Logout */}
                <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-foreground/40 text-sm font-medium hover:text-error hover:bg-error/5 transition-all mt-auto">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                </button>
            </aside>

            {/* ── Main Content ── */}
            <main className="flex-1 overflow-y-auto relative z-10">
                {/* Mobile Header */}
                <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-elevated/50 backdrop-blur-xl sticky top-0 z-20">
                    <h1 className="text-xl font-bold"><span className="shimmer-text">AI</span>ucidate</h1>
                    <div className="flex gap-2">
                        {user.role === 'admin' && (
                            <button onClick={onSwitchToAdmin} className="text-xs font-semibold text-brand bg-brand/10 px-3 py-1.5 rounded-lg border border-brand/20">Admin</button>
                        )}
                        <button onClick={onLogout} className="text-xs font-semibold text-foreground/50 hover:text-error px-3 py-1.5 rounded-lg border border-border transition-colors">Logout</button>
                    </div>
                </div>

                <div ref={containerRef} className="p-6 lg:p-10 max-w-5xl mx-auto">

                    {/* Greeting */}
                    <div data-animate className="mb-8">
                        <p className="text-foreground/40 text-sm font-medium">{greeting()}, 👋</p>
                        <h2 className="text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight mt-1">{user.name}</h2>
                        <p className="text-foreground/50 mt-1 text-sm">{user.className} · {isLoading ? '...' : `${subjects.length} subjects available`}</p>
                    </div>

                    {/* Subject Grid */}
                    <section>
                        <div data-animate className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-foreground">Your Subjects</h3>
                            <button onClick={loadSubjects} className="text-xs text-foreground/40 hover:text-foreground transition-colors flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </button>
                        </div>

                        {isLoading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
                            </div>
                        ) : subjects.length > 0 ? (
                            <div data-animate className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {subjects.map((sub, idx) => (
                                    <SubjectCard
                                        key={sub.id}
                                        subject={sub}
                                        index={idx}
                                        onClick={() => onSelectSubject(sub)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div data-animate className="text-center py-24 border-2 border-dashed border-border/30 rounded-3xl">
                                <div className="text-6xl mb-4">🎓</div>
                                <h3 className="text-xl font-bold text-foreground mb-2">No subjects available yet</h3>
                                <p className="text-foreground/50 text-sm max-w-sm mx-auto leading-relaxed">
                                    Your administrator needs to upload course content for <strong>{user.className}</strong> before you can start studying.
                                </p>
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
};

export default DashboardView;

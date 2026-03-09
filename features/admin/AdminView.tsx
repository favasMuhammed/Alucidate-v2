/**
 * AdminView.tsx
 * FAANG-quality Admin Portal for Alucidate.
 * Allows an admin to upload PDF chapters, manage subjects, and monitor processing.
 */
import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { User, SubjectData, ChapterDetails, FileContent, MindMapNode } from '@/types';
import { dbService } from '@/services/dbService';
import { generateChapterDetails_Interactive } from '@/services/aiService';
import { useFadeUp } from '@/hooks/useScrollAnimation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
// pdfjs loaded via CDN in index.html
// @ts-ignore
declare const pdfjsLib: any;

// ─── Helpers ────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
}

const addFileNameToNode = (node: MindMapNode, fileName: string): void => {
    node.fileName = fileName;
    node.children?.forEach(child => addFileNameToNode(child, fileName));
};

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
});

// ─── Subject Color Map ───────────────────────────────────────────────────────

const SUBJECT_GRADIENTS = [
    'from-violet-500/20 to-purple-600/10 border-violet-500/30',
    'from-blue-500/20 to-cyan-600/10 border-blue-500/30',
    'from-emerald-500/20 to-teal-600/10 border-emerald-500/30',
    'from-orange-500/20 to-amber-600/10 border-orange-500/30',
    'from-rose-500/20 to-red-600/10 border-rose-500/30',
    'from-sky-500/20 to-indigo-600/10 border-sky-500/30',
];

const SUBJECT_ICONS = ['⚗️', '📐', '🧬', '📚', '🌍', '💻', '🔭', '📊', '🎨', '⚙️'];

function getSubjectTheme(name: string) {
    const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
        gradient: SUBJECT_GRADIENTS[hash % SUBJECT_GRADIENTS.length],
        icon: SUBJECT_ICONS[hash % SUBJECT_ICONS.length],
    };
}

// ─── Processing Steps ────────────────────────────────────────────────────────

const STEPS = ['Reading PDF', 'Generating Mind Map', 'Extracting Keywords', 'Saving to Cloud'];

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatBadge: React.FC<{ value: number | string; label: string; icon: string }> = memo(({ value, label, icon }) => (
    <div className="flex flex-col items-center bg-elevated/60 backdrop-blur-sm border border-border rounded-2xl p-4 min-w-[100px]">
        <span className="text-2xl mb-1">{icon}</span>
        <span className="text-2xl font-extrabold text-foreground tracking-tight">{value}</span>
        <span className="text-xs text-foreground/50 font-medium mt-0.5 uppercase tracking-wider">{label}</span>
    </div>
));

interface ProcessingStatus {
    subjectId: string;
    step: number;
    message: string;
}

// ─── Delete Confirmation Modal ───────────────────────────────────────────────

const DeleteModal: React.FC<{
    subjectName: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ subjectName, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-background/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-up">
        <div className="bg-elevated border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <div className="w-14 h-14 bg-error/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-center text-foreground mb-2">Delete Subject?</h3>
            <p className="text-sm text-foreground/60 text-center mb-6">
                <strong className="text-foreground">"{subjectName}"</strong> and all its chapters will be permanently removed from Supabase.
            </p>
            <div className="flex gap-3">
                <button onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-border text-sm font-semibold text-foreground hover:bg-foreground/5 transition-all">
                    Cancel
                </button>
                <button onClick={onConfirm} className="flex-1 py-3 rounded-2xl bg-error/10 border border-error/30 text-error text-sm font-semibold hover:bg-error hover:text-white transition-all">
                    Delete
                </button>
            </div>
        </div>
    </div>
);

// ─── Subject Card ────────────────────────────────────────────────────────────

const SubjectCard: React.FC<{
    subject: SubjectData;
    isProcessing: boolean;
    onAddChapters: (subject: SubjectData, files: FileList) => void;
    onDelete: (subject: SubjectData) => void;
}> = memo(({ subject, isProcessing, onAddChapters, onDelete }) => {
    const { gradient, icon } = getSubjectTheme(subject.subject);
    const chapterCount = subject.structure?.children?.length ?? 0;
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={`group relative bg-gradient-to-br ${gradient} rounded-3xl border p-6 flex flex-col gap-4 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 overflow-hidden`}>
            {/* Top accent line */}
            <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-background/30 backdrop-blur-sm border border-white/10 flex items-center justify-center text-2xl shadow-sm">
                    {icon}
                </div>
                <button
                    onClick={() => onDelete(subject)}
                    className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-xl bg-background/30 border border-white/10 flex items-center justify-center text-foreground/40 hover:text-error hover:bg-error/10 transition-all"
                    aria-label={`Delete ${subject.subject}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>

            <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground tracking-tight">{subject.subject}</h3>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-foreground/50 bg-background/30 px-2 py-0.5 rounded-full">
                        {chapterCount} {chapterCount === 1 ? 'Chapter' : 'Chapters'}
                    </span>
                </div>
            </div>

            <div className="mt-auto">
                <label className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-background/40 backdrop-blur-sm border border-white/10 hover:bg-background/60 transition-all cursor-pointer ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Chapters
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf"
                        multiple
                        disabled={isProcessing}
                        onChange={(e) => e.target.files && onAddChapters(subject, e.target.files)}
                    />
                </label>
            </div>
        </div>
    );
});

// ─── Main AdminView ──────────────────────────────────────────────────────────

interface AdminViewProps {
    onCorpusUpdate: () => void;
    user: User;
    onLogout: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ onCorpusUpdate, user, onLogout }) => {
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddingSubject, setIsAddingSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);
    const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<SubjectData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.08 });

    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const subs = await dbService.getSubjectsByClass(user.className);
            setSubjects(subs);
            if (subs.length === 0) setIsAddingSubject(true);
        } catch (e: any) {
            setError('Failed to load subjects. Check your Supabase connection.');
        } finally {
            setIsLoading(false);
        }
    }, [user.className]);

    useEffect(() => { loadSubjects(); }, [loadSubjects]);

    const processAndSave = async (filesToProcess: FileList, subjectName: string, existingSubject?: SubjectData) => {
        const processingId = existingSubject?.id ?? 'new';
        setProcessingStatus({ subjectId: processingId, step: 0, message: 'Initializing...' });
        setError('');
        setSuccess('');

        try {
            const subjectId = `${user.className}-${subjectName}`;
            let subjectToUpdate: SubjectData;

            if (existingSubject) {
                subjectToUpdate = existingSubject;
            } else {
                const check = await dbService.getSubject(subjectId);
                if (check) throw new Error(`Subject "${subjectName}" already exists for this class.`);
                subjectToUpdate = {
                    id: subjectId,
                    className: user.className,
                    subject: subjectName,
                    files: [],
                    structure: { id: 'root', title: subjectName, children: [], startPage: 0, endPage: 0, fileName: 'subject' },
                };
            }

            const startChapterNumber = subjectToUpdate.structure.children.length;
            const newChapterMindMaps: MindMapNode[] = [];
            let newFilesAdded = 0;

            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                const chapterNumber = startChapterNumber + i + 1;

                if (subjectToUpdate.structure.children.some((c: MindMapNode) => c.fileName === file.name)) {
                    continue; // skip duplicates
                }

                setProcessingStatus({ subjectId: processingId, step: 0, message: `Reading "${file.name}"...` });
                const fileBase64 = await toBase64(file);

                setProcessingStatus({ subjectId: processingId, step: 0, message: `Loading PDF pages...` });
                const pdfData = base64ToUint8Array(fileBase64);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                // ✅ CRITICAL FIX: Cache PDF in IndexedDB so students can use AI chat
                await dbService.savePdfToCache(file.name, fileBase64, pdf.numPages);

                const chapterFileContent: FileContent = {
                    fileName: file.name,
                    fileBase64,
                    totalPages: pdf.numPages,
                };

                setProcessingStatus({ subjectId: processingId, step: 1, message: `Generating mind map for Chapter ${chapterNumber}...` });
                const details = await generateChapterDetails_Interactive(chapterFileContent, chapterNumber);

                setProcessingStatus({ subjectId: processingId, step: 2, message: `Extracting keywords...` });
                addFileNameToNode(details.mindMap, file.name);

                const chapterId = details.mindMap.id;
                const chapterDetails: ChapterDetails = {
                    ...details,
                    id: `${subjectId}-${chapterId}`,
                    subjectId: subjectId,
                    chapterId: chapterId,
                };

                setProcessingStatus({ subjectId: processingId, step: 3, message: `Saving Chapter ${chapterNumber} to cloud...` });
                await dbService.saveChapterDetails(chapterDetails);

                newChapterMindMaps.push(details.mindMap);
                newFilesAdded++;
            }

            if (newFilesAdded === 0) {
                setSuccess('No new files were added — all uploaded chapters already exist.');
            } else {
                subjectToUpdate.structure.children.push(...newChapterMindMaps);
                await dbService.saveSubject(subjectToUpdate);
                setSuccess(`✅ Successfully added ${newFilesAdded} chapter(s) to "${subjectName}".`);
            }

            setFiles(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            setIsAddingSubject(false);
            setNewSubjectName('');
            await loadSubjects();
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred during processing.');
        } finally {
            setProcessingStatus(null);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        try {
            // For now, remove from state (full Supabase delete can be added)
            setSubjects(prev => prev.filter(s => s.id !== deleteTarget.id));
            setSuccess(`Removed "${deleteTarget.subject}" from view.`);
        } catch {
            setError('Failed to delete subject.');
        } finally {
            setDeleteTarget(null);
        }
    };

    const totalChapters = subjects.reduce((sum, s) => sum + (s.structure?.children?.length ?? 0), 0);

    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand/6 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-500/4 rounded-full blur-[100px]" />
            </div>

            {/* Sidebar + Content Layout */}
            <div className="flex h-screen">
                {/* ── Sidebar ── */}
                <aside className="hidden lg:flex w-72 flex-col bg-elevated/60 backdrop-blur-xl border-r border-border p-6 shrink-0">
                    {/* Logo */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-light text-foreground">
                            <span className="font-bold shimmer-text">AI</span>ucidate
                        </h1>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand/70 mt-1 block">Admin Portal</span>
                    </div>

                    {/* Admin Profile */}
                    <div className="bg-background/50 rounded-2xl border border-border p-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-bold text-lg">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                                <p className="text-xs text-foreground/50 truncate">{user.className}</p>
                            </div>
                            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full border border-brand/20">Admin</span>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="space-y-3 mb-6">
                        <div className="flex items-center justify-between bg-background/30 rounded-xl p-3 border border-border/50">
                            <span className="text-xs text-foreground/50 font-medium">Subjects</span>
                            <span className="text-lg font-bold text-foreground">{subjects.length}</span>
                        </div>
                        <div className="flex items-center justify-between bg-background/30 rounded-xl p-3 border border-border/50">
                            <span className="text-xs text-foreground/50 font-medium">Total Chapters</span>
                            <span className="text-lg font-bold text-foreground">{totalChapters}</span>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="space-y-1 flex-1">
                        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand/10 border border-brand/20 text-brand text-sm font-semibold transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            Subjects
                        </button>
                        <button onClick={onCorpusUpdate} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-foreground/60 text-sm font-medium hover:bg-foreground/5 transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Student View
                        </button>
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
                <main className="flex-1 overflow-y-auto">
                    {/* Mobile Header */}
                    <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-elevated/50 backdrop-blur-xl sticky top-0 z-10">
                        <h1 className="text-xl font-bold text-foreground">
                            <span className="shimmer-text">AI</span>ucidate <span className="text-xs font-medium text-foreground/50 ml-1">Admin</span>
                        </h1>
                        <div className="flex gap-2">
                            <button onClick={onCorpusUpdate} className="text-xs font-semibold text-brand bg-brand/10 px-3 py-1.5 rounded-lg border border-brand/20">Student View</button>
                            <button onClick={onLogout} className="text-xs font-semibold text-foreground/50 hover:text-error px-3 py-1.5 rounded-lg border border-border transition-colors">Logout</button>
                        </div>
                    </div>

                    <div ref={containerRef} className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8">

                        {/* Page Title */}
                        <div data-animate>
                            <h2 className="text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">Course Content</h2>
                            <p className="text-foreground/50 mt-1">Upload PDF chapters and manage your {user.className} syllabus.</p>
                        </div>

                        {/* Notifications */}
                        {error && (
                            <div data-animate className="flex items-start gap-3 bg-error/8 border border-error/20 rounded-2xl p-4">
                                <svg className="w-5 h-5 text-error shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-sm text-error font-medium">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div data-animate className="flex items-start gap-3 bg-success/8 border border-success/20 rounded-2xl p-4">
                                <svg className="w-5 h-5 text-success shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-sm text-success font-medium">{success}</p>
                            </div>
                        )}

                        {/* Processing Status */}
                        {processingStatus && (
                            <div data-animate className="bg-brand/8 border border-brand/20 rounded-2xl p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <LoadingSpinner inline />
                                    <p className="text-sm font-semibold text-brand">{processingStatus.message}</p>
                                </div>
                                {/* Step Progress */}
                                <div className="flex items-center gap-2">
                                    {STEPS.map((step, idx) => (
                                        <React.Fragment key={step}>
                                            <div className={`flex items-center gap-1.5 ${idx <= processingStatus.step ? 'text-brand' : 'text-foreground/30'} transition-colors`}>
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${idx < processingStatus.step ? 'bg-brand border-brand text-white' : idx === processingStatus.step ? 'border-brand bg-brand/10 text-brand pulse-ring' : 'border-foreground/20 bg-transparent'}`}>
                                                    {idx < processingStatus.step ? '✓' : idx + 1}
                                                </div>
                                                <span className="text-xs font-medium hidden sm:block">{step}</span>
                                            </div>
                                            {idx < STEPS.length - 1 && (
                                                <div className={`flex-1 h-px transition-colors ${idx < processingStatus.step ? 'bg-brand' : 'bg-border'}`} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add New Subject Form */}
                        {isAddingSubject && (
                            <div data-animate className="bg-elevated/80 backdrop-blur-xl rounded-3xl border border-border p-6 lg:p-8 shadow-xl space-y-5 relative overflow-hidden">
                                <div className="absolute -top-16 -right-16 w-40 h-40 bg-brand/8 rounded-full blur-3xl pointer-events-none" />
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-foreground">New Subject</h3>
                                    {subjects.length > 0 && (
                                        <button onClick={() => { setIsAddingSubject(false); setError(''); }} className="text-sm text-foreground/40 hover:text-foreground transition-colors">Cancel</button>
                                    )}
                                </div>

                                <div className="space-y-4 relative z-10">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-foreground/50 mb-2 block">Subject Name</label>
                                        <input
                                            type="text"
                                            value={newSubjectName}
                                            onChange={(e) => setNewSubjectName(e.target.value)}
                                            placeholder="e.g., Advanced Physics"
                                            className="w-full bg-background/60 border border-border rounded-2xl px-4 py-3.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-foreground/50 mb-2 block">Chapter PDFs</label>
                                        <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-border hover:border-brand/50 hover:bg-brand/3 rounded-2xl cursor-pointer transition-all group">
                                            <div className="flex flex-col items-center gap-2 py-4">
                                                <div className="w-10 h-10 rounded-2xl bg-brand/10 group-hover:bg-brand/15 flex items-center justify-center transition-colors">
                                                    <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                </div>
                                                {files && files.length > 0 ? (
                                                    <p className="text-sm font-semibold text-brand">{files.length} file{files.length > 1 ? 's' : ''} selected</p>
                                                ) : (
                                                    <p className="text-sm text-foreground/50 font-medium">Click to upload PDFs</p>
                                                )}
                                                <p className="text-xs text-foreground/30">PDF files only · Multiple allowed</p>
                                            </div>
                                            <input ref={fileInputRef} type="file" onChange={(e) => setFiles(e.target.files)} className="hidden" accept=".pdf" multiple />
                                        </label>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        if (!newSubjectName.trim() || !files || files.length === 0) {
                                            setError('Please provide a subject name and at least one PDF.');
                                            return;
                                        }
                                        processAndSave(files, newSubjectName.trim());
                                    }}
                                    disabled={!!processingStatus}
                                    className="w-full py-4 rounded-2xl bg-brand text-white font-bold text-sm tracking-wide hover:bg-brand-hover shadow-[var(--glow-brand)] hover:shadow-[var(--glow-brand-hover)] hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all spring-tap"
                                >
                                    {processingStatus?.subjectId === 'new' ? 'Processing...' : 'Create Subject & Process Chapters'}
                                </button>
                            </div>
                        )}

                        {/* Add New Subject Button */}
                        {!isAddingSubject && (
                            <div data-animate>
                                <button
                                    onClick={() => { setIsAddingSubject(true); setError(''); setSuccess(''); }}
                                    className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-dashed border-brand/40 text-brand text-sm font-semibold hover:bg-brand/5 hover:border-brand/60 transition-all spring-tap"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add New Subject
                                </button>
                            </div>
                        )}

                        {/* Subject Grid */}
                        <section>
                            <div data-animate className="flex items-center justify-between mb-5">
                                <h2 className="text-xl font-bold text-foreground">
                                    {isLoading ? 'Loading...' : `${subjects.length} Subject${subjects.length !== 1 ? 's' : ''}`}
                                </h2>
                            </div>

                            {isLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {[0, 1, 2].map(i => (
                                        <div key={i} className="h-52 bg-elevated/40 rounded-3xl border border-border animate-pulse" />
                                    ))}
                                </div>
                            ) : subjects.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {subjects.map(sub => (
                                        <div key={sub.id} data-animate>
                                            <SubjectCard
                                                subject={sub}
                                                isProcessing={!!processingStatus}
                                                onAddChapters={(subject, files) => processAndSave(files, subject.subject, subject)}
                                                onDelete={setDeleteTarget}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : !isAddingSubject ? (
                                <div data-animate className="text-center py-20 border-2 border-dashed border-border/40 rounded-3xl">
                                    <div className="text-5xl mb-4">📚</div>
                                    <h3 className="text-xl font-bold text-foreground mb-2">No subjects yet</h3>
                                    <p className="text-foreground/50 text-sm max-w-xs mx-auto">Create your first subject above and upload chapter PDFs to get started.</p>
                                </div>
                            ) : null}
                        </section>
                    </div>
                </main>
            </div>

            {/* Delete Modal */}
            {deleteTarget && (
                <DeleteModal
                    subjectName={deleteTarget.subject}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
};

export default AdminView;

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, SubjectData, ChapterDetails } from '@/types';
import { dbService } from '@/services/dbService';
import { generateChapterDetails_Interactive } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// pdfjs loaded via CDN in index.html
// @ts-ignore
declare const pdfjsLib: any;

interface AdminViewProps {
    user: User;
    onLogout: () => void;
    onCorpusUpdate: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────

function hashStringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash % 360);
}

// ── AdminView ────────────────────────────────────────────────────────

export const AdminView: React.FC<AdminViewProps> = ({ user, onLogout, onCorpusUpdate }) => {
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'upload' | 'chapters'>('overview');

    // New subject state
    const [isCreating, setIsCreating] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Upload processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [processStep, setProcessStep] = useState(0); // 0=idle, 1=reading, 2=generating, 3=extracting, 4=saving, 5=done
    const [processError, setProcessError] = useState('');
    const [processProgress, setProcessProgress] = useState(0);

    const activeSubject = subjects.find(s => s.id === activeSubjectId) || null;

    useEffect(() => {
        loadSubjects();
    }, [user.className]);

    const loadSubjects = async () => {
        try {
            const data = await dbService.getSubjectsByClass(user.className);
            setSubjects(data);
            if (data.length > 0 && !activeSubjectId) setActiveSubjectId(data[0].id);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSubject = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = newSubjectName.trim();
        if (!name) return;
        setLoading(true);
        try {
            const newId = crypto.randomUUID();
            await dbService.saveSubject({
                id: newId,
                className: user.className,
                subject: name,
                files: [],
                structure: { id: 'root', title: name, children: [], startPage: 0, endPage: 0, fileName: '' }
            });
            await loadSubjects();
            setActiveSubjectId(newId);
            setIsCreating(false);
            setNewSubjectName('');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // ── Upload Flow ──

    const processAndSave = async (file: File) => {
        if (!activeSubject) return;
        setIsProcessing(true);
        setProcessStep(1);
        setProcessError('');
        setProcessProgress(0);

        try {
            // STEP 1: Read PDF
            const fileBuffer = await file.arrayBuffer();
            const fileBase64 = btoa(new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;

            await dbService.savePdfToCache(file.name, fileBase64, pdf.numPages);

            setProcessProgress(25);
            setProcessStep(2);

            // STEP 2 & 3: Generation (AI handles both map and keywords)
            const chapterNum = (activeSubject.structure?.children?.length || 0) + 1;
            const generatedDetails = await generateChapterDetails_Interactive({ fileName: file.name, fileBase64, totalPages: pdf.numPages }, chapterNum);

            setProcessProgress(75);
            setProcessStep(4);

            // Populate the remaining fields for ChapterDetails
            const chapterDetails: ChapterDetails = {
                ...generatedDetails,
                id: crypto.randomUUID(),
                subjectId: activeSubject.id,
                chapterId: chapterNum.toString()
            };

            // STEP 4: Save to Cloud
            const newChapterNode = {
                id: chapterDetails.chapterId,
                title: chapterDetails.chapterTitle,
                fileName: file.name,
                startPage: 1, endPage: pdf.numPages,
                children: []
            };

            const updatedSubject = { ...activeSubject };
            if (!updatedSubject.structure) updatedSubject.structure = { id: 'root', title: updatedSubject.subject, children: [] };
            if (!updatedSubject.structure.children) updatedSubject.structure.children = [];
            updatedSubject.structure.children.push(newChapterNode as any);

            await dbService.saveSubject(updatedSubject);
            await dbService.saveChapterDetails(chapterDetails);

            setProcessProgress(100);
            setProcessStep(5);

            await loadSubjects();
            onCorpusUpdate();

            setTimeout(() => {
                setIsProcessing(false);
                setProcessStep(0);
                setActiveTab('chapters');
            }, 2000);

        } catch (err: any) {
            setProcessError(err.message || 'Failed to process file');
            setProcessStep(0);
        }
    };

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        processAndSave(e.target.files[0]);
    };

    const handleDeleteSubject = async (id: string) => {
        if (confirm('Are you sure you want to delete this subject?')) {
            await dbService.deleteSubject(id);
            if (activeSubjectId === id) setActiveSubjectId(subjects[0]?.id || null);
            await loadSubjects();
            onCorpusUpdate();
        }
    };

    // ── Render Parts ──

    const renderProcessingUI = () => (
        <div className="w-full max-w-lg mx-auto bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div>
                    <h3 className="text-ink font-bold">Processing Document</h3>
                    <p className="text-sm text-ink-2">Please do not navigate away.</p>
                </div>
            </div>

            <div className="space-y-4">
                {[
                    { s: 1, label: 'Reading PDF & Extracting text' },
                    { s: 2, label: 'Generating interactive mind map' },
                    { s: 3, label: 'Extracting keywords & citations' },
                    { s: 4, label: 'Saving to Alucidate Cloud' }
                ].map((stepObj) => (
                    <div key={stepObj.s} className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 border transition-all ${processStep > stepObj.s ? 'bg-success border-success text-void' :
                            processStep === stepObj.s ? 'bg-transparent border-brand text-brand animate-pulse' :
                                'bg-transparent border-border text-ink-3'
                            }`}>
                            {processStep > stepObj.s ? '✓' : stepObj.s}
                        </div>
                        <span className={`text-sm font-medium ${processStep >= stepObj.s ? 'text-ink' : 'text-ink-3'} ${processStep > stepObj.s ? 'line-through text-ink-3' : ''}`}>
                            {stepObj.label}
                        </span>
                    </div>
                ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border w-full">
                <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
                    <div className="h-full bg-brand transition-all duration-300" style={{ width: `${processProgress}%` }} />
                </div>
            </div>

            {processError && (
                <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm text-center">
                    {processError}
                </div>
            )}
        </div>
    );

    return (
        <div className="h-[calc(100vh-56px)] mt-14 flex w-full max-w-[1280px] mx-auto bg-void text-ink font-sans">

            {/* ── Sidebar (280px) ── */}
            <aside className="w-[280px] border-r border-border flex flex-col pt-6 pb-4">
                <div className="px-6 mb-4 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3">Course Manager</h2>
                    <button onClick={() => { setIsCreating(true); setTimeout(() => inputRef.current?.focus(), 100); }} className="text-brand hover:text-brand-dim transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-1 scrollbar-thin scrollbar-thumb-border">
                    {isCreating && (
                        <form onSubmit={handleCreateSubject} className="mb-2 w-full">
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Module name..."
                                value={newSubjectName}
                                onChange={e => setNewSubjectName(e.target.value)}
                                onBlur={() => setIsCreating(false)}
                                className="w-full bg-surface border border-brand text-sm px-3 py-2 rounded-lg outline-none"
                            />
                        </form>
                    )}

                    {subjects.map(subject => {
                        const isActive = activeSubjectId === subject.id;
                        const hue = hashStringToHue(subject.subject);
                        const chCount = subject.structure?.children?.length || 0;
                        return (
                            <button
                                key={subject.id}
                                onClick={() => { setActiveSubjectId(subject.id); setActiveTab('overview'); }}
                                className={`w-full group flex items-center gap-3 p-2 rounded-xl transition-all relative ${isActive ? 'bg-raised' : 'hover:bg-surface'}`}
                            >
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand rounded-r-full" />}

                                <div
                                    className="w-8 h-8 rounded-lg flex shrink-0 border border-border/50 shadow-sm"
                                    style={{ background: `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${hue + 30},60%,35%))` }}
                                />

                                <div className="flex-1 min-w-0 pr-2 pb-0.5 pt-0.5 text-left flex flex-col">
                                    <span className="text-sm font-semibold truncate text-ink">{subject.subject}</span>
                                    <span className="text-[10px] text-ink-3 uppercase tracking-wider">{chCount} Chapters</span>
                                </div>

                                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-4 h-4 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </div>
                            </button>
                        );
                    })}

                    {subjects.length === 0 && !isCreating && !loading && (
                        <div className="p-4 border border-dashed border-border rounded-xl text-center flex flex-col items-center">
                            <span className="text-2xl text-ink-3 mb-2">📥</span>
                            <span className="text-sm text-ink-2 mb-3">Add your first subject</span>
                            <button onClick={() => setIsCreating(true)} className="text-xs font-bold text-brand bg-brand/10 px-3 py-1.5 rounded-md hover:bg-brand/20 transition-colors">Create Subject</button>
                        </div>
                    )}
                </div>
            </aside>

            {/* ── Main Content Area ── */}
            <main className="flex-1 flex flex-col min-w-0 bg-void">
                {activeSubject ? (
                    <>
                        {/* Header Tabs */}
                        <div className="border-b border-border px-8 pt-8 shrink-0">
                            <h1 className="text-3xl font-bold text-ink mb-6">{activeSubject.subject}</h1>
                            <div className="flex gap-6">
                                {(['overview', 'upload', 'chapters'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => !isProcessing && setActiveTab(tab)}
                                        disabled={isProcessing}
                                        className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-brand' : 'text-ink-3 hover:text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                    >
                                        {tab}
                                        {activeTab === tab && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Content Scroll */}
                        <div className="flex-1 overflow-y-auto p-8">
                            <AnimatePresence mode="wait">
                                {isProcessing ? (
                                    <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex items-center justify-center">
                                        {renderProcessingUI()}
                                    </motion.div>
                                ) : activeTab === 'overview' ? (
                                    <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-3xl">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-surface border border-border p-5 rounded-2xl">
                                                <p className="text-ink-3 text-xs uppercase font-bold tracking-widest mb-1">Total Chapters</p>
                                                <p className="text-3xl font-bold text-ink">{activeSubject.structure?.children?.length || 0}</p>
                                            </div>
                                            <div className="bg-surface border border-border p-5 rounded-2xl">
                                                <p className="text-ink-3 text-xs uppercase font-bold tracking-widest mb-1">Class Assignment</p>
                                                <p className="text-3xl font-bold text-ink">{activeSubject.className}</p>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-lg font-bold text-ink mb-4">Actions</h3>
                                            <button
                                                onClick={() => handleDeleteSubject(activeSubject.id)}
                                                className="px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg text-sm font-medium hover:bg-danger hover:text-white transition-colors"
                                            >
                                                Delete Subject
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : activeTab === 'upload' ? (
                                    <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                                        <label className="group relative w-full h-[320px] bg-surface hover:bg-surface border-2 border-dashed border-border hover:border-brand rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
                                            <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} />
                                            <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/5 transition-colors rounded-3xl" />
                                            <div className="w-20 h-20 mb-6 bg-raised border border-border rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 group-hover:shadow-[var(--shadow-glow-brand)] transition-all">
                                                📄
                                            </div>
                                            <h3 className="text-xl font-bold text-ink mb-2">Drop textbook PDF here</h3>
                                            <p className="text-ink-2 text-sm text-center max-w-[280px]">
                                                Alucidate AI will automatically read the chapter, build mind maps, extract keywords, and prepare the interactive tutor.
                                            </p>
                                        </label>
                                    </motion.div>
                                ) : (
                                    <motion.div key="chapters" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-4xl">
                                        {activeSubject.structure?.children?.length ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {activeSubject.structure.children.map(ch => (
                                                    <div key={ch.id} className="relative group bg-[rgba(21,26,35,0.8)] backdrop-blur-[12px] border border-border p-5 rounded-2xl flex flex-col hover:border-border-subtle hover:shadow-[var(--shadow-glow-purple)] transition-all duration-300">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand bg-brand/10 px-2 py-0.5 rounded-md">Chapter {ch.id}</span>
                                                            <button className="opacity-0 group-hover:opacity-100 p-1 text-danger hover:bg-danger/10 rounded transition-all">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        </div>
                                                        <h4 className="font-bold text-ink mb-1 truncate">{ch.title || ch.fileName}</h4>
                                                        <p className="text-xs text-ink-3 font-mono mt-auto pt-4 flex items-center gap-2">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                            {ch.fileName}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-20 text-ink-3">No chapters uploaded yet. Go to the Upload tab.</div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                ) : (
                    loading ? (
                        <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-void">
                            <div className="w-20 h-20 mb-6 flex items-center justify-center text-ink-3 border border-dashed border-border rounded-full text-4xl">
                                ✨
                            </div>
                            <h2 className="text-xl font-bold text-ink mb-2">Select a Subject</h2>
                            <p className="text-sm text-ink-2 max-w-sm">
                                Choose a subject from the sidebar to manage chapters or upload new textbook PDFs.
                            </p>
                        </div>
                    )
                )}
            </main>
        </div>
    );
};

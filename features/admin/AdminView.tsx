import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SubjectData, ChapterDetails, Class } from '@/types';

import { dbService } from '@/services/dbService';
import { generateChapterDetails_Interactive } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';

// pdfjs loaded via CDN in index.html
// @ts-ignore
declare const pdfjsLib: any;

function hashStringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash % 360);
}

export const AdminView: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'upload' | 'chapters'>('overview');
    const [isCreating, setIsCreating] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processStep, setProcessStep] = useState(0);
    const [processError, setProcessError] = useState('');
    const [processProgress, setProcessProgress] = useState(0);
    const [processQueueText, setProcessQueueText] = useState('');

    // Phase 7: Class Management
    const [classes, setClasses] = useState<Class[]>([]);
    const [selectedClassName, setSelectedClassName] = useState<string>('All');
    const [isManagingClasses, setIsManagingClasses] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [newClassType, setNewClassType] = useState<'class' | 'entrance'>('class');
    const [subjectClassSelection, setSubjectClassSelection] = useState('');
    const [classError, setClassError] = useState('');
    const [editingClassId, setEditingClassId] = useState<string | null>(null);
    const [editClassName, setEditClassName] = useState('');
    const [editClassType, setEditClassType] = useState<'class' | 'entrance'>('class');


    const activeSubject = subjects.find(s => s.id === activeSubjectId) || null;

    useEffect(() => {
        if (!user) return;
        loadClasses();
        loadSubjects();
    }, [user, selectedClassName]);

    const loadClasses = async () => {
        const data = await dbService.getClasses();
        setClasses(data);
        if (data.length > 0 && !subjectClassSelection) setSubjectClassSelection(data[0].name);
    };

    const loadSubjects = async () => {
        if (!user) return;
        setLoading(true);
        try {
            let data: SubjectData[] = [];
            if (selectedClassName === 'All') {
                data = await dbService.getAllSubjects();
            } else {
                data = await dbService.getSubjectsByClass(selectedClassName);
            }
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
        const targetClass = subjectClassSelection || user?.className;
        if (!name || !targetClass) return;
        setLoading(true);
        try {
            const newId = crypto.randomUUID();
            await dbService.saveSubject({
                id: newId,
                className: targetClass,
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

    const handleCreateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newClassName.trim();
        if (!trimmedName) return;
        if (classes.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
            setClassError('A class with this name already exists.');
            return;
        }
        try {
            await dbService.saveClass({
                id: crypto.randomUUID(),
                name: trimmedName,
                type: newClassType
            });
            setNewClassName('');
            setClassError('');
            loadClasses();
        } catch (err: any) {
            console.error(err);
            setClassError(err.message || 'Failed to create class.');
        }
    };

    const quickAddClass = async (name: string, type: 'class' | 'entrance') => {
        if (classes.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            setClassError(`${name} already exists.`);
            return;
        }
        try {
            await dbService.saveClass({ id: crypto.randomUUID(), name, type });
            setClassError('');
            loadClasses();
        } catch (err: any) {
            console.error(err);
            setClassError(err.message || `Failed to add ${name}.`);
        }
    };

    const handleStartEditClass = (c: Class) => {
        setEditingClassId(c.id);
        setEditClassName(c.name);
        setEditClassType(c.type);
        setClassError('');
    };

    const handleUpdateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = editClassName.trim();
        if (!trimmedName || !editingClassId) return;

        if (classes.some(c => c.id !== editingClassId && c.name.toLowerCase() === trimmedName.toLowerCase())) {
            setClassError('A class with this name already exists.');
            return;
        }

        try {
            await dbService.saveClass({
                id: editingClassId,
                name: trimmedName,
                type: editClassType
            });
            setEditingClassId(null);
            setClassError('');
            loadClasses();
        } catch (err: any) {
            console.error(err);
            setClassError(err.message || 'Failed to update class.');
        }
    };

    const handleDeleteClass = async (id: string) => {
        if (!confirm('Are you sure? This will not delete subjects in this class, but they will become harder to find.')) return;
        try {
            await dbService.deleteClass(id);
            loadClasses();
        } catch (err) {
            console.error(err);
        }
    };


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !activeSubject) return;
        const files = Array.from(e.target.files);
        e.target.value = ''; // Reset input visually

        setIsProcessing(true);
        let currentSubject = activeSubject;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setProcessQueueText(`(${i + 1} of ${files.length}): ${file.name}`);

            setProcessStep(1);
            setProcessError('');
            setProcessProgress(0);

            try {
                const fileBuffer = await file.arrayBuffer();

                // Use FileReader for high-performance Base64 encoding without blocking the main thread
                const fileBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(file);
                });

                const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
                await dbService.savePdfToCache(file.name, fileBase64, pdf.numPages);

                setProcessProgress(25);
                setProcessStep(2);

                const chapterNum = (currentSubject.structure?.children?.length || 0) + 1;
                const generatedDetails = await generateChapterDetails_Interactive({ fileName: file.name, fileBase64, totalPages: pdf.numPages }, chapterNum);

                setProcessProgress(75);
                setProcessStep(4);

                const chapterDetails: ChapterDetails = { ...generatedDetails, id: crypto.randomUUID(), subjectId: currentSubject.id, chapterId: chapterNum.toString() };
                const newChapterNode = { id: chapterDetails.chapterId, title: chapterDetails.chapterTitle, fileName: file.name, startPage: 1, endPage: pdf.numPages, children: [] };

                const updatedSubject = { ...currentSubject };
                if (!updatedSubject.structure) updatedSubject.structure = { id: 'root', title: updatedSubject.subject, children: [], startPage: 0, endPage: 0, fileName: '' };
                if (!updatedSubject.structure.children) updatedSubject.structure.children = [];
                updatedSubject.structure.children.push(newChapterNode as any);

                await dbService.saveSubject(updatedSubject);
                await dbService.saveChapterDetails(chapterDetails);

                setProcessProgress(100);
                setProcessStep(5);

                currentSubject = updatedSubject; // Roll latest subject state forward for next file

            } catch (err: any) {
                setProcessError(`Failed on ${file.name}: ` + (err.message || 'Unknown error'));
                setProcessStep(0);
                await new Promise(r => setTimeout(r, 2000)); // Pause so user sees error
            }
        }

        await loadSubjects(); // Refresh global React state once at the very end

        setTimeout(() => {
            setIsProcessing(false);
            setProcessStep(0);
            setActiveTab('chapters');
            setProcessQueueText('');
            setProcessError('');
        }, 1500);
    };

    const handleDeleteSubject = async (id: string) => {
        if (!confirm('Are you sure you want to delete this subject?')) return;
        await dbService.deleteSubject(id);
        const remaining = subjects.filter(s => s.id !== id);
        setActiveSubjectId(remaining[0]?.id || null);
        await loadSubjects();
    };

    const handleDeleteChapter = async (subjectId: string, chapterId: string, chapterTitle: string) => {
        if (!activeSubject) return;
        if (!confirm(`Are you sure you want to delete Chapter ${chapterId}: "${chapterTitle}"? This cannot be undone.`)) return;

        setIsProcessing(true);
        setProcessQueueText(`Deleting Chapter ${chapterId}...`);

        try {
            const updatedSubject = await dbService.deleteChapter(subjectId, chapterId, activeSubject);

            // Update local state immediately
            setSubjects(prev => prev.map(s => s.id === updatedSubject.id ? updatedSubject : s));

            // Force active subject refresh to re-render the chapter list
            if (activeSubjectId === updatedSubject.id) {
                // state is technically rolled forward in `loadSubjects` anyway
            }

            await loadSubjects();
        } catch (error: any) {
            console.error('Failed to delete chapter:', error);
            alert(`Failed to delete chapter: ${error.message || 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
            setProcessQueueText('');
        }
    };

    if (!user) return <LoadingSpinner fullScreen />;

    const renderProcessingUI = () => (
        <div className="w-full max-w-lg mx-auto bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div>
                    <h3 className="text-ink font-bold">Processing {processQueueText ? `Queue ${processQueueText}` : 'Document'}</h3>
                    <p className="text-sm text-ink-2">Please do not navigate away.</p>
                </div>
            </div>
            <div className="space-y-4">
                {[{ s: 1, label: 'Reading PDF & Extracting text' }, { s: 2, label: 'Generating interactive mind map' }, { s: 3, label: 'Extracting keywords & citations' }, { s: 4, label: 'Saving to Alucidate Cloud' }].map(stepObj => (
                    <div key={stepObj.s} className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 border transition-all ${processStep > stepObj.s ? 'bg-success border-success text-void' : processStep === stepObj.s ? 'bg-transparent border-brand text-brand animate-pulse' : 'bg-transparent border-border text-ink-3'}`}>
                            {processStep > stepObj.s ? '✓' : stepObj.s}
                        </div>
                        <span className={`text-sm font-medium ${processStep >= stepObj.s ? 'text-ink' : 'text-ink-3'} ${processStep > stepObj.s ? 'line-through text-ink-3' : ''}`}>{stepObj.label}</span>
                    </div>
                ))}
            </div>
            <div className="mt-6 pt-6 border-t border-border w-full">
                <div className="h-1.5 w-full bg-raised rounded-full overflow-hidden">
                    <div className="h-full bg-brand transition-all duration-300" style={{ width: `${processProgress}%` }} />
                </div>
            </div>
            {processError && <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm text-center">{processError}</div>}
        </div>
    );

    return (
        <div className="h-[calc(100vh-56px)] mt-14 flex w-full max-w-[1280px] mx-auto bg-void text-ink font-sans">
            {/* ── Sidebar ── */}
            <aside className="w-[280px] border-r border-border flex flex-col pt-6 pb-4 shrink-0">
                <div className="px-6 mb-4 flex flex-col gap-3">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3">Course Manager</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setIsManagingClasses(true)} className="flex-1 px-3 py-1.5 flex items-center justify-center gap-2 bg-raised border border-border rounded-lg text-xs font-bold text-ink-2 hover:text-ink hover:border-brand transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            Classes
                        </button>
                        <button onClick={() => { setIsCreating(true); setTimeout(() => inputRef.current?.focus(), 100); }} className="flex-1 px-3 py-1.5 flex items-center justify-center gap-2 bg-brand text-white rounded-lg text-xs font-bold hover:bg-brand-dim transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Subject
                        </button>
                    </div>
                </div>

                {/* Class Filter */}
                <div className="px-4 mb-4">
                    <select
                        value={selectedClassName}
                        onChange={(e) => setSelectedClassName(e.target.value)}
                        className="w-full bg-surface border border-border text-sm px-3 py-2 rounded-lg outline-none cursor-pointer focus:border-brand"
                    >
                        <option value="All">All Classes</option>
                        {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-1">
                    {isCreating && (
                        <form onSubmit={handleCreateSubject} className="mb-4 p-3 bg-surface border border-brand/30 rounded-xl space-y-2">
                            <input ref={inputRef} type="text" placeholder="Subject name..." value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} className="w-full bg-void border border-border text-sm px-3 py-2 rounded-lg outline-none focus:border-brand" />
                            <select
                                value={subjectClassSelection}
                                onChange={(e) => setSubjectClassSelection(e.target.value)}
                                className="w-full bg-void border border-border text-xs px-2 py-1.5 rounded-lg outline-none focus:border-brand"
                            >
                                {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <button type="submit" className="flex-1 text-[10px] font-bold bg-brand text-void py-1.5 rounded-md">CREATE</button>
                                <button type="button" onClick={() => setIsCreating(false)} className="px-3 text-[10px] font-bold text-ink-3">CANCEL</button>
                            </div>
                        </form>
                    )}

                    {loading ? <LoadingSpinner /> : subjects.map(subject => {
                        const isActive = activeSubjectId === subject.id;
                        const hue = hashStringToHue(subject.subject);
                        const chCount = subject.structure?.children?.length || 0;
                        return (
                            <button key={subject.id} onClick={() => { setActiveSubjectId(subject.id); setActiveTab('overview'); }} className={`w-full group flex items-center gap-3 p-2 rounded-xl transition-all relative ${isActive ? 'bg-raised' : 'hover:bg-surface'}`}>
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand rounded-r-full" />}
                                <div className="w-8 h-8 rounded-lg flex shrink-0 border border-border/50" style={{ background: `linear-gradient(135deg, hsl(${hue},70%,50%), hsl(${hue + 30},60%,35%))` }} />
                                <div className="flex-1 min-w-0 pr-2 text-left flex flex-col">
                                    <span className="text-sm font-semibold truncate text-ink">{subject.subject}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-brand font-bold uppercase">{subject.className}</span>
                                        <span className="text-[9px] text-ink-3">•</span>
                                        <span className="text-[9px] text-ink-3 uppercase tracking-wider">{chCount} Chapters</span>
                                    </div>

                                </div>
                            </button>
                        );
                    })}
                    {subjects.length === 0 && !isCreating && !loading && (
                        <div className="p-4 border border-dashed border-border rounded-xl text-center flex flex-col items-center">
                            <span className="text-2xl text-ink-3 mb-2">📥</span>
                            <span className="text-sm text-ink-2 mb-3">Add your first subject</span>
                            <button onClick={() => { setIsCreating(true); setTimeout(() => inputRef.current?.focus(), 100); }} className="text-xs font-bold text-brand bg-brand/10 px-3 py-1.5 rounded-md hover:bg-brand/20 transition-colors">Create Subject</button>
                        </div>
                    )}
                </div>

                <div className="px-4 pt-4 border-t border-border mt-2">
                    <button onClick={() => navigate('/dashboard')} className="w-full text-left flex items-center gap-2 text-sm text-ink-3 hover:text-ink transition-colors px-2 py-1.5 rounded-lg hover:bg-raised">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to Dashboard
                    </button>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main className="flex-1 flex flex-col min-w-0 bg-void overflow-hidden">
                {activeSubject ? (
                    <>
                        <div className="border-b border-border px-8 pt-8 shrink-0">
                            <h1 className="text-3xl font-bold text-ink mb-6">{activeSubject.subject}</h1>
                            <div className="flex gap-6">
                                {(['overview', 'upload', 'chapters'] as const).map(tab => (
                                    <button key={tab} onClick={() => !isProcessing && setActiveTab(tab)} disabled={isProcessing} className={`pb-3 text-sm font-bold uppercase tracking-wider transition-all relative ${activeTab === tab ? 'text-brand' : 'text-ink-3 hover:text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                                        {tab}
                                        {activeTab === tab && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
                                    </button>
                                ))}
                            </div>
                        </div>
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
                                                <p className="text-2xl font-bold text-ink">{activeSubject.className}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-ink mb-4">Danger Zone</h3>
                                            <button onClick={() => handleDeleteSubject(activeSubject.id)} className="px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg text-sm font-medium hover:bg-danger hover:text-white transition-colors">Delete Subject</button>
                                        </div>
                                    </motion.div>
                                ) : activeTab === 'upload' ? (
                                    <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
                                        <label className="group relative w-full h-[320px] bg-surface hover:bg-surface border-2 border-dashed border-border hover:border-brand rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300">
                                            <input type="file" accept="application/pdf" multiple className="hidden" onChange={handleUpload} />
                                            <div className="absolute inset-0 bg-brand/0 group-hover:bg-brand/5 transition-colors rounded-3xl" />
                                            <div className="w-20 h-20 mb-6 bg-raised border border-border rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 group-hover:shadow-[var(--shadow-glow-brand)] transition-all">📄</div>
                                            <h3 className="text-xl font-bold text-ink mb-2">Drop textbook PDF here</h3>
                                            <p className="text-ink-2 text-sm text-center max-w-[280px]">Alucidate AI will automatically read the chapter, build mind maps, extract keywords, and prepare the interactive tutor.</p>
                                        </label>
                                    </motion.div>
                                ) : (
                                    <motion.div key="chapters" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 max-w-4xl">
                                        {activeSubject.structure?.children?.length ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {activeSubject.structure.children.map(ch => (
                                                    <div key={ch.id} className="relative group bg-surface/80 backdrop-blur-sm border border-border p-5 rounded-2xl flex flex-col hover:border-border-subtle hover:shadow-[var(--shadow-glow-purple)] transition-all duration-300">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand bg-brand/10 px-2 py-0.5 rounded-md">Chapter {ch.id}</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteChapter(activeSubject.id, ch.id, ch.title || ch.fileName); }}
                                                                className="opacity-0 group-hover:opacity-100 p-1.5 text-ink-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                                                title="Delete Chapter"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
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
                                            <div className="text-center py-20 border border-dashed border-border rounded-2xl text-ink-3">No chapters uploaded yet. Go to the Upload tab.</div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                ) : isManagingClasses ? (
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-4xl mx-auto">
                            <div className="flex items-center justify-between mb-8">
                                <h1 className="text-3xl font-bold text-ink">Manage Classes</h1>
                                <button onClick={() => setIsManagingClasses(false)} className="text-sm font-bold text-brand h-10 px-4 rounded-xl hover:bg-brand/10">CLOSE</button>
                            </div>

                            {classError && (
                                <div className="mb-4 p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl">
                                    {classError}
                                </div>
                            )}

                            {editingClassId ? (
                                <form onSubmit={handleUpdateClass} className="bg-brand/10 border border-brand/30 p-6 rounded-2xl mb-8 flex gap-4 items-end">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-xs font-bold text-brand uppercase">Edit Class Name</label>
                                        <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} className="w-full bg-void border border-border px-4 py-2.5 rounded-xl outline-none focus:border-brand" />
                                    </div>
                                    <div className="w-48 space-y-2">
                                        <label className="text-xs font-bold text-brand uppercase">Type</label>
                                        <select value={editClassType} onChange={e => setEditClassType(e.target.value as any)} className="w-full bg-void border border-border px-4 py-2.5 rounded-xl outline-none focus:border-brand">
                                            <option value="class">Regular Class</option>
                                            <option value="entrance">Entrance Exam</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="submit" className="h-11 bg-brand text-void px-6 rounded-xl font-bold hover:bg-brand-dim transition-all">SAVE</button>
                                        <button type="button" onClick={() => setEditingClassId(null)} className="h-11 border border-border text-ink-2 px-6 rounded-xl font-bold hover:bg-raised transition-all">CANCEL</button>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={handleCreateClass} className="bg-surface border border-border p-6 rounded-2xl mb-8 flex gap-4 items-end">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-xs font-bold text-ink-3 uppercase">Class Name</label>
                                        <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="e.g. Class 12, NEET..." className="w-full bg-void border border-border px-4 py-2.5 rounded-xl outline-none focus:border-brand" />
                                    </div>
                                    <div className="w-48 space-y-2">
                                        <label className="text-xs font-bold text-ink-3 uppercase">Type</label>
                                        <select value={newClassType} onChange={e => setNewClassType(e.target.value as any)} className="w-full bg-void border border-border px-4 py-2.5 rounded-xl outline-none focus:border-brand">
                                            <option value="class">Regular Class</option>
                                            <option value="entrance">Entrance Exam</option>
                                        </select>
                                    </div>
                                    <button type="submit" className="h-11 bg-brand text-void px-8 rounded-xl font-bold hover:bg-brand-dim transition-all">ADD CLASS</button>
                                </form>
                            )}

                            {!editingClassId && (
                                <div className="mb-8 p-6 bg-surface border border-border rounded-2xl">
                                    <h2 className="text-xs font-bold text-ink-3 uppercase mb-3">Quick Add: Regular Classes</h2>
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map(c => (
                                            <button key={c} onClick={() => quickAddClass(c, 'class')} disabled={classes.some(existing => existing.name === c)} className="px-3 py-1.5 text-xs font-bold bg-void border border-border rounded-lg hover:border-brand hover:text-brand disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-ink-2">
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                    <h2 className="text-xs font-bold text-ink-3 uppercase mb-3">Quick Add: Entrance Exams</h2>
                                    <div className="flex flex-wrap gap-2">
                                        {['NEET', 'JEE Main', 'JEE Advanced', 'CUET', 'NDA'].map(c => (
                                            <button key={c} onClick={() => quickAddClass(c, 'entrance')} disabled={classes.some(existing => existing.name === c)} className="px-3 py-1.5 text-xs font-bold bg-void border border-border rounded-lg hover:border-purple hover:text-purple disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-ink-2">
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {classes.map(c => (
                                    <div key={c.id} className="bg-surface border border-border p-5 rounded-2xl flex items-center justify-between group">
                                        <div>
                                            <h3 className="font-bold text-ink">{c.name}</h3>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">{c.type}</span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleStartEditClass(c)} className="p-2 text-ink-3 hover:text-brand hover:bg-brand/10 rounded-lg transition-all" title="Edit Class">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button onClick={() => handleDeleteClass(c.id)} className="p-2 text-ink-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-all" title="Delete Class">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : loading ? (

                    <div className="h-full flex items-center justify-center"><LoadingSpinner /></div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-void">
                        <div className="w-20 h-20 mb-6 flex items-center justify-center text-ink-3 border border-dashed border-border rounded-full text-4xl">✨</div>
                        <h2 className="text-xl font-bold text-ink mb-2">Select a Subject</h2>
                        <p className="text-sm text-ink-2 max-w-sm">Choose a subject from the sidebar to manage chapters or upload new textbook PDFs.</p>
                    </div>
                )}
            </main>
        </div>
    );
};

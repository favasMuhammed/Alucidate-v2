import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { analyzeFiles, findRelevantFiles, generateChapterDetails_Interactive } from './services/aiService';
import { TutorResponse, FileContent, ReferencedImage, CropCoordinates, MindMapNode, ConversationTurn, ChapterDetails, User, SubjectData, Keyword } from './types';
import { useFadeUp } from './hooks/useScrollAnimation';
import { cn } from './utils';
import { AuthView } from './features/auth/AuthView';
import { dbService } from './services/dbService';

// @ts-ignore
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.mjs';

declare const marked: any;
declare const PDFLib: any;

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
}

// --- Binary Data Helpers ---
const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

// --- PDF Helper ---
const extractPdfPages = async (sourceBase64: string, startPage: number, endPage: number): Promise<string> => {
    const { PDFDocument } = PDFLib;
    const sourcePdfBytes = base64ToUint8Array(sourceBase64);
    const sourcePdfDoc = await PDFDocument.load(sourcePdfBytes);
    const newPdfDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: (endPage - startPage) + 1 }, (_, i) => startPage + i - 1);
    const copiedPages = await newPdfDoc.copyPages(sourcePdfDoc, pageIndices);
    copiedPages.forEach(page => newPdfDoc.addPage(page));
    const newPdfBytes = await newPdfDoc.save();
    return uint8ArrayToBase64(newPdfBytes);
};


// --- Helper Components & Icons ---
const LoadingSpinner: React.FC<{ fullScreen?: boolean; inline?: boolean }> = ({ fullScreen, inline }) => (
    <div className={`flex justify-center items-center ${fullScreen ? 'min-h-screen' : 'p-4'} ${inline ? 'h-full' : ''}`}>
        <div className={`animate-spin rounded-full border-b-2 border-gray-400 ${inline ? 'h-8 w-8' : 'h-16 w-16'}`}></div>
    </div>
);
const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
    </svg>
);
const AlucidateLogo: React.FC = () => (
    <h1 className="text-4xl sm:text-5xl font-light text-gray-200 tracking-wider">
        <span className="font-semibold text-white">AI</span>ucidate
    </h1>
);
const Header: React.FC<{ subtitle?: string }> = ({ subtitle }) => (
    <header className="text-center mb-8">
        <AlucidateLogo />
        {subtitle && <p className="mt-2 text-gray-400">{subtitle}</p>}
    </header>
);

// --- Main App Component (Router) ---
type AppState = 'loading' | 'auth' | 'admin' | 'dashboard';

export default function App() {
    const [appState, setAppState] = useState<AppState>('loading');
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Pre-warm the backend on mount (Render Free Tier spin-up mitigation)
    useEffect(() => {
        const pingBackend = async () => {
            const api_v = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';
            try { fetch(`${api_v}/health`).catch(() => { }); } catch { }
        };
        pingBackend();
    }, []);

    const checkAuthStatus = useCallback(async () => {
        setAppState('loading');
        try {
            const userEmail = localStorage.getItem('currentUserEmail');
            if (userEmail) {
                const user = await dbService.getUser(userEmail);
                if (user) {
                    setCurrentUser(user);
                    const hasSubjects = await dbService.hasSubjects();
                    setAppState(hasSubjects ? 'dashboard' : 'admin');
                    return;
                }
            }
            // No valid session â€” show auth screen
            setAppState('auth');
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.removeItem('currentUserEmail');
            setAppState('auth');
        }
    }, []);

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('currentUserEmail');
        setCurrentUser(null);
        setAppState('auth');
    }, []);

    const handleLogin = useCallback((user: User) => {
        localStorage.setItem('currentUserEmail', user.email);
        setCurrentUser(user);
        checkAuthStatus();
    }, [checkAuthStatus]);

    switch (appState) {
        case 'loading': return <LoadingSpinner fullScreen />;
        case 'auth': return <AuthView onLogin={handleLogin} />;
        case 'admin': return <AdminView onCorpusUpdate={() => setAppState('dashboard')} user={currentUser!} onLogout={handleLogout} />;
        case 'dashboard': return <DashboardView user={currentUser!} onLogout={handleLogout} onSwitchToAdmin={() => setAppState('admin')} />;
        default: return <div>Error: Invalid application state.</div>;
    }
}


// --- Data Processing Helper ---
const addFileNameToMindMapNode = (node: MindMapNode, fileName: string): void => {
    node.fileName = fileName;
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            addFileNameToMindMapNode(child, fileName);
        }
    }
};

// --- Admin View ---
const AdminView: React.FC<{ onCorpusUpdate: () => void; user: User; onLogout: () => void; }> = ({ onCorpusUpdate, user, onLogout }) => {
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [isAddingSubject, setIsAddingSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');
    const [files, setFiles] = useState<FileList | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null); // Use string to track which subject is processing
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.1 });

    const loadSubjects = useCallback(async () => {
        setIsLoading(true);
        const subs = await dbService.getSubjectsByClass(user.className);
        setSubjects(subs);
        if (subs.length === 0) {
            setIsAddingSubject(true); // If no subjects, default to add subject view
        }
        setIsLoading(false);
    }, [user.className]);

    useEffect(() => {
        loadSubjects();
    }, [loadSubjects]);

    const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });

    const processAndSave = async (filesToProcess: FileList, subjectName: string, existingSubject?: SubjectData) => {
        setIsProcessing(existingSubject ? existingSubject.id : 'new');
        setError('');
        setSuccess('');

        try {
            const subjectId = `${user.className}-${subjectName}`;
            let subjectToUpdate: SubjectData;

            if (existingSubject) {
                subjectToUpdate = existingSubject;
            } else {
                const check = await dbService.getSubject(subjectId);
                if (check) throw new Error(`Subject "${subjectName}" already exists.`);
                subjectToUpdate = {
                    id: subjectId,
                    className: user.className,
                    subject: subjectName,
                    files: [],
                    structure: { id: "root", title: subjectName, children: [], startPage: 0, endPage: 0, fileName: 'subject' }
                };
            }

            const startChapterNumber = subjectToUpdate.structure.children.length;
            const newChapterMindMaps: MindMapNode[] = [];
            let newFilesAdded = 0;

            for (let i = 0; i < filesToProcess.length; i++) {
                const file = filesToProcess[i];
                const chapterNumber = startChapterNumber + i + 1;

                if (subjectToUpdate.files.some(f => f.fileName === file.name)) {
                    setStatus(`Skipping "${file.name}" as it already exists for this subject.`);
                    continue;
                }

                setStatus(`Processing Chapter ${chapterNumber}: "${file.name}"...`);
                const fileBase64 = await toBase64(file);
                const pdfData = base64ToUint8Array(fileBase64);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                const chapterFileContent: FileContent = {
                    fileName: file.name,
                    fileBase64,
                    totalPages: pdf.numPages
                };

                setStatus(`Generating details for Chapter ${chapterNumber}...`);
                const details = await generateChapterDetails_Interactive(chapterFileContent, chapterNumber);

                addFileNameToMindMapNode(details.mindMap, file.name);

                const chapterId = details.mindMap.id;
                const chapterDetails: ChapterDetails = {
                    ...details,
                    id: `${subjectId}-${chapterId}`,
                    subjectId: subjectId,
                    chapterId: chapterId,
                };

                await dbService.saveChapterDetails(chapterDetails);

                newChapterMindMaps.push(details.mindMap);
                subjectToUpdate.files.push(chapterFileContent);
                newFilesAdded++;
            }

            if (newFilesAdded === 0) {
                setSuccess("No new files to add. Subject is already up-to-date.");
            } else {
                subjectToUpdate.structure.children.push(...newChapterMindMaps);
                await dbService.saveSubject(subjectToUpdate);
                setSuccess(`Successfully added ${newFilesAdded} new chapter(s) to "${subjectName}".`);
            }

            setFiles(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            await loadSubjects(); // Refresh the list
            setIsAddingSubject(false);
            setNewSubjectName('');

        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsProcessing(null);
            setStatus('');
        }
    };

    const handleAddNewSubject = () => {
        if (!newSubjectName || !files || files.length === 0) {
            setError("Please provide a subject name and at least one PDF chapter.");
            return;
        }
        processAndSave(files, newSubjectName);
    };

    const handleAppendChapters = (subject: SubjectData, chapterFiles: FileList | null) => {
        if (!chapterFiles || chapterFiles.length === 0) {
            setError(`Please select PDF files to add to "${subject.subject}".`);
            return;
        }
        processAndSave(chapterFiles, subject.subject, subject);
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand/5 blur-[100px]"></div>
            </div>

            <div ref={containerRef} className="max-w-5xl mx-auto relative z-10">
                <div data-animate className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-elevated/50 p-4 rounded-xl border border-border backdrop-blur-md">
                    <div>
                        <p className="text-xs font-semibold text-brand uppercase tracking-wider mb-1">Admin Portal</p>
                        <p className="text-foreground/80 text-sm">Welcome, <span className="font-medium text-foreground">{user.name}</span> ({user.className})</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onCorpusUpdate} className="text-sm font-medium text-foreground hover:text-brand transition-colors flex items-center gap-1.5 bg-background border border-border px-3 py-1.5 rounded-lg shadow-sm hover:shadow">
                            Student Dashboard <span className="text-base leading-none">&rarr;</span>
                        </button>
                        <div className="w-px h-5 bg-border"></div>
                        <button onClick={onLogout} className="text-sm font-medium text-foreground/80 hover:text-error transition-colors">Logout</button>
                    </div>
                </div>

                <div data-animate>
                    <Header subtitle="Manage subjects and chapters for the syllabus." />
                </div>

                {error && <div data-animate className="text-error bg-error/10 border border-error/20 p-4 rounded-xl my-4 text-sm font-medium">{error}</div>}
                {success && <div data-animate className="text-success bg-success/10 border border-success/20 p-4 rounded-xl my-4 text-sm font-medium">{success}</div>}
                {isProcessing && <div data-animate className="text-center text-brand font-medium my-4 animate-pulse">{status || 'Processing...'}</div>}

                {isAddingSubject ? (
                    <div data-animate className="bg-elevated/80 backdrop-blur-xl p-6 sm:p-8 rounded-[var(--radius-2xl)] border border-border shadow-xl space-y-6 relative overflow-hidden mt-8">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand/10 rounded-full blur-2xl pointer-events-none"></div>
                        <h2 className="text-2xl font-bold tracking-tight">Add New Subject</h2>
                        <div className="space-y-5 relative z-10">
                            <div>
                                <label className="block text-xs font-semibold tracking-wide text-foreground/70 mb-2 ml-1 uppercase">Subject Name</label>
                                <input type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="e.g., Advanced Physics"
                                    className="w-full bg-background/50 border border-border rounded-xl px-4 py-3.5 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold tracking-wide text-foreground/70 mb-2 ml-1 uppercase">Chapters (PDF)</label>
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border hover:border-brand/50 hover:bg-brand/5 rounded-xl cursor-pointer transition-all">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <svg className="w-8 h-8 mb-3 text-foreground/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                        <p className="text-sm text-foreground/70 font-medium">{files && files.length > 0 ? <span className="text-brand">{files.length} chapter(s) selected</span> : 'Click to upload or drag & drop'}</p>
                                        <p className="text-xs text-foreground/70 mt-1">PDF files only</p>
                                    </div>
                                    <input ref={fileInputRef} type="file" onChange={(e) => setFiles(e.target.files)} className="hidden" accept=".pdf" multiple />
                                </label>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 pt-2 relative z-10">
                            <button onClick={handleAddNewSubject} disabled={!!isProcessing}
                                className="flex-grow bg-brand text-white font-semibold py-3.5 rounded-xl shadow-lg hover:bg-brand-hover hover:shadow-xl hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all">
                                {isProcessing === 'new' ? 'Saving...' : 'Save Subject'}
                            </button>
                            <button onClick={() => { setIsAddingSubject(false); setError(''); }}
                                className="bg-transparent border border-border text-foreground hover:bg-foreground/5 font-semibold py-3.5 px-6 rounded-xl transition-all">
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div data-animate className="text-center mt-6">
                        <button onClick={() => setIsAddingSubject(true)}
                            className="bg-foreground text-background font-semibold py-3.5 px-8 rounded-xl shadow-[0_4px_14px_0_rgba(255,255,255,0.1)] hover:bg-foreground/90 hover:shadow-[0_6px_20px_rgba(255,255,255,0.15)] hover:-translate-y-0.5 active:scale-95 transition-all inline-flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            Add New Subject
                        </button>
                    </div>
                )}

                <div className="mt-16 space-y-6">
                    <div data-animate className="flex items-center justify-between border-b border-border/50 pb-4">
                        <h2 className="text-2xl font-bold tracking-tight">Existing Subjects</h2>
                        <span className="text-xs font-semibold tracking-wide text-foreground/80 bg-elevated px-3 py-1 rounded-full border border-border uppercase">{subjects.length} Total</span>
                    </div>
                    {isLoading ? <LoadingSpinner /> : subjects.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {subjects.map(sub => (
                                <div key={sub.id} data-animate className="group bg-elevated/50 backdrop-blur-md p-6 rounded-[var(--radius-xl)] border border-border hover:border-brand/30 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex flex-col h-full">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="flex-grow">
                                        <h3 className="text-xl font-bold mb-1 tracking-tight">{sub.subject}</h3>
                                        <p className="text-sm text-foreground/80 mb-6 flex items-center gap-1.5">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                            {sub.files.length} chapter(s)
                                        </p>
                                    </div>
                                    <div className="mt-auto pt-4 border-t border-border/50">
                                        <div className="flex items-center gap-3">
                                            <label className="flex-grow text-center cursor-pointer bg-background hover:bg-foreground/5 py-2.5 px-4 rounded-lg border border-border text-sm font-semibold transition-colors shadow-sm">
                                                <span>Add Chapters</span>
                                                <input type="file" className="hidden" accept=".pdf" multiple onChange={(e) => handleAppendChapters(sub, e.target.files)} disabled={!!isProcessing} />
                                            </label>
                                            {isProcessing === sub.id && <LoadingSpinner inline />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        !isAddingSubject && (
                            <div data-animate className="text-center py-16 bg-elevated/30 border border-border border-dashed rounded-2xl">
                                <div className="w-16 h-16 bg-brand/10 text-brand rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                </div>
                                <h3 className="text-lg font-semibold mb-1">No subjects found</h3>
                                <p className="text-sm text-foreground/80 max-w-sm mx-auto">Get started by creating your first subject and uploading chapter PDFs.</p>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Student Dashboard View ---
const DashboardView: React.FC<{ user: User; onLogout: () => void; onSwitchToAdmin: () => void; }> = ({ user, onLogout, onSwitchToAdmin }) => {
    const [subjects, setSubjects] = useState<SubjectData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSubject, setSelectedSubject] = useState<SubjectData | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.1 });

    useEffect(() => {
        setIsLoading(true);
        dbService.getSubjectsByClass(user.className)
            .then(setSubjects)
            .finally(() => setIsLoading(false));
    }, [user.className]);

    if (selectedSubject) {
        return <SubjectHomeView subject={selectedSubject} onBack={() => setSelectedSubject(null)} user={user} />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand/5 blur-[100px]"></div>
            </div>

            <div ref={containerRef} className="max-w-5xl mx-auto relative z-10">
                <div data-animate className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-elevated/50 p-4 rounded-xl border border-border backdrop-blur-md">
                    <div>
                        <p className="text-xs font-semibold text-brand uppercase tracking-wider mb-1">Student Portal</p>
                        <p className="text-foreground/80 text-sm">Welcome back, <span className="font-medium text-foreground">{user.name}</span> ({user.className})</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onLogout} className="text-sm font-medium text-foreground/80 hover:text-error transition-colors bg-background border border-border px-4 py-1.5 rounded-lg shadow-sm hover:shadow">Logout</button>
                    </div>
                </div>

                <div data-animate>
                    <Header subtitle="Select a subject to begin your study session." />
                </div>

                <div className="mt-12">
                    {isLoading ? (
                        <div data-animate className="py-20"><LoadingSpinner /></div>
                    ) : subjects.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {subjects.map(sub => (
                                <button key={sub.id} data-animate onClick={() => setSelectedSubject(sub)}
                                    className="group relative text-left bg-elevated/80 backdrop-blur-xl p-8 rounded-[var(--radius-2xl)] border border-border hover:border-brand/40 shadow-lg hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden flex flex-col items-center justify-center min-h-[160px]">
                                    <div className="absolute inset-0 bg-gradient-to-br from-brand/0 to-brand/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-brand/10 rounded-full blur-xl group-hover:bg-brand/20 transition-colors"></div>
                                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground relative z-10">{sub.subject}</h3>
                                    <p className="text-sm text-foreground/80 mt-2 font-medium tracking-wide relative z-10">{sub.files.length} Chapters</p>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div data-animate className="text-center py-16 bg-elevated/30 border border-border border-dashed rounded-[var(--radius-2xl)] backdrop-blur-sm max-w-2xl mx-auto">
                            <div className="w-16 h-16 bg-brand/5 text-brand rounded-full flex items-center justify-center mx-auto mb-4 border border-brand/20">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477-4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-foreground">No subjects found</h3>
                            <p className="text-foreground/80 max-w-sm mx-auto">An administrator needs to upload syllabus material for your class before you can start learning.</p>
                        </div>
                    )}
                </div>

                <div data-animate className="text-center mt-12 border-t border-border/50 pt-8">
                    <button onClick={onSwitchToAdmin} className="text-sm font-semibold tracking-wide text-foreground/80 hover:text-brand transition-colors uppercase">
                        Admin Access &rarr;
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Subject Home / Chapter List View ---
const SubjectHomeView: React.FC<{ subject: SubjectData; onBack: () => void; user: User; }> = ({ subject, onBack, user }) => {
    const [chapters, setChapters] = useState<ChapterDetails[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedChapter, setSelectedChapter] = useState<ChapterDetails | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.1 });

    useEffect(() => {
        const loadChapters = async () => {
            setIsLoading(true);
            try {
                // We'll use a new method on dbService to keep things encapsulated
                const results = await dbService.getChaptersBySubject(subject.id);
                setChapters(results);
            } catch (error) {
                console.error('Failed to load chapters:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadChapters();
    }, [subject.id]);

    if (selectedChapter) {
        return <ChapterView chapter={selectedChapter} subject={subject} onBack={() => setSelectedChapter(null)} />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[10%] w-[50%] h-[50%] rounded-full bg-brand/5 blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-info/5 blur-[100px]"></div>
            </div>

            <div ref={containerRef} className="max-w-5xl mx-auto relative z-10">
                <header data-animate className="mb-10 relative flex flex-col items-center text-center">
                    <button onClick={onBack} className="absolute left-0 top-0 sm:top-1/2 sm:-translate-y-1/2 flex items-center text-sm font-semibold tracking-wide text-foreground/80 hover:text-foreground transition-colors bg-elevated/50 px-4 py-2 rounded-full border border-border backdrop-blur-md">
                        <BackIcon className="h-4 w-4 mr-1.5" /> Back
                    </button>
                    <div className="mt-12 sm:mt-0">
                        <span className="text-xs font-semibold text-brand uppercase tracking-wider mb-2 block">{user.className}</span>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground">{subject.subject}</h1>
                        <p className="mt-4 text-foreground/80 max-w-xl mx-auto">Select a chapter from the syllabus below to start reviewing content, exploring mind maps, and practicing.</p>
                    </div>
                </header>

                <div className="mt-12">
                    <div data-animate className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
                        <h2 className="text-2xl font-bold tracking-tight">Syllabus Chapters</h2>
                        <span className="text-xs font-semibold tracking-wide text-foreground/80 bg-elevated px-3 py-1 rounded-full border border-border uppercase">{chapters.length} Chapters</span>
                    </div>

                    {isLoading ? (
                        <div data-animate className="py-20"><LoadingSpinner /></div>
                    ) : chapters.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {chapters.map((chapter, index) => (
                                <button key={chapter.id} data-animate onClick={() => setSelectedChapter(chapter)}
                                    className="group text-left p-6 bg-elevated/80 backdrop-blur-md rounded-[var(--radius-xl)] border border-border hover:border-brand/40 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden flex items-start gap-4">
                                    <div className="absolute inset-0 bg-gradient-to-r from-brand/0 to-brand/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand scale-y-0 group-hover:scale-y-100 transition-transform origin-top"></div>

                                    <div className="w-12 h-12 shrink-0 bg-background rounded-full border border-border flex flex-col items-center justify-center text-brand font-bold group-hover:bg-brand/10 transition-colors">
                                        <span className="text-xs opacity-70 leading-none">CH</span>
                                        <span className="text-lg leading-none mt-0.5">{chapter.chapterId}</span>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold text-lg text-foreground group-hover:text-brand transition-colors line-clamp-2">{chapter.chapterTitle}</h3>
                                        <div className="flex items-center gap-3 mt-2 text-xs font-medium text-foreground/80">
                                            <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Overview</span>
                                            <span className="w-1 h-1 rounded-full bg-border"></span>
                                            <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Practice</span>
                                        </div>
                                    </div>

                                    <div className="ml-auto text-foreground/80 group-hover:text-brand/70 group-hover:translate-x-1 transition-all self-center">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div data-animate className="text-center py-16 bg-elevated/30 border border-border border-dashed rounded-[var(--radius-2xl)] backdrop-blur-sm">
                            <div className="w-16 h-16 bg-foreground/5 text-foreground/70 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477-4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                            </div>
                            <h3 className="text-xl font-semibold mb-2 text-foreground">No chapters available</h3>
                            <p className="text-foreground/80 max-w-sm mx-auto">This subject currently has no chapters uploaded.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- Chapter Detail View ---
const ChapterView: React.FC<{ chapter: ChapterDetails; subject: SubjectData; onBack: () => void; }> = ({ chapter, subject, onBack }) => {
    const [conversation, setConversation] = useState<ConversationTurn[]>([]);
    const [isAnswering, setIsAnswering] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useFadeUp(containerRef, { stagger: 0.1 });

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isAnswering]);

    const findChapterNode = (structure: MindMapNode, chapterId: string): MindMapNode | null => {
        return structure.children.find(chap => chap.id === chapterId) || null;
    }

    const handleAnalysis = async () => {
        if (!query.trim()) return;
        setIsAnswering(true);
        setError('');
        try {
            const chapterNode = findChapterNode(subject.structure, chapter.chapterId);
            if (!chapterNode) throw new Error("Could not find chapter structure.");

            const sourceFile = subject.files.find(f => f.fileName === chapterNode.fileName);
            if (!sourceFile) throw new Error("Could not find source PDF for this chapter.");

            // The entire source file IS the chapter PDF now
            const chapterFileContent: FileContent = { ...sourceFile };

            const result = await analyzeFiles(query, [chapterFileContent], conversation, {
                chapterId: chapter.chapterId,
                chapterTitle: chapter.chapterTitle,
                pageOffset: chapterNode.startPage - 1
            });
            setConversation(prev => [...prev, { query, response: result }]);
            setQuery('');
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setIsAnswering(false);
        }
    };

    const handleAskFromFlowchart = (question: string) => {
        setQuery(`Tell me more about: "${question}"`);
        const input = document.getElementById('chat-input');
        if (input) {
            input.focus();
        }
    };

    return (
        <div className="h-screen bg-background text-foreground flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden relative">
            {/* Ambient Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand/5 blur-[120px]"></div>
            </div>

            <div ref={containerRef} className="max-w-6xl mx-auto w-full flex flex-col flex-grow min-h-0 relative z-10">
                <header data-animate className="mb-6 relative flex-shrink-0 flex items-center justify-between bg-elevated/50 p-4 rounded-2xl border border-border backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="flex flex-col items-center justify-center w-10 h-10 rounded-full bg-background border border-border text-foreground hover:bg-foreground/5 hover:border-brand/30 transition-all hover:-translate-x-1 shadow-sm">
                            <BackIcon className="h-5 w-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-brand uppercase tracking-wider bg-brand/10 px-2.5 py-0.5 rounded text-brand border border-brand/20">CH {chapter.chapterId}</span>
                                <span className="text-xs font-semibold tracking-wide text-foreground/80 uppercase">{subject.subject}</span>
                            </div>
                            <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight tracking-tight">{chapter.chapterTitle}</h1>
                        </div>
                    </div>
                </header>

                <main className="flex-grow flex flex-col lg:flex-row gap-6 min-h-0 pb-2">
                    {/* Left Column: Content Map & Info */}
                    <div data-animate className="w-full lg:w-1/3 flex flex-col gap-6 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pr-2 pb-4">
                        <div className="bg-elevated/80 backdrop-blur-xl p-6 rounded-[var(--radius-2xl)] border border-border shadow-sm">
                            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                Summary
                            </h3>
                            <p className="text-sm text-foreground/80 leading-relaxed text-balance">{chapter.summary}</p>
                        </div>

                        <div className="bg-elevated/80 backdrop-blur-xl p-6 rounded-[var(--radius-2xl)] border border-border shadow-sm flex-grow min-h-[350px] flex flex-col">
                            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c-1.105 0-2-.895-2-2V4c0-1.105.895-2 2-2h1m8 17c-1.105 0-2-.895-2-2V4c0-1.105.895-2 2-2h1m-9 17v-5h2v5M5 19v-5h2v5"></path></svg>
                                Knowledge Map
                            </h3>
                            <div className="flex-grow relative border border-border/50 rounded-xl overflow-hidden bg-background/50 shadow-inner">
                                <InteractiveMindMapView mindMap={chapter.mindMap} onAskQuestion={handleAskFromFlowchart} />
                            </div>
                        </div>

                        <div className="bg-elevated/80 backdrop-blur-xl p-6 rounded-[var(--radius-2xl)] border border-border shadow-sm">
                            <h3 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"></path></svg>
                                Keywords
                            </h3>
                            <KeywordsDisplay keywords={chapter.keywords} />
                        </div>
                    </div>

                    {/* Right Column: AI Tutor Chat */}
                    <div data-animate className="w-full lg:w-2/3 flex flex-col bg-elevated/80 backdrop-blur-xl rounded-[var(--radius-2xl)] border border-border shadow-lg overflow-hidden relative isolate">
                        {/* Background subtle decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

                        {/* Chat History */}
                        <div className="flex-grow overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                            {conversation.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center px-4 max-w-md mx-auto fade-in">
                                    <div className="w-16 h-16 bg-background text-brand rounded-full flex flex-col items-center justify-center mb-6 border border-border shadow-sm">
                                        <svg className="w-8 h-8 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                                    </div>
                                    <h3 className="text-xl font-bold text-foreground mb-2">Alucidate AI Tutor</h3>
                                    <p className="text-foreground/80 text-sm leading-relaxed text-balance">Ask questions about the chapter content, request explanations for specific concepts, or ask for practice questions.</p>
                                </div>
                            )}

                            {conversation.map((turn, index) => (
                                <div key={index} className="space-y-4 fade-in">
                                    <div className="flex justify-end">
                                        <div className="bg-foreground text-background px-5 py-3.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
                                            <p className="text-sm font-medium leading-relaxed">{turn.query}</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-start">
                                        <div className="bg-background border border-border px-5 sm:px-6 py-5 rounded-2xl rounded-tl-sm w-full max-w-full shadow-sm text-sm text-foreground/90 leading-relaxed overflow-x-auto">
                                            <TutorResponseView response={turn.response} subject={subject} />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {isAnswering && (
                                <div className="flex justify-start fade-in">
                                    <div className="bg-background border border-border px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
                                        <LoadingSpinner inline />
                                        <span className="text-sm font-semibold text-foreground/80 animate-pulse tracking-wide uppercase">Analyzing content...</span>
                                    </div>
                                </div>
                            )}
                            {error && (
                                <div className="flex justify-center fade-in">
                                    <div className="text-error bg-error/10 border border-error/20 px-4 py-3 rounded-xl text-sm font-medium max-w-md text-center shadow-sm">{error}</div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Chat Input */}
                        <div className="p-4 bg-background/50 border-t border-border/50 backdrop-blur-xl z-20">
                            <div className="relative flex items-center group">
                                <input
                                    id="chat-input"
                                    type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                                    placeholder={isAnswering ? "Waiting for response..." : `Ask about "${chapter.chapterTitle}"...`}
                                    className="w-full bg-background border border-border rounded-xl pl-5 pr-16 py-4 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all placeholder:text-foreground/70 shadow-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && !isAnswering && query.trim() && handleAnalysis()}
                                    disabled={isAnswering}
                                    autoComplete="off"
                                />
                                <button
                                    onClick={handleAnalysis}
                                    disabled={isAnswering || !query.trim()}
                                    className="absolute right-2 p-2.5 bg-brand text-white rounded-lg hover:bg-brand-hover active:scale-95 disabled:bg-foreground/10 disabled:text-foreground/80 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center"
                                >
                                    <svg className="w-5 h-5 -translate-x-px translate-y-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

// --- Reusable Modal Component ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, children, footer }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 opacity-100"
            onClick={onClose}
        >
            <div
                className="bg-elevated/90 backdrop-blur-xl rounded-[var(--radius-2xl)] shadow-2xl w-full max-w-lg border border-border transform transition-all duration-300 scale-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-5 border-b border-border/50 bg-background/50">
                    <h3 className="text-xl font-bold text-foreground tracking-tight">{title}</h3>
                    <button onClick={onClose} className="text-foreground/80 hover:text-foreground hover:bg-foreground/5 p-2 rounded-full transition-colors flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div className="p-6 text-foreground/80 leading-relaxed max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {children}
                </div>
                {footer && (
                    <div className="p-5 bg-background/50 border-t border-border/50 rounded-b-[var(--radius-2xl)] flex justify-end">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Interactive Chapter Components ---

const KeywordsDisplay: React.FC<{ keywords: Keyword[] }> = ({ keywords }) => {
    const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null);

    return (
        <div>
            <div className="flex flex-wrap gap-2">
                {keywords.map(kw => (
                    <button
                        key={kw.term}
                        onClick={() => setSelectedKeyword(kw)}
                        className={`text-xs font-medium py-1.5 px-3 rounded-full transition-all border ${selectedKeyword?.term === kw.term ? 'bg-brand text-white border-brand shadow-sm' : 'bg-background/50 text-foreground/70 border-border hover:bg-brand/10 hover:text-brand hover:border-brand/30'}`}
                    >
                        {kw.term}
                    </button>
                ))}
            </div>
            {selectedKeyword && (
                <div className="mt-5 p-5 bg-elevated/50 rounded-xl border border-border/50 shadow-sm fade-in relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-brand"></div>
                    <h4 className="font-bold text-foreground text-base tracking-tight mb-2">{selectedKeyword.term}</h4>
                    <p className="text-foreground/80 text-sm leading-relaxed">{selectedKeyword.definition}</p>
                </div>
            )}
        </div>
    );
};

const InteractiveMindMapView: React.FC<{ mindMap: MindMapNode; onAskQuestion: (question: string) => void }> = ({ mindMap, onAskQuestion }) => {
    const [activeNode, setActiveNode] = useState<MindMapNode | null>(null);

    const handleReadMore = () => {
        if (activeNode?.explanation) {
            onAskQuestion(activeNode.explanation);
            setActiveNode(null);
        }
    };

    const RenderNode: React.FC<{ node: MindMapNode; level: number }> = ({ node, level }) => (
        <div style={{ marginLeft: `${level * 24}px` }} className="my-1.5 relative">
            {level > 0 && (
                <div className="absolute -left-4 top-4 w-4 h-px bg-border/80"></div>
            )}
            {level > 0 && node.children && node.children.length > 0 && (
                <div className="absolute -left-4 top-4 bottom-[-1rem] w-px bg-border/80 hidden sm:block"></div>
            )}
            <button
                onClick={() => setActiveNode(node)}
                className={`w-full text-left flex items-start sm:items-center p-2.5 rounded-lg transition-all border ${activeNode?.id === node.id ? 'bg-brand/10 border-brand/30 text-brand shadow-sm' : 'bg-background hover:bg-elevated border-transparent hover:border-border/50 text-foreground'}`}
            >
                <div className={`flex items-center justify-center shrink-0 w-6 h-6 rounded mr-3 text-[10px] font-bold ${activeNode?.id === node.id ? 'bg-brand text-white' : 'bg-elevated text-foreground/80 border border-border'}`}>
                    {node.id}
                </div>
                <span className="font-medium text-sm leading-snug">{node.title}</span>
            </button>
            {node.children && node.children.length > 0 && (
                <div className="mt-1 relative">
                    {node.children.map((child, idx) => (
                        <RenderNode key={child.id} node={child} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );

    if (!mindMap) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-background/20">
                <div className="w-12 h-12 bg-foreground/5 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-foreground/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <p className="text-foreground/80 text-sm font-medium">No knowledge map available for this chapter.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full absolute inset-0">
            <div className="flex-grow p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <RenderNode node={mindMap} level={0} />
            </div>

            <Modal
                isOpen={!!activeNode}
                onClose={() => setActiveNode(null)}
                title={activeNode?.title ?? ''}
                footer={
                    activeNode?.explanation ? (
                        <button onClick={handleReadMore} className="bg-brand text-white font-semibold py-2.5 px-5 rounded-xl hover:bg-brand-hover hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-2">
                            Ask AI Tutor <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                        </button>
                    ) : undefined
                }
            >
                <p className="text-sm leading-relaxed">{activeNode?.explanation || 'No detailed explanation available.'}</p>
            </Modal>
        </div>
    );
};

// --- PDF Image Renderer ---
const ImageViewer: React.FC<{ image: ReferencedImage; sourceFiles: FileContent[]; onEnlarge?: (image: ReferencedImage) => void; }> = ({ image, sourceFiles, onEnlarge }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const renderPdfCrop = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const sourceFile = sourceFiles.find(f => f.fileName === image.fileName);
                if (!sourceFile) {
                    throw new Error(`Source file "${image.fileName}" not found.`);
                }

                if (!image.cropCoordinates) {
                    throw new Error("Crop coordinates are missing.");
                }

                const pdfData = base64ToUint8Array(sourceFile.fileBase64);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

                if (image.page < 1 || image.page > pdf.numPages) {
                    throw new Error(`Invalid page number ${image.page}.`);
                }

                const page = await pdf.getPage(image.page);
                const scale = 2.0;
                const viewport = page.getViewport({ scale });

                const hiddenCanvas = document.createElement('canvas');
                hiddenCanvas.width = viewport.width;
                hiddenCanvas.height = viewport.height;
                const hiddenCtx = hiddenCanvas.getContext('2d');
                if (!hiddenCtx) throw new Error("Could not get canvas context.");

                await page.render({ canvasContext: hiddenCtx, viewport }).promise;

                const canvas = canvasRef.current;
                if (!canvas) return;

                const { x, y, width, height } = image.cropCoordinates;
                const cropX = x * scale;
                const cropY = y * scale;
                const cropWidth = width * scale;
                const cropHeight = height * scale;

                canvas.width = cropWidth;
                canvas.height = cropHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context for visible canvas.");

                ctx.drawImage(
                    hiddenCanvas,
                    cropX, cropY, cropWidth, cropHeight,
                    0, 0, cropWidth, cropHeight
                );

            } catch (err: any) {
                console.error("Error rendering PDF crop:", err);
                setError(err.message || "Failed to render image.");
            } finally {
                setIsLoading(false);
            }
        };

        renderPdfCrop();
    }, [image, sourceFiles]);

    const containerClasses = `bg-background/50 p-4 rounded-xl border border-border flex flex-col items-center justify-center min-h-[200px] overflow-hidden group ${onEnlarge ? 'cursor-zoom-in hover:border-brand/30 hover:shadow-sm transition-all' : ''}`;

    return (
        <div className={containerClasses} onClick={onEnlarge ? () => onEnlarge(image) : undefined}>
            {isLoading && <LoadingSpinner inline />}
            {error && <p className="text-error text-sm font-medium text-center bg-error/10 p-3 rounded-lg">{error}</p>}
            <div className="relative rounded-lg overflow-hidden border border-border/50 bg-background flex items-center justify-center w-full">
                <canvas ref={canvasRef} className={`transition-opacity duration-500 w-full h-auto object-contain ${isLoading || error ? 'opacity-0' : 'opacity-100'}`} />
                {onEnlarge && !isLoading && !error && (
                    <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-background text-foreground shadow-lg rounded-full p-2 border border-border/50 transform scale-90 group-hover:scale-100 transition-transform">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                        </div>
                    </div>
                )}
            </div>
            {!isLoading && !error && <p className="text-foreground/70 text-xs font-medium mt-3 text-center leading-snug">{image.description}</p>}
        </div>
    );
};

const ImageModal: React.FC<{ image: ReferencedImage; sourceFiles: FileContent[]; onClose: () => void; }> = ({ image, sourceFiles, onClose }) => {
    return (
        <div
            className="fixed inset-0 bg-background/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4 sm:p-8 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div className="relative max-w-5xl w-full max-h-full flex flex-col" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 text-foreground/80 hover:text-foreground bg-elevated/50 hover:bg-elevated rounded-full h-10 w-10 flex items-center justify-center text-xl border border-border backdrop-blur-md transition-all z-10"
                    aria-label="Close image view"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div className="bg-elevated/80 backdrop-blur-xl rounded-[var(--radius-2xl)] border border-border shadow-2xl p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center h-full">
                    <ImageViewer image={image} sourceFiles={sourceFiles} />
                </div>
            </div>
        </div>
    );
};


// --- Tutor Response View ---
const TutorResponseView: React.FC<{ response: TutorResponse, subject: SubjectData }> = ({ response, subject }) => {
    const [enlargedImage, setEnlargedImage] = useState<ReferencedImage | null>(null);
    const answerRef = useRef<HTMLDivElement>(null);
    const sourceFiles = subject.files;

    const fileNameToChapterTitleMap = useMemo(() => {
        const map = new Map<string, string>();
        if (!subject?.structure?.children) {
            return map;
        }
        for (const chapterRootNode of subject.structure.children) {
            if (chapterRootNode.fileName && chapterRootNode.title) {
                map.set(chapterRootNode.fileName, chapterRootNode.title);
            }
        }
        return map;
    }, [subject]);

    useEffect(() => {
        if (answerRef.current && (window as any).renderMathInElement) {
            (window as any).renderMathInElement(answerRef.current, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                ],
                throwOnError: false
            });
        }
    }, [response.answer]);

    const answerHtml = useMemo(() => {
        if (!response.answer) return '';
        return marked.parse(response.answer);
    }, [response.answer]);

    return (
        <div className="flex flex-col gap-6">
            <div
                ref={answerRef}
                className="prose prose-sm sm:prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border prose-img:rounded-xl"
                dangerouslySetInnerHTML={{ __html: answerHtml }}
            />

            {(response.images?.length > 0 || response.citations?.length > 0 || response.sources?.length > 0) && (
                <div className="border-t border-border/50 pt-5 mt-2 space-y-6">
                    {response.images && response.images.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                Referenced Media
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {response.images.map((img, index) => (
                                    <ImageViewer key={index} image={img} sourceFiles={sourceFiles} onEnlarge={setEnlargedImage} />
                                ))}
                            </div>
                        </div>
                    )}

                    {response.citations.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477-4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                                Page References
                            </h4>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {response.citations.map((cite, index) => {
                                    const chapterTitle = fileNameToChapterTitleMap.get(cite.fileName) || cite.fileName;
                                    return (
                                        <li key={index} className="flex items-center gap-2 bg-background/50 border border-border px-3 py-2 rounded-lg text-xs font-medium text-foreground/80 shadow-sm">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
                                            <span className="truncate">{chapterTitle}</span>
                                            <span className="ml-auto text-foreground/80 bg-elevated px-2 py-0.5 rounded border border-border/50">Pg {cite.page}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {response.sources && response.sources.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-foreground/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                                Sources Consulted
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {response.sources.map((source, index) => (
                                    <span key={index} className="text-xs font-medium text-foreground/70 bg-background/50 border border-border px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shadow-sm">
                                        <svg className="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        {source}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {enlargedImage && (
                <ImageModal
                    image={enlargedImage}
                    sourceFiles={sourceFiles}
                    onClose={() => setEnlargedImage(null)}
                />
            )}
        </div>
    );
};

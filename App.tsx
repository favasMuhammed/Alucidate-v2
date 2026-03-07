import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { analyzeFiles, findRelevantFiles, generateChapterDetails_Interactive } from './services/geminiService';
import { TutorResponse, FileContent, ReferencedImage, CropCoordinates, MindMapNode, ConversationTurn, ChapterDetails, User, SubjectData, Keyword } from './types';

// @ts-ignore
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.mjs';

declare const marked: any;
declare const PDFLib: any;

if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.mjs';
}

const DB_NAME = 'SyllabusDB';
const DB_VERSION = 5; // Incremented version for schema change
const SUBJECTS_STORE = 'subjectsStore';
const CHAPTERS_STORE = 'chaptersStore';
const USERS_STORE = 'usersStore';

// --- IndexedDB Service ---

// FIX: Define an interface for dbService to resolve issues with 'this' type inference inside the object literal.
interface IDBService {
    openDB(): Promise<IDBDatabase>;
    dbRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | IDBRequest<T[]>): Promise<T>;
    getUser(email: string): Promise<User | undefined>;
    addUser(user: User): Promise<IDBValidKey>;
    getSubjectsByClass(className: string): Promise<SubjectData[]>;
    getSubject(id: string): Promise<SubjectData | undefined>;
    saveSubject(subject: SubjectData): Promise<IDBValidKey>;
    getChapterDetails(id: string): Promise<ChapterDetails | undefined>;
    saveChapterDetails(details: ChapterDetails): Promise<IDBValidKey>;
    clearDB(): Promise<void>;
    hasSubjects(): Promise<boolean>;
}

const dbService: IDBService = {
    openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(SUBJECTS_STORE)) {
                    const store = db.createObjectStore(SUBJECTS_STORE, { keyPath: 'id' });
                    store.createIndex('classIndex', 'className', { unique: false });
                }
                if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
                    db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(USERS_STORE)) {
                    db.createObjectStore(USERS_STORE, { keyPath: 'email' });
                }
            };
            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
        });
    },
    // FIX: Refactored to be fully robust. It now waits for the transaction to complete before resolving, guaranteeing data is committed.
    async dbRequest<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | IDBRequest<T[]>): Promise<T> {
        const db = await this.openDB();
        return new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = action(store);
            
            let result: T;

            request.onsuccess = () => {
                result = request.result;
            };

            request.onerror = () => {
                reject(request.error);
            };

            transaction.oncomplete = () => {
                resolve(result);
            };

            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    },
    getUser(email: string): Promise<User | undefined> {
        return (this as IDBService).dbRequest<User | undefined>(USERS_STORE, 'readonly', store => store.get(email));
    },
    addUser(user: User): Promise<IDBValidKey> {
        return (this as IDBService).dbRequest<IDBValidKey>(USERS_STORE, 'readwrite', store => store.put(user));
    },
    // FIX: Refactored to use the new robust `dbRequest` method for consistency and reliability.
    async getSubjectsByClass(className: string): Promise<SubjectData[]> {
        const results = await (this as IDBService).dbRequest<SubjectData[]>(SUBJECTS_STORE, 'readonly', store => {
            const index = store.index('classIndex');
            return index.getAll(className);
        });
        return results || [];
    },
    getSubject(id: string): Promise<SubjectData | undefined> {
        return (this as IDBService).dbRequest<SubjectData | undefined>(SUBJECTS_STORE, 'readonly', store => store.get(id));
    },
    saveSubject(subject: SubjectData): Promise<IDBValidKey> {
        return (this as IDBService).dbRequest<IDBValidKey>(SUBJECTS_STORE, 'readwrite', store => store.put(subject));
    },
    getChapterDetails(id: string): Promise<ChapterDetails | undefined> {
        return (this as IDBService).dbRequest<ChapterDetails | undefined>(CHAPTERS_STORE, 'readonly', store => store.get(id));
    },
    saveChapterDetails(details: ChapterDetails): Promise<IDBValidKey> {
        return (this as IDBService).dbRequest<IDBValidKey>(CHAPTERS_STORE, 'readwrite', store => store.put(details));
    },
    clearDB(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },
    hasSubjects(): Promise<boolean> {
        return (this as IDBService).dbRequest<number>(SUBJECTS_STORE, 'readonly', store => store.count()).then(count => count > 0);
    },
};


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

            // For testing convenience, automatically log in a default user.
            const defaultUser: User = { email: 'test@example.com', name: 'Test User', className: 'Class 10' };
            let user = await dbService.getUser(defaultUser.email);
            if (!user) {
                await dbService.addUser(defaultUser);
                user = defaultUser;
            }
            localStorage.setItem('currentUserEmail', user.email);
            setCurrentUser(user);
            const hasSubjects = await dbService.hasSubjects();
            setAppState(hasSubjects ? 'dashboard' : 'admin');

        } catch (error) {
            console.error("Error checking auth status:", error);
            localStorage.removeItem('currentUserEmail');
            setAppState('auth');
        }
    }, []);

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);
    
    const handleLogout = () => {
        localStorage.removeItem('currentUserEmail');
        setCurrentUser(null);
        setAppState('auth');
    };

    const handleLogin = (user: User) => {
        localStorage.setItem('currentUserEmail', user.email);
        setCurrentUser(user);
        checkAuthStatus();
    };

    switch (appState) {
        case 'loading': return <LoadingSpinner fullScreen />;
        case 'auth': return <AuthView onLogin={handleLogin} />;
        case 'admin': return <AdminView onCorpusUpdate={() => setAppState('dashboard')} user={currentUser!} onLogout={handleLogout}/>;
        case 'dashboard': return <DashboardView user={currentUser!} onLogout={handleLogout} onSwitchToAdmin={() => setAppState('admin')} />;
        default: return <div>Error: Invalid application state.</div>;
    }
}

// --- Authentication View ---
const AuthView: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginError, setLoginError] = useState('');
    const [signupName, setSignupName] = useState('');
    const [signupClass, setSignupClass] = useState('');
    const [signupEmail, setSignupEmail] = useState('');
    const [signupError, setSignupError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        const user = await dbService.getUser(loginEmail);
        if (user) {
            onLogin(user);
        } else {
            setLoginError('No account found with that email.');
        }
    };
    
    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setSignupError('');
        if (!signupName || !signupClass || !signupEmail) {
            setSignupError('Please fill out all fields.');
            return;
        }
        const existingUser = await dbService.getUser(signupEmail);
        if (existingUser) {
            setSignupError('An account with this email already exists.');
            return;
        }
        const newUser: User = { name: signupName, className: signupClass, email: signupEmail };
        await dbService.addUser(newUser);
        onLogin(newUser);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-900">
            <div className="max-w-md w-full">
                <Header subtitle={isLogin ? "Welcome back! Please log in." : "Create your student account."} />
                <div className="bg-gray-800/50 p-8 rounded-xl border border-gray-700 shadow-lg">
                    {isLogin ? (
                        <form onSubmit={handleLogin} className="space-y-6">
                            <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="Email Address" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
                            <button type="submit" className="w-full bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition">Log In</button>
                        </form>
                    ) : (
                         <form onSubmit={handleSignup} className="space-y-4">
                            <input type="text" value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="Full Name" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            <input type="text" value={signupClass} onChange={e => setSignupClass(e.target.value)} placeholder="Class (e.g., Class 10)" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            <input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} placeholder="Email Address" required className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-gray-400 focus:outline-none" />
                            {signupError && <p className="text-red-400 text-sm">{signupError}</p>}
                            <button type="submit" className="w-full bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition">Sign Up</button>
                        </form>
                    )}
                    <p className="text-center text-sm text-gray-400 mt-6">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-gray-300 hover:underline hover:text-white">
                            {isLogin ? 'Sign Up' : 'Log In'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

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
            if(fileInputRef.current) fileInputRef.current.value = '';
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
        <div className="min-h-screen bg-gray-900 text-gray-200 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400">Welcome, {user.name} (Admin for {user.className})</p>
                     <div className="flex items-center gap-4">
                        <button onClick={onCorpusUpdate} className="text-gray-300 hover:text-white">
                           Go to Student Dashboard &rarr;
                        </button>
                        <button onClick={onLogout} className="text-gray-400 hover:underline">Logout</button>
                    </div>
                </div>
                <Header subtitle="Manage subjects and chapters for the syllabus." />

                {error && <div className="text-red-400 bg-red-900/50 p-4 rounded-lg my-4">{error}</div>}
                {success && <div className="text-green-400 bg-green-900/50 p-4 rounded-lg my-4">{success}</div>}
                {isProcessing && <div className="text-center text-gray-300 my-2">{status || 'Processing...'}</div>}

                {isAddingSubject ? (
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 space-y-4">
                        <h2 className="text-xl font-bold">Add New Subject</h2>
                        <input type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="New Subject Name (e.g., Physics)" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3" />
                         <label className="block w-full text-center cursor-pointer bg-gray-700 hover:bg-gray-600 py-3 px-5 rounded-lg border border-gray-600">
                            <span>{files && files.length > 0 ? `${files.length} chapter(s) selected` : 'Choose Chapters (.pdf)'}</span>
                            <input ref={fileInputRef} type="file" onChange={(e) => setFiles(e.target.files)} className="hidden" accept=".pdf" multiple />
                        </label>
                        <div className="flex gap-4">
                            <button onClick={handleAddNewSubject} disabled={!!isProcessing} className="flex-grow bg-white text-black font-bold py-3 rounded-lg hover:bg-gray-300 disabled:bg-gray-500">
                                {isProcessing === 'new' ? 'Saving...' : 'Save New Subject'}
                            </button>
                             <button onClick={() => { setIsAddingSubject(false); setError(''); }} className="bg-gray-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-500">
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center">
                        <button onClick={() => setIsAddingSubject(true)} className="bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-300 transition">
                            + Add New Subject
                        </button>
                    </div>
                )}


                <div className="mt-8 space-y-4">
                    <h2 className="text-2xl font-semibold border-b border-gray-700 pb-2">Existing Subjects</h2>
                    {isLoading ? <LoadingSpinner /> : subjects.length > 0 ? (
                        subjects.map(sub => (
                             <div key={sub.id} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                                <h3 className="text-xl font-bold">{sub.subject}</h3>
                                <p className="text-sm text-gray-400 mb-4">{sub.files.length} chapter(s) uploaded.</p>
                                <div className="flex gap-4 items-center">
                                    <label className="flex-grow text-center cursor-pointer bg-gray-700 hover:bg-gray-600 py-2 px-4 rounded-lg border border-gray-600">
                                        <span>Add Chapters...</span>
                                        <input type="file" className="hidden" accept=".pdf" multiple onChange={(e) => handleAppendChapters(sub, e.target.files)} disabled={!!isProcessing} />
                                    </label>
                                    {isProcessing === sub.id && <LoadingSpinner inline />}
                                </div>
                            </div>
                        ))
                    ) : (
                        !isAddingSubject && <p className="text-center text-gray-400 py-8">No subjects created yet. Click "Add New Subject" to begin.</p>
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
        <div className="min-h-screen bg-gray-900 text-gray-200 p-8">
            <div className="max-w-4xl mx-auto">
                 <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400">Welcome, {user.name} ({user.className})</p>
                    <button onClick={onLogout} className="text-gray-400 hover:underline">Logout</button>
                </div>
                <Header subtitle="Select a subject to begin your study session." />
                <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                    {isLoading ? <LoadingSpinner /> : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {subjects.map(sub => (
                                <button key={sub.id} onClick={() => setSelectedSubject(sub)} className="text-center bg-gray-700/50 p-4 rounded-lg border border-gray-600 hover:bg-gray-700 hover:border-gray-500 transition-all">
                                    {sub.subject}
                                </button>
                            ))}
                        </div>
                    )}
                     {subjects.length === 0 && !isLoading && <p className="text-center text-gray-400">No subjects found for your class. An administrator needs to upload them.</p>}
                </div>
                <div className="text-center mt-6">
                    <button onClick={onSwitchToAdmin} className="text-gray-400 hover:text-white text-sm">
                        Manage Syllabus
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

    useEffect(() => {
        const loadChapters = async () => {
            setIsLoading(true);
            const db = await dbService.openDB();
            const transaction = db.transaction(CHAPTERS_STORE, 'readonly');
            const store = transaction.objectStore(CHAPTERS_STORE);
            const request = store.openCursor();
            const results: ChapterDetails[] = [];
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    if (cursor.value.subjectId === subject.id) {
                        results.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    results.sort((a, b) => a.chapterId.localeCompare(b.chapterId, undefined, { numeric: true, sensitivity: 'base' }));
                    setChapters(results);
                    setIsLoading(false);
                }
            };
        };
        loadChapters();
    }, [subject.id]);
    
    if (selectedChapter) {
        return <ChapterView chapter={selectedChapter} subject={subject} onBack={() => setSelectedChapter(null)} />;
    }

    return (
         <div className="min-h-screen bg-gray-900 text-gray-200 p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 relative">
                    <button onClick={onBack} className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-gray-300 hover:text-white">
                        <BackIcon className="h-5 w-5 mr-1"/> Back
                    </button>
                    <div className="text-center">
                        <h1 className="text-4xl sm:text-5xl font-bold text-gray-100">{subject.subject}</h1>
                        <p className="mt-2 text-gray-400">{user.className}</p>
                    </div>
                </header>
                 <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-200 mb-4">Chapters</h2>
                     {isLoading ? <LoadingSpinner /> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {chapters.map(chapter => (
                                <button key={chapter.id} onClick={() => setSelectedChapter(chapter)} className="text-left p-4 bg-gray-700/50 rounded-lg border border-gray-600 hover:bg-gray-700 hover:border-gray-500 transition-all">
                                    <span className="font-mono text-xs text-gray-400">Chapter {chapter.chapterId}</span>
                                    <h3 className="font-semibold mt-1">{chapter.chapterTitle}</h3>
                                </button>
                            ))}
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

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isAnswering]);

    const findChapterNode = (structure: MindMapNode, chapterId: string): MindMapNode | null => {
        return structure.children.find(chap => chap.id === chapterId) || null;
    }

    const handleAnalysis = async () => {
        if (!query) return;
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
        <div className="h-screen bg-gray-900 text-gray-200 flex flex-col p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto w-full flex flex-col flex-grow min-h-0">
                <header className="mb-4 relative flex-shrink-0">
                    <button onClick={onBack} className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center text-gray-300 hover:text-white">
                        <BackIcon className="h-5 w-5 mr-1"/> Back to Chapters
                    </button>
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-gray-100">{chapter.chapterTitle}</h1>
                        <p className="mt-1 text-gray-400">Chapter {chapter.chapterId} - {subject.subject}</p>
                    </div>
                </header>

                <main className="flex-grow space-y-4 overflow-y-auto mb-4 pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-800">
                    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 space-y-6">
                        <div>
                            <h3 className="font-semibold text-lg text-gray-200 mb-2">Summary</h3>
                            <p className="text-gray-300">{chapter.summary}</p>
                        </div>
                        <KeywordsDisplay keywords={chapter.keywords} />
                        <InteractiveMindMapView mindMap={chapter.mindMap} onAskQuestion={handleAskFromFlowchart} />
                    </div>

                    {conversation.map((turn, index) => (
                        <div key={index} className="space-y-2">
                            <div className="p-4 bg-gray-700/60 rounded-xl">
                                <p className="font-semibold text-gray-200">{turn.query}</p>
                            </div>
                            <TutorResponseView response={turn.response} subject={subject} />
                        </div>
                    ))}
                     
                    {isAnswering && <LoadingSpinner inline />}
                    {error && <div className="text-red-400 bg-red-900/50 p-4 rounded-lg">{error}</div>}
                    <div ref={chatEndRef} />
                </main>

                <footer className="flex-shrink-0 sticky bottom-0 py-2 bg-gray-900">
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                        <div className="flex gap-4">
                            <input
                                id="chat-input"
                                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                                placeholder={`Ask about "${chapter.chapterTitle}"...`}
                                className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-gray-400 focus:outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && !isAnswering && handleAnalysis()}
                            />
                            <button onClick={handleAnalysis} disabled={isAnswering || !query} className="bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-300 disabled:bg-gray-500 disabled:cursor-not-allowed">
                                Ask
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

// --- Reusable Modal Component ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, children, footer }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity duration-300"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 transform transition-transform duration-300 scale-95"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
                style={{ transform: 'scale(1)' }} // Animate in
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-gray-200">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <div className="p-6 text-gray-300">{children}</div>
                {footer && (
                    <div className="p-4 bg-gray-900/50 rounded-b-xl flex justify-end">
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
            <h3 className="font-semibold text-lg text-gray-200 mb-2">Keywords</h3>
            <div className="flex flex-wrap gap-2">
                {keywords.map(kw => (
                    <button key={kw.term} onClick={() => setSelectedKeyword(kw)} className="text-xs text-gray-300 bg-gray-700/80 py-1 px-3 rounded-full hover:bg-gray-600 transition">
                        {kw.term}
                    </button>
                ))}
            </div>
            {selectedKeyword && (
                <div className="mt-4 p-4 bg-gray-900/50 rounded-md border border-gray-700">
                    <h4 className="font-bold text-gray-200">{selectedKeyword.term}</h4>
                    <p className="text-gray-300 mt-1">{selectedKeyword.definition}</p>
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
            setActiveNode(null); // Close modal
        }
    };

    const RenderNode: React.FC<{ node: MindMapNode; level: number }> = ({ node, level }) => (
        <div style={{ marginLeft: `${level * 20}px` }} className="my-1">
            <button onClick={() => setActiveNode(node)} className={`w-full text-left flex items-center p-2 rounded-md transition-colors ${activeNode?.id === node.id ? 'bg-gray-600' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                <span className="font-mono text-xs mr-2 text-gray-400">{node.id}</span>
                <span className="font-medium">{node.title}</span>
            </button>
            {node.children && node.children.map(child => <RenderNode key={child.id} node={child} level={level + 1} />)}
        </div>
    );

    if (!mindMap) {
        return (
             <div>
                <h3 className="font-semibold text-lg text-gray-200 mb-2">Chapter Flowchart</h3>
                <p className="p-4 text-gray-400">No flowchart available for this chapter.</p>
            </div>
        )
    }

    return (
        <div>
            <h3 className="font-semibold text-lg text-gray-200 mb-2">Chapter Flowchart</h3>
            <div className="p-2 border border-gray-700 rounded-lg bg-gray-900/50 max-h-96 overflow-y-auto">
                <RenderNode node={mindMap} level={0} />
            </div>

            <Modal 
                isOpen={!!activeNode} 
                onClose={() => setActiveNode(null)} 
                title={activeNode?.title ?? ''}
                footer={
                    activeNode?.explanation ? (
                        <button onClick={handleReadMore} className="bg-white text-black font-bold py-2 px-4 rounded-lg hover:bg-gray-300 transition">
                            Read More &rarr;
                        </button>
                    ) : undefined
                }
            >
                <p>{activeNode?.explanation || 'No explanation available.'}</p>
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
                const scale = 2.0; // Render at a higher resolution
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

    const containerClasses = `bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col items-center justify-center min-h-[200px] ${onEnlarge ? 'cursor-zoom-in' : ''}`;

    return (
        <div className={containerClasses} onClick={onEnlarge ? () => onEnlarge(image) : undefined}>
            {isLoading && <LoadingSpinner inline />}
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <canvas ref={canvasRef} className={`transition-opacity duration-300 ${isLoading || error ? 'opacity-0' : 'opacity-100'}`} style={{ maxWidth: '100%', height: 'auto' }} />
            {!isLoading && !error && <p className="text-gray-400 text-sm mt-2 text-center">{image.description}</p>}
        </div>
    );
};

const ImageModal: React.FC<{ image: ReferencedImage; sourceFiles: FileContent[]; onClose: () => void; }> = ({ image, sourceFiles, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <ImageViewer image={image} sourceFiles={sourceFiles} />
                <button 
                    onClick={onClose} 
                    className="absolute -top-2 -right-2 text-white bg-gray-800 rounded-full h-8 w-8 flex items-center justify-center text-2xl hover:bg-gray-700 border border-gray-600"
                    aria-label="Close image view"
                >
                    &times;
                </button>
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

    // This effect will run after the component renders and the HTML is in the DOM.
    // It will then scan the content for math and render it using the KaTeX auto-render extension.
    useEffect(() => {
        if (answerRef.current && (window as any).renderMathInElement) {
            (window as any).renderMathInElement(answerRef.current, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
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
        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 shadow-lg mt-4">
            <div className="space-y-6">
                <div
                    ref={answerRef}
                    className="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-gray-100"
                    dangerouslySetInnerHTML={{ __html: answerHtml }}
                />
                 {response.images && response.images.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-lg text-gray-200 mb-2 mt-4">Referenced Images</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {response.images.map((img, index) => (
                                <ImageViewer key={index} image={img} sourceFiles={sourceFiles} onEnlarge={setEnlargedImage}/>
                            ))}
                        </div>
                    </div>
                )}
                 {response.citations.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-lg text-gray-200 mb-2 mt-4">References</h3>
                        <ul className="space-y-1 list-disc list-inside bg-gray-900/50 p-4 rounded-md">
                            {response.citations.map((cite, index) => {
                                const chapterTitle = fileNameToChapterTitleMap.get(cite.fileName) || cite.fileName;
                                return (
                                    <li key={index} className="text-sm text-gray-400">
                                        Chapter: <span className="font-medium text-gray-300">'{chapterTitle}'</span>, page {cite.page}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
                 {response.sources && response.sources.length > 0 && (
                     <div>
                        <h3 className="font-semibold text-lg text-gray-200 mb-2 mt-4">Sources Consulted</h3>
                        <ul className="flex flex-wrap gap-2">
                            {response.sources.map((source, index) => (
                                <li key={index} className="text-xs text-gray-300 bg-gray-700/80 py-1 px-3 rounded-full">
                                    {source}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
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

/**
 * ChapterView.tsx
 * FAANG-quality Chapter Learning View for Alucidate.
 *
 * Features:
 * - Breadcrumb: Dashboard → Subject → Chapter
 * - Left panel: Summary, Interactive Mind Map, Keywords
 * - Right panel: AI Tutor Chat with:
 *   - Persistent conversation history (Supabase)
 *   - Starter question suggestions
 *   - Copy-to-clipboard on responses
 *   - PDF cache fallback for AI chat (fixes post-Supabase bug)
 *   - Scroll-to-bottom auto scroll
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { User, SubjectData, ChapterDetails, ConversationTurn, Keyword, MindMapNode, ReferencedImage, FileContent, TutorResponse } from '@/types';
import { analyzeFiles } from '@/services/aiService';
import { dbService } from '@/services/dbService';
import { useFadeUp } from '@/hooks/useScrollAnimation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// pdfjs loaded via CDN in index.html
// @ts-ignore
declare const pdfjsLib: any;

declare const marked: any;

// ─── PDF Helpers ──────────────────────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
}

// ─── Starter Questions ────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
    'Give me a concise summary of this chapter in bullet points.',
    'What are the 3 most important concepts I need to know from this chapter?',
    'Create 5 practice questions for this chapter with answers.',
];

// ─── Copy Button ──────────────────────────────────────────────────────────────

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { }
    };

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-foreground/30 hover:text-foreground/70 transition-colors px-2 py-1 rounded-lg hover:bg-foreground/5"
            title="Copy response"
        >
            {copied ? (
                <>
                    <svg className="w-3.5 h-3.5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                </>
            ) : (
                <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                </>
            )}
        </button>
    );
};

// ─── Keywords Panel ───────────────────────────────────────────────────────────

const KeywordsPanel: React.FC<{ keywords: Keyword[] }> = memo(({ keywords }) => {
    const [selected, setSelected] = useState<Keyword | null>(null);

    return (
        <div>
            <div className="flex flex-wrap gap-1.5">
                {keywords.map(kw => (
                    <button
                        key={kw.term}
                        onClick={() => setSelected(s => s?.term === kw.term ? null : kw)}
                        className={`text-xs font-semibold py-1 px-3 rounded-full border transition-all ${selected?.term === kw.term
                            ? 'bg-brand text-white border-brand shadow-sm'
                            : 'bg-background/50 text-foreground/60 border-border hover:bg-brand/10 hover:text-brand hover:border-brand/30'
                            }`}
                    >
                        {kw.term}
                    </button>
                ))}
            </div>
            {selected && (
                <div className="mt-4 p-4 bg-elevated/50 rounded-xl border border-border/50 animate-fade-up relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand rounded-l-xl" />
                    <h4 className="font-bold text-foreground text-sm mb-1">{selected.term}</h4>
                    <p className="text-foreground/60 text-xs leading-relaxed">{selected.definition}</p>
                </div>
            )}
        </div>
    );
});

// ─── Mind Map Node ────────────────────────────────────────────────────────────

const MindMapNodeItem: React.FC<{
    node: MindMapNode;
    level: number;
    active: string | null;
    onSelect: (node: MindMapNode) => void;
}> = ({ node, level, active, onSelect }) => (
    <div style={{ marginLeft: `${level * 20}px` }} className="my-1 relative">
        {level > 0 && <div className="absolute -left-4 top-1/2 w-3 h-px bg-border/60" />}
        <button
            onClick={() => onSelect(node)}
            className={`w-full text-left flex items-center gap-2 p-2 rounded-xl border transition-all text-xs ${active === node.id
                ? 'bg-brand/10 border-brand/30 text-brand'
                : 'bg-transparent border-transparent hover:bg-foreground/5 hover:border-border/50 text-foreground/70'
                }`}
        >
            <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold ${active === node.id ? 'bg-brand text-white' : 'bg-elevated border border-border text-foreground/50'}`}>
                {node.id}
            </span>
            <span className="font-medium leading-snug">{node.title}</span>
        </button>
        {node.children?.length > 0 && (
            <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-px bg-border/40" />
                {node.children.map(child => (
                    <MindMapNodeItem
                        key={child.id}
                        node={child}
                        level={level + 1}
                        active={active}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        )}
    </div>
);

// ─── Mind Map View ────────────────────────────────────────────────────────────

const MindMapView: React.FC<{
    mindMap: MindMapNode;
    onAskQuestion: (q: string) => void;
}> = memo(({ mindMap, onAskQuestion }) => {
    const [activeNode, setActiveNode] = useState<MindMapNode | null>(null);

    if (!mindMap) return (
        <div className="flex items-center justify-center h-full p-6 text-center">
            <p className="text-foreground/40 text-xs">No knowledge map available.</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-border">
                <MindMapNodeItem node={mindMap} level={0} active={activeNode?.id ?? null} onSelect={setActiveNode} />
            </div>

            {activeNode && (
                <div className="border-t border-border/50 p-4 bg-background/50 animate-fade-up">
                    <p className="text-xs font-bold text-foreground mb-1">{activeNode.title}</p>
                    <p className="text-xs text-foreground/50 leading-relaxed mb-3 line-clamp-3">
                        {activeNode.explanation || 'No detailed explanation available.'}
                    </p>
                    {activeNode.explanation && (
                        <button
                            onClick={() => { onAskQuestion(`Tell me more about: "${activeNode.title}"`); setActiveNode(null); }}
                            className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1 transition-colors"
                        >
                            Ask AI Tutor →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});

// ─── AI Response View ─────────────────────────────────────────────────────────

const TutorResponseView: React.FC<{ response: TutorResponse; subject: SubjectData }> = memo(({ response, subject }) => {
    const answerRef = useRef<HTMLDivElement>(null);

    const fileToChapterMap = useMemo(() => {
        const map = new Map<string, string>();
        subject.structure?.children?.forEach((ch: MindMapNode) => {
            if (ch.fileName && ch.title) map.set(ch.fileName, ch.title);
        });
        return map;
    }, [subject]);

    useEffect(() => {
        if (answerRef.current && (window as any).renderMathInElement) {
            (window as any).renderMathInElement(answerRef.current, {
                delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
                throwOnError: false,
            });
        }
    }, [response.answer]);

    const answerHtml = useMemo(() => response.answer ? marked.parse(response.answer) : '', [response.answer]);

    return (
        <div className="flex flex-col gap-4">
            <div
                ref={answerRef}
                className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border"
                dangerouslySetInnerHTML={{ __html: answerHtml }}
            />

            {(response.citations?.length > 0 || response.sources?.length > 0) && (
                <div className="border-t border-border/30 pt-4 space-y-3">
                    {response.citations?.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 mb-2">Page References</p>
                            <div className="flex flex-wrap gap-2">
                                {response.citations.map((cite, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/60 bg-background/50 border border-border px-2.5 py-1 rounded-lg">
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                                        {fileToChapterMap.get(cite.fileName) || cite.fileName}
                                        <span className="text-foreground/30 font-mono">pg {cite.page}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

// ─── PDF Image Renderer ───────────────────────────────────────────────────────

const ImageViewer: React.FC<{ image: ReferencedImage; sourceFiles: FileContent[] }> = ({ image, sourceFiles }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const render = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const sourceFile = sourceFiles.find(f => f.fileName === image.fileName);
                if (!sourceFile || !image.cropCoordinates) throw new Error('Source or crop data missing.');
                const pdfData = base64ToUint8Array(sourceFile.fileBase64);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                const page = await pdf.getPage(image.page);
                const scale = 2.0;
                const viewport = page.getViewport({ scale });
                const hidden = document.createElement('canvas');
                hidden.width = viewport.width;
                hidden.height = viewport.height;
                const ctx = hidden.getContext('2d')!;
                await page.render({ canvasContext: ctx, viewport }).promise;
                const canvas = canvasRef.current;
                if (!canvas) return;
                const { x, y, width, height } = image.cropCoordinates!;
                canvas.width = width * scale;
                canvas.height = height * scale;
                canvas.getContext('2d')!.drawImage(hidden, x * scale, y * scale, width * scale, height * scale, 0, 0, width * scale, height * scale);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        };
        render();
    }, [image, sourceFiles]);

    return (
        <div className="bg-background/50 p-3 rounded-xl border border-border">
            {isLoading && <LoadingSpinner inline />}
            {error && <p className="text-error text-xs">{error}</p>}
            <canvas ref={canvasRef} className={`w-full h-auto ${isLoading ? 'hidden' : ''}`} />
            {!isLoading && !error && <p className="text-foreground/40 text-xs mt-2 text-center">{image.description}</p>}
        </div>
    );
};

// ─── Main ChapterView ─────────────────────────────────────────────────────────

interface ChapterViewProps {
    chapter: ChapterDetails;
    subject: SubjectData;
    user: User;
    onBack: () => void;
    onBackToDashboard: () => void;
}

export const ChapterView: React.FC<ChapterViewProps> = ({ chapter, subject, user, onBack, onBackToDashboard }) => {
    const [conversation, setConversation] = useState<ConversationTurn[]>([]);
    const [isAnswering, setIsAnswering] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'map' | 'keywords' | 'summary'>('summary');
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    useFadeUp(containerRef, { stagger: 0.08 });

    // Load persistent conversation history from Supabase
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const stored = await dbService.getConversationHistory(user.email, subject.id, chapter.chapterId);
                if (stored && stored.length > 0) setConversation(stored);
            } catch (e) {
                console.warn('Could not load conversation history:', e);
            } finally {
                setHistoryLoaded(true);
            }
        };
        loadHistory();
    }, [user.email, subject.id, chapter.chapterId]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversation, isAnswering]);

    // Save to Supabase whenever conversation updates
    useEffect(() => {
        if (!historyLoaded || conversation.length === 0) return;
        dbService.saveConversationHistory(user.email, subject.id, chapter.chapterId, conversation).catch(console.warn);

        // Track question count for progress in SubjectHomeView
        localStorage.setItem(`qs_${chapter.id}`, String(conversation.length));
    }, [conversation, historyLoaded, user.email, subject.id, chapter.chapterId, chapter.id]);

    const findChapterNode = useCallback((chapterId: string): MindMapNode | null => {
        return subject.structure?.children?.find((c: MindMapNode) => c.id === chapterId) ?? null;
    }, [subject.structure]);

    const handleAnalysis = useCallback(async (overrideQuery?: string) => {
        const q = (overrideQuery ?? query).trim();
        if (!q) return;
        setIsAnswering(true);
        setError('');
        if (!overrideQuery) setQuery('');

        try {
            const chapterNode = findChapterNode(chapter.chapterId);
            if (!chapterNode) throw new Error('Could not find chapter structure.');

            // ✅ CRITICAL FIX: Try subject.files first, fall back to IndexedDB PDF cache
            let sourceFile = subject.files?.find(f => f.fileName === chapterNode.fileName);
            if (!sourceFile) {
                const cached = await dbService.getPdfFromCache(chapterNode.fileName);
                if (!cached) throw new Error(`PDF "${chapterNode.fileName}" not found in cache. Please re-upload this chapter.`);
                sourceFile = cached;
            }

            const result = await analyzeFiles(q, [sourceFile], conversation, {
                chapterId: chapter.chapterId,
                chapterTitle: chapter.chapterTitle,
                pageOffset: chapterNode.startPage - 1,
            });

            setConversation(prev => [...prev, { query: q, response: result }]);
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsAnswering(false);
        }
    }, [query, conversation, chapter, subject, findChapterNode]);

    const handleStarterPrompt = useCallback((prompt: string) => {
        setQuery(prompt);
        handleAnalysis(prompt);
    }, [handleAnalysis]);

    const sourceFiles = useMemo(() => subject.files ?? [], [subject.files]);

    return (
        <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden relative">
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-brand/4 rounded-full blur-[120px]" />
            </div>

            {/* ── Header / Breadcrumb ─────────────────────────────────────────── */}
            <header className="flex-shrink-0 bg-elevated/70 backdrop-blur-xl border-b border-border/50 px-4 lg:px-6 py-3 relative z-20">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

                    {/* Left: Back + breadcrumb */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={onBack}
                            className="shrink-0 w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-foreground/60 hover:text-foreground hover:border-brand/30 hover:-translate-x-0.5 transition-all"
                            aria-label="Back to subject"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                            </svg>
                        </button>

                        <nav className="flex items-center gap-1.5 text-xs min-w-0" aria-label="Breadcrumb">
                            <button onClick={onBackToDashboard} className="text-foreground/40 hover:text-foreground transition-colors font-medium shrink-0">Dashboard</button>
                            <svg className="w-3 h-3 text-foreground/20 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            <button onClick={onBack} className="text-foreground/40 hover:text-foreground transition-colors font-medium truncate max-w-[100px]">{subject.subject}</button>
                            <svg className="w-3 h-3 text-foreground/20 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            <span className="text-foreground/70 font-semibold truncate">Ch.{chapter.chapterId}</span>
                        </nav>
                    </div>

                    {/* Right: Chapter title */}
                    <div className="hidden sm:flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-lg shrink-0">CH {chapter.chapterId}</span>
                        <h1 className="text-sm font-bold text-foreground truncate max-w-xs">{chapter.chapterTitle}</h1>
                    </div>
                </div>
            </header>

            {/* ── Body ──────────────────────────────────────────────────────── */}
            <div ref={containerRef} className="flex-1 flex min-h-0 max-w-7xl w-full mx-auto">

                {/* Left Panel */}
                <aside data-animate className="hidden lg:flex w-80 xl:w-96 flex-col border-r border-border/50 bg-transparent overflow-hidden">
                    {/* Tab nav */}
                    <div className="flex border-b border-border/50 shrink-0">
                        {(['summary', 'map', 'keywords'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab
                                    ? 'text-brand border-b-2 border-brand -mb-px bg-brand/5'
                                    : 'text-foreground/40 hover:text-foreground/70'
                                    }`}
                            >
                                {tab === 'summary' ? '📝 Summary' : tab === 'map' ? '🗺️ Map' : '🏷️ Keys'}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-border">
                        {activeTab === 'summary' && (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <p className="text-foreground/70 leading-relaxed text-sm">{chapter.summary}</p>
                            </div>
                        )}
                        {activeTab === 'map' && chapter.mindMap && (
                            <MindMapView
                                mindMap={chapter.mindMap}
                                onAskQuestion={q => { setQuery(q); inputRef.current?.focus(); }}
                            />
                        )}
                        {activeTab === 'keywords' && (
                            <KeywordsPanel keywords={chapter.keywords} />
                        )}
                    </div>
                </aside>

                {/* Right Panel — Chat */}
                <section data-animate className="flex-1 flex flex-col min-w-0 relative">

                    {/* Chat history */}
                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 scrollbar-thin scrollbar-thumb-border">

                        {/* Empty state + starter prompts */}
                        {conversation.length === 0 && !isAnswering && (
                            <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-6 max-w-lg mx-auto animate-fade-up">
                                <div className="w-16 h-16 rounded-3xl bg-brand/10 border border-brand/20 flex items-center justify-center text-2xl shadow-sm">
                                    🤖
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-foreground mb-1">AI Tutor Ready</h3>
                                    <p className="text-sm text-foreground/50 leading-relaxed">
                                        Ask anything about <strong>{chapter.chapterTitle}</strong>.<br />
                                        I'll cite exact page numbers from your textbook.
                                    </p>
                                </div>
                                <div className="w-full space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-foreground/30 mb-3">Suggested Questions</p>
                                    {STARTER_PROMPTS.map((prompt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleStarterPrompt(prompt)}
                                            className="w-full text-left text-sm text-foreground/60 bg-elevated/60 hover:bg-brand/5 border border-border hover:border-brand/30 px-4 py-3 rounded-2xl transition-all hover:-translate-y-0.5 hover:text-foreground"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Conversation turns */}
                        {conversation.map((turn, i) => (
                            <div key={i} className="space-y-4 animate-fade-up">
                                {/* User bubble */}
                                <div className="flex justify-end">
                                    <div className="bg-foreground text-background px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-md">
                                        <p className="text-sm font-medium leading-relaxed">{turn.query}</p>
                                    </div>
                                </div>

                                {/* AI response */}
                                <div className="flex justify-start">
                                    <div className="bg-elevated/60 backdrop-blur-sm border border-border px-5 py-5 rounded-2xl rounded-tl-sm w-full max-w-full shadow-sm text-sm text-foreground/90 leading-relaxed">
                                        <TutorResponseView response={turn.response} subject={subject} />
                                        {/* Actions */}
                                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30">
                                            <CopyButton text={turn.response.answer} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Thinking indicator */}
                        {isAnswering && (
                            <div className="flex justify-start animate-fade-up">
                                <div className="bg-elevated/60 border border-border px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
                                    <LoadingSpinner inline />
                                    <span className="text-sm font-semibold text-brand/70 animate-pulse">Analyzing textbook...</span>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex justify-center animate-fade-up">
                                <div className="bg-error/8 border border-error/20 px-4 py-3 rounded-2xl text-sm text-error font-medium max-w-md text-center shadow-sm">
                                    {error}
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Input bar */}
                    <div className="shrink-0 border-t border-border/50 p-4 bg-elevated/30 backdrop-blur-xl">
                        <div className="max-w-3xl mx-auto relative flex items-center gap-2">
                            <input
                                ref={inputRef}
                                id="chat-input"
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !isAnswering && query.trim() && handleAnalysis()}
                                disabled={isAnswering}
                                placeholder={isAnswering ? 'Thinking...' : `Ask about "${chapter.chapterTitle}"...`}
                                className="flex-1 bg-background border border-border rounded-2xl pl-5 pr-4 py-3.5 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all placeholder:text-foreground/30 disabled:opacity-60 shadow-sm"
                                autoComplete="off"
                            />
                            <button
                                onClick={() => handleAnalysis()}
                                disabled={isAnswering || !query.trim()}
                                className="w-11 h-11 bg-brand text-white rounded-2xl flex items-center justify-center hover:bg-brand-hover shadow-[var(--glow-brand)] hover:shadow-[var(--glow-brand-hover)] active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all spring-tap"
                                aria-label="Send"
                            >
                                <svg className="w-5 h-5 -translate-x-px translate-y-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-foreground/20 mt-2">AI may make mistakes. Verify with your textbook.</p>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default ChapterView;

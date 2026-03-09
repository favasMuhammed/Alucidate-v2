import React, { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, SubjectData, ChapterDetails, MindMapNode as NodeType, ConversationTurn } from '@/types';
import { dbService } from '@/services/dbService';
import { analyzeFiles } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MindMap } from '@/components/mindmap/MindMap';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// @ts-ignore
declare const pdfjsLib: any;

interface ChapterViewProps {
    user: User;
    subject: SubjectData;
    chapter: ChapterDetails;
    onBack: () => void;
}

interface TutorResponse {
    answer: string;
    citations?: { text: string; page: number; fileName: string }[];
    images?: { page: number; dataUrl: string; fileName: string }[];
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parsed?: TutorResponse;
    status: 'sending' | 'typing' | 'done' | 'error';
    timestamp: number;
}

// ── Components ────────────────────────────────────────────────────────

// AI Typewriter Response Renderer
const TypewriterResponse: React.FC<{ html: string }> = ({ html }) => {
    // Basic CSS typing animation on paragraphs
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-background/50 prose-pre:border prose-pre:border-border font-instrument text-lg tracking-wide"
        >
            <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    p: ({ node, ...props }) => <p className="mb-4" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="font-sans font-bold text-xl mt-6 mb-3 text-ink" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-ink" {...props} />
                }}
            >
                {html}
            </ReactMarkdown>
        </motion.div>
    );
};

// ── Main View ────────────────────────────────────────────────────────

export const ChapterView: React.FC<ChapterViewProps> = ({ user, subject, chapter, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [activeTab, setActiveTab] = useState<'mindmap' | 'summary' | 'keywords'>('mindmap');
    const [selectedNode, setSelectedNode] = useState<NodeType | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [pdfInstance, setPdfInstance] = useState<any>(null);

    // Load history and PDF
    useEffect(() => {
        const init = async () => {
            try {
                // Determine source file names from subject structure
                const sourceNames = subject.structure?.children?.map(c => c.fileName) || [];

                // Fallback PDF loader logic for AI context
                if (sourceNames.length > 0) {
                    const cacheReq = indexedDB.open('AlucidatePdfCache', 1);
                    cacheReq.onsuccess = async (e: any) => {
                        const db = e.target.result;
                        const tx = db.transaction('pdfs', 'readonly');
                        const store = tx.objectStore('pdfs');
                        const getReq = store.get(sourceNames[0]);
                        getReq.onsuccess = async () => {
                            if (getReq.result?.data) {
                                const binary = atob(getReq.result.data);
                                const array = new Uint8Array(binary.length);
                                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                                const vPdf = await pdfjsLib.getDocument({ data: array }).promise;
                                setPdfInstance(vPdf);
                            }
                        };
                    };
                }

                // Load Chat
                const history = await dbService.getConversationHistory(user.email, subject.id, chapter.chapterId);
                setChatHistory(history);
            } catch (err) {
                console.error("Failed to load chapter data:", err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [chapter.chapterId, user.email, subject.structure?.children]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    // Handle incoming MindMap clicks
    const handleNodeSelect = (node: NodeType) => {
        setSelectedNode(node);
        if (input === '') {
            setInput(`Explain "${node.title}" in the context of this chapter.`);
        }
    };

    const handleSend = async (text: string = input) => {
        if (!text.trim()) return;
        const msgId = Date.now().toString();
        const userMsg: ChatMessage = { id: msgId + '_u', role: 'user', content: text, status: 'done', timestamp: Date.now() };

        // Optimistic UI updates
        setInput('');
        setChatHistory(prev => [...prev, userMsg, { id: msgId + '_a', role: 'assistant', content: '', status: 'typing', timestamp: Date.now() + 1 }]);

        // Track progress in localStorage (increment question count)
        const qsCount = parseInt(localStorage.getItem(`qs_${chapter.chapterId}`) || '0', 10) + 1;
        localStorage.setItem(`qs_${chapter.chapterId}`, qsCount.toString());
        localStorage.setItem(`last_studied_${subject.id}`, new Date().toISOString());

        try {
            // Get PDF Context
            const sourceNames = subject.structure?.children?.map(c => c.fileName) || [];
            const relevantFiles = [];
            if (sourceNames.length > 0) {
                const cachedPdf = await dbService.getPdfFromCache(sourceNames[0]);
                if (cachedPdf) {
                    relevantFiles.push({ fileName: cachedPdf.fileName, fileBase64: cachedPdf.fileBase64, totalPages: cachedPdf.totalPages });
                }
            }

            // Rebuild context history for AI
            const apiHistory: ConversationTurn[] = chatHistory.map(h => ({
                query: h.role === 'user' ? h.content : '',
                response: { answer: h.role === 'assistant' ? (h.parsed?.answer || h.content) : '', citations: [], images: [] }
            })).filter(h => h.query || h.response.answer);

            const parsedRes = await analyzeFiles(
                text,
                relevantFiles as any,
                apiHistory,
                { chapterTitle: chapter.chapterTitle, chapterId: chapter.chapterId, pageOffset: 0 }
            );

            setChatHistory(prev => prev.map(m => m.id === msgId + '_a' ? {
                ...m,
                content: parsedRes.answer,
                parsed: parsedRes,
                status: 'done'
            } : m));

            // Save to DB
            await dbService.saveConversationHistory(user.email, subject.id, chapter.chapterId, [
                ...chatHistory,
                userMsg,
                { id: msgId + '_a', role: 'assistant', content: parsedRes.answer, parsed: parsedRes, status: 'done', timestamp: Date.now() + 1 }
            ]);

        } catch (err: any) {
            setChatHistory(prev => prev.map(m => m.id === msgId + '_a' ? { ...m, content: 'Failed to generate response. Please try again.', status: 'error' } : m));
        }
    };

    if (loading) return <LoadingSpinner fullScreen label="Preparing ALUCIDATE Tutor Engine..." />;

    return (
        <div className="h-screen w-[100vw] flex overflow-hidden bg-void font-sans fixed top-0 left-0 z-50">
            {/* ── Left Panel (Interactive Area) ── */}
            <div className="w-1/2 lg:w-3/5 h-full flex flex-col border-r border-border bg-surface relative z-10">
                {/* Header Navbar */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-raised text-ink-3 hover:text-ink transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <h1 className="font-bold text-base text-ink line-clamp-1">{chapter.chapterTitle}</h1>
                    </div>

                    <div className="flex bg-raised rounded-lg p-1 border border-border">
                        {(['mindmap', 'summary', 'keywords'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === tab ? 'bg-surface text-ink shadow-sm border border-border-subtle' : 'text-ink-3 hover:text-ink-2'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative overflow-hidden bg-void">
                    <AnimatePresence mode="wait">
                        {activeTab === 'mindmap' && chapter.mindMap ? (
                            <motion.div key="mindmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                                <MindMap
                                    data={chapter.mindMap}
                                    onNodeSelect={handleNodeSelect}
                                    activeNodeId={selectedNode?.id || null}
                                />
                            </motion.div>
                        ) : activeTab === 'summary' ? (
                            <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-3xl mx-auto h-full overflow-y-auto custom-scrollbar">
                                <h2 className="text-2xl font-bold font-instrument mb-6 text-brand">Chapter Summary</h2>
                                <div className="prose prose-p:text-ink-2 prose-strong:text-ink prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {chapter.summary || 'Summary not available.'}
                                    </ReactMarkdown>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="keywords" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 h-full overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(chapter.keywords || []).map((kw, i) => (
                                        <div key={i} className="bg-surface border border-border p-4 rounded-xl hover:border-brand/40 transition-colors">
                                            <h4 className="font-bold text-brand mb-1">{kw.term}</h4>
                                            <p className="text-sm text-ink-2">{kw.definition}</p>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Right Panel (Tutor Chat) ── */}
            <div className="w-1/2 lg:w-2/5 h-full flex flex-col bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDMiLz4KPC9zdmc+')] relative">
                <div className="absolute inset-0 bg-void/90" />

                {/* Chat Header */}
                <div className="h-14 flex items-center px-6 border-b border-border/50 bg-void/50 backdrop-blur z-20 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-brand glow-brand mr-3 animate-pulse" />
                    <span className="font-bold text-sm text-ink tracking-tight">ALUCIDATE <span className="opacity-50">Tutor</span></span>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 relative z-10 custom-scrollbar">
                    {chatHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                            <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-2xl mb-6 shadow-sm">
                                🧠
                            </div>
                            <h3 className="font-instrument text-2xl font-bold text-ink mb-2">Hello, {user.name.split(' ')[0]}</h3>
                            <p className="text-sm text-ink-3 mb-8">What would you like to explore in {chapter.chapterTitle}?</p>

                            <div className="w-full space-y-2 text-left">
                                {["Give me a high-level overview of this chapter.", "Explain the most difficult concept simply.", "Generate a 3-question quiz."].map((p, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSend(p)}
                                        className="w-full p-3 bg-surface border border-border rounded-xl text-xs text-ink-2 hover:border-brand hover:text-brand transition-all flex items-center gap-3 group"
                                    >
                                        <span className="text-brand/50 group-hover:text-brand transition-colors">→</span>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        chatHistory.map((m) => (
                            <motion.div
                                key={m.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[85%] rounded-2xl p-4 md:p-5 ${m.role === 'user'
                                    ? 'bg-brand text-white'
                                    : 'bg-surface border border-border/50 text-ink'
                                    }`}>
                                    {m.role === 'user' ? (
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                    ) : m.status === 'typing' ? (
                                        <div className="flex gap-1.5 items-center h-4">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    ) : m.status === 'error' ? (
                                        <p className="text-danger text-sm">{m.content}</p>
                                    ) : (
                                        <TypewriterResponse html={m.parsed?.answer || m.content} />
                                    )}

                                    {/* Action Footers for AI */}
                                    {m.role === 'assistant' && m.status === 'done' && (
                                        <div className="mt-3 pt-3 border-t border-border/50 flex justify-end">
                                            <button
                                                onClick={() => navigator.clipboard.writeText(m.parsed?.answer || m.content)}
                                                className="text-xs text-ink-3 hover:text-ink transition-colors px-2 py-1 flex items-center gap-1.5"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                Copy
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))
                    )}
                    <div ref={chatEndRef} className="h-4" />
                </div>

                {/* Input Area */}
                <div className="p-4 sm:p-6 bg-void relative z-20 border-t border-border/30">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="relative max-w-full flex items-end gap-2 bg-surface hover:border-brand-dim transition-colors border border-border rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-brand focus-within:border-brand"
                    >
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Message ALUCIDATE Tutor..."
                            className="flex-1 max-h-32 min-h-[44px] bg-transparent text-sm text-ink placeholder:text-ink-3 resize-none outline-none py-3 px-3 custom-scrollbar"
                            rows={1}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="bg-brand hover:bg-brand-dim text-white disabled:bg-surface disabled:text-ink-3 disabled:border-border transition-all w-11 h-11 flex items-center justify-center shrink-0 rounded-xl mb-[2px] disabled:shadow-none"
                        >
                            <svg className="w-5 h-5 translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </form>
                    <p className="text-center text-[10px] text-ink-3 mt-3">ALUCIDATE AI can make mistakes. Verify important information.</p>
                </div>
            </div>
        </div>
    );
};

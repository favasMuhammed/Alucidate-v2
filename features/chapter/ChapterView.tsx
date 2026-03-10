import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SubjectData, ChapterDetails, MindMapNode as NodeType, ConversationTurn } from '@/types';
import { dbService } from '@/services/dbService';
import { analyzeFiles } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MindMap } from '@/components/mindmap/MindMap';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useAuth } from '@/hooks/useAuth';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parsed?: { answer: string; citations?: any[]; images?: any[]; };
    status: 'sending' | 'typing' | 'done' | 'error';
    timestamp: number;
}

// ── AI Typewriter Response Renderer ──────────────────────────────────────────
const TypewriterResponse: React.FC<{ html: string }> = ({ html }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-raised"
    >
        <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                p: ({ ...props }) => <p className="mb-4 font-[Instrument_Serif] text-lg leading-relaxed" {...props} />,
                h3: ({ ...props }) => <h3 className="font-sans font-bold text-xl mt-6 mb-3 text-ink" {...props} />,
                strong: ({ ...props }) => <strong className="font-bold text-ink" {...props} />,
            }}
        >
            {html}
        </ReactMarkdown>
    </motion.div>
);

// ── Main View ────────────────────────────────────────────────────────────────
export const ChapterView: React.FC = () => {
    const { subjectId, chapterId } = useParams<{ subjectId: string; chapterId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectData | null>(null);
    const [chapter, setChapter] = useState<ChapterDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [activeTab, setActiveTab] = useState<'mindmap' | 'summary' | 'keywords'>('mindmap');
    const [selectedNode, setSelectedNode] = useState<NodeType | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Load subject, chapter, and conversation history
    useEffect(() => {
        if (!subjectId || !chapterId || !user) return;
        let mounted = true;
        const init = async () => {
            try {
                const [subj, chaps, history] = await Promise.all([
                    dbService.getSubject(subjectId),
                    dbService.getChaptersBySubject(subjectId),
                    dbService.getConversationHistory(user.email, subjectId, chapterId),
                ]);
                if (!mounted) return;
                if (!subj) { setLoadError('Subject not found.'); return; }
                const chap = chaps.find(c => c.chapterId === chapterId);
                if (!chap) { setLoadError('Chapter not found.'); return; }
                setSubject(subj);
                setChapter(chap);
                setChatHistory(history as ChatMessage[]);
                // Track last visited
                localStorage.setItem(`last_studied_${subjectId}`, new Date().toISOString());
            } catch (err: any) {
                if (mounted) setLoadError(err.message || 'Failed to load chapter.');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        init();
        return () => { mounted = false; };
    }, [subjectId, chapterId, user?.email]);

    // Auto-scroll to latest chat message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const handleNodeSelect = (node: NodeType) => {
        setSelectedNode(node);
        if (!input) setInput(`Explain "${node.title}" in the context of this chapter.`);
    };

    const handleSend = async (text: string = input) => {
        if (!text.trim() || !user || !subject || !chapter) return;
        const msgId = Date.now().toString();
        const userMsg: ChatMessage = { id: `${msgId}_u`, role: 'user', content: text, status: 'done', timestamp: Date.now() };
        setInput('');
        setChatHistory(prev => [...prev, userMsg, { id: `${msgId}_a`, role: 'assistant', content: '', status: 'typing', timestamp: Date.now() + 1 }]);

        // Track progress
        const qsCount = parseInt(localStorage.getItem(`qs_${chapterId}`) || '0', 10) + 1;
        localStorage.setItem(`qs_${chapterId}`, qsCount.toString());

        try {
            // Get PDF context from IndexedDB cache
            const relevantFiles: { fileName: string; fileBase64: string; totalPages: number }[] = [];
            const chapterNode = subject.structure?.children?.find(c => c.id === chapterId);
            if (chapterNode?.fileName) {
                const cachedPdf = await dbService.getPdfFromCache(chapterNode.fileName);
                if (cachedPdf) relevantFiles.push(cachedPdf);
            }

            const apiHistory: ConversationTurn[] = chatHistory
                .filter(h => h.status === 'done')
                .map(h => ({
                    query: h.role === 'user' ? h.content : '',
                    response: { answer: h.role === 'assistant' ? (h.parsed?.answer || h.content) : '', citations: [], images: [] }
                }))
                .filter(h => h.query || h.response.answer);

            const parsedRes = await analyzeFiles(
                text,
                relevantFiles,
                apiHistory,
                {
                    chapterTitle: chapter.chapterTitle,
                    chapterId: chapter.chapterId,
                    pageOffset: 0,
                    mindMap: chapter.mindMap
                }
            );

            const newHistory = [...chatHistory, userMsg, { id: `${msgId}_a`, role: 'assistant' as const, content: parsedRes.answer, parsed: parsedRes, status: 'done' as const, timestamp: Date.now() + 1 }];
            setChatHistory(newHistory);
            await dbService.saveConversationHistory(user.email, subjectId!, chapterId!, newHistory);

        } catch (err: any) {
            setChatHistory(prev => prev.map(m => m.id === `${msgId}_a` ? { ...m, content: err.message || 'Failed to generate response.', status: 'error' } : m));
        }
    };

    if (loading) return <LoadingSpinner fullScreen label="Preparing ALUCIDATE Tutor Engine..." />;
    if (loadError || !subject || !chapter) return (
        <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
            <p className="text-danger">{loadError || 'Chapter not found.'}</p>
            <button onClick={() => navigate(subjectId ? `/subject/${subjectId}` : '/dashboard')} className="text-brand underline text-sm">← Go back</button>
        </div>
    );

    return (
        <div className="h-[calc(100vh-56px)] w-full flex flex-col lg:flex-row overflow-hidden bg-void font-sans mt-14">
            {/* ── Left Panel ────────────────────────────────────────────── */}
            <div className="w-full lg:w-3/5 h-[45vh] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-surface shrink-0 lg:shrink">
                {/* Navbar */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur z-20 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate(`/subject/${subjectId}`)} className="p-1.5 rounded-lg hover:bg-raised text-ink-3 hover:text-ink transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <h1 className="font-bold text-base text-ink line-clamp-1">{chapter.chapterTitle}</h1>
                    </div>
                    <div className="flex bg-void rounded-lg p-1 border border-border shadow-sm">
                        {(['mindmap', 'summary', 'keywords'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-1 text-[11px] font-bold uppercase tracking-widest rounded-md transition-all ${activeTab === tab ? 'bg-brand text-white shadow-md' : 'text-ink-3 hover:text-ink-2 hover:bg-raised'}`}>
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative overflow-hidden bg-void">
                    <AnimatePresence mode="wait">
                        {activeTab === 'mindmap' ? (
                            chapter.mindMap ? (
                                <motion.div key="mindmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                                    <MindMap data={chapter.mindMap} onNodeSelect={handleNodeSelect} activeNodeId={selectedNode?.id || null} />
                                </motion.div>
                            ) : (
                                <motion.div key="nomindmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center text-ink-3 text-sm">
                                    Mind map not generated yet.
                                </motion.div>
                            )
                        ) : activeTab === 'summary' ? (
                            <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 max-w-3xl mx-auto h-full overflow-y-auto">
                                <h2 className="text-2xl font-bold font-[Instrument_Serif] mb-6 text-brand">Chapter Summary</h2>
                                <div className="prose prose-p:text-ink-2 prose-strong:text-ink prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{chapter.summary || 'Summary not available.'}</ReactMarkdown>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="keywords" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 h-full overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(chapter.keywords || []).map((kw, i) => (
                                        <div key={i} className="bg-surface border border-border p-4 rounded-xl hover:border-brand/40 transition-colors">
                                            <h4 className="font-bold text-brand mb-1">{kw.term}</h4>
                                            <p className="text-sm text-ink-2">{kw.definition}</p>
                                        </div>
                                    ))}
                                    {!chapter.keywords?.length && <div className="col-span-2 text-center py-10 text-ink-3">No keywords available.</div>}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Right Panel (Tutor Chat) ──────────────────────────────── */}
            <div className="w-full lg:w-2/5 flex-1 lg:h-full flex flex-col bg-void relative">
                {/* Chat Header */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-border shadow-sm bg-surface/90 backdrop-blur z-20 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-6 h-6 rounded-md bg-brand/10 border border-brand/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand glow-brand animate-pulse" />
                        </div>
                        <span className="font-bold text-sm text-ink tracking-tight uppercase">Tutor</span>
                    </div>
                    <span className="text-[10px] text-ink-3 font-mono font-bold uppercase tracking-widest border border-border px-2 py-0.5 rounded shadow-sm">GPT-4 Class</span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                    {chatHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                            <div className="w-16 h-16 rounded-2xl bg-surface border border-border/50 flex items-center justify-center mb-6 shadow-xl shadow-brand/5">
                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                            <h3 className="font-[Instrument_Serif] text-3xl text-ink mb-2 tracking-tight">Hello, {user.name.split(' ')[0]}</h3>
                            <p className="text-sm text-ink-3 mb-8">Concept mastery starts with a single question.</p>
                            <div className="w-full space-y-2 text-left">
                                {["Give me an overview of this chapter.", "Explain the most difficult concept simply.", "Generate a 3-question quiz."].map((p, i) => (
                                    <button key={i} onClick={() => handleSend(p)} className="w-full p-3.5 bg-surface border border-border rounded-xl text-xs font-medium text-ink-2 hover:border-brand/40 hover:shadow-[0_2px_12px_rgba(var(--color-brand),0.05)] transition-all flex items-center gap-3 group">
                                        <div className="w-6 h-6 rounded flex items-center justify-center bg-raised text-brand/50 group-hover:text-brand transition-colors">→</div>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : chatHistory.map(m => (
                        <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-3xl p-5 shadow-sm ${m.role === 'user' ? 'bg-brand text-white shadow-brand/10 rounded-br-sm' : 'bg-surface border border-border/60 text-ink rounded-bl-sm'}`}>
                                {m.role === 'user' ? (
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                ) : m.status === 'typing' ? (
                                    <div className="flex gap-1.5 items-center h-4">
                                        {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-brand/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                                    </div>
                                ) : m.status === 'error' ? (
                                    <p className="text-danger text-sm">{m.content}</p>
                                ) : (
                                    <TypewriterResponse html={m.parsed?.answer || m.content} />
                                )}
                                {m.role === 'assistant' && m.status === 'done' && (
                                    <div className="mt-3 pt-3 border-t border-border/50 flex justify-end">
                                        <button onClick={() => navigator.clipboard.writeText(m.parsed?.answer || m.content)} className="text-xs text-ink-3 hover:text-ink transition-colors px-2 py-1 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            Copy
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    <div ref={chatEndRef} className="h-4" />
                </div>

                {/* Input */}
                <div className="p-4 sm:p-6 bg-void shrink-0 pb-safe border-t border-border/30">
                    <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-end gap-3 bg-surface border border-border rounded-[24px] p-2 pl-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand transition-all relative">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder="Ask ALUCIDATE Tutor anything..."
                            className="flex-1 max-h-32 min-h-[44px] bg-transparent text-sm text-ink placeholder:text-ink-3 resize-none outline-none py-3"
                            rows={1}
                        />
                        <button type="submit" disabled={!input.trim()} className="absolute right-2 bottom-2 bg-brand hover:bg-brand-dim text-white disabled:bg-raised disabled:text-ink-3 disabled:border-border transition-all w-10 h-10 flex items-center justify-center shrink-0 rounded-full disabled:shadow-none shadow-brand/20">
                            <svg className="w-4 h-4 translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </button>
                    </form>
                    <p className="text-center text-[10px] text-ink-3 mt-3">Alucidate AI may produce inaccurate information about people, places, or facts.</p>
                </div>
            </div>
        </div>
    );
};

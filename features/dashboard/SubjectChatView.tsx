import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { SubjectData, FileContent, ConversationTurn, TutorResponse } from '@/types';
import { dbService } from '@/services/dbService';
import { analyzeFiles, identifyRelevantNodes } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useAuth } from '@/hooks/useAuth';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parsed?: TutorResponse;
    status: 'sending' | 'typing' | 'done' | 'error';
    timestamp: number;
}

const TypewriterResponse: React.FC<{ html: string }> = ({ html }) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed"
    >
        <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                p: ({ ...props }) => <p className="mb-4 font-[Instrument_Serif] text-lg leading-relaxed" {...props} />,
                h3: ({ ...props }) => <h3 className="font-sans font-bold text-xl mt-6 mb-3 text-ink" {...props} />,
            }}
        >
            {html}
        </ReactMarkdown>
    </motion.div>
);

export const SubjectChatView: React.FC = () => {
    const { subjectId } = useParams<{ subjectId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!subjectId || !user) return;
        const init = async () => {
            try {
                const [subj, history] = await Promise.all([
                    dbService.getSubject(subjectId),
                    dbService.getConversationHistory(user.email, subjectId, 'global'),
                ]);
                if (subj) setSubject(subj);
                setChatHistory(history as ChatMessage[]);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [subjectId, user?.email]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const handleSend = async (text: string = input) => {
        if (!text.trim() || !user || !subject) return;

        const msgId = Date.now().toString();
        const userMsg: ChatMessage = { id: `${msgId}_u`, role: 'user', content: text, status: 'done', timestamp: Date.now() };

        setInput('');
        setChatHistory(prev => [...prev, userMsg, { id: `${msgId}_a`, role: 'assistant', content: '', status: 'typing', timestamp: Date.now() + 1 }]);

        try {
            // 1. Identify relevant chapters/nodes across the entire subject structure
            const relevantNodeIds = await identifyRelevantNodes(text, subject.structure, 5);

            // 2. Map nodes to unique file names
            const uniqueFiles = new Set<string>();
            const findFilesForNodes = (node: any, targetIds: string[]) => {
                if (targetIds.includes(node.id) && node.fileName) uniqueFiles.add(node.fileName);
                node.children?.forEach((child: any) => findFilesForNodes(child, targetIds));
            };
            findFilesForNodes(subject.structure, relevantNodeIds);

            // 3. Fetch PDFs from IndexedDB
            const fileContents: FileContent[] = [];
            for (const fileName of Array.from(uniqueFiles)) {
                const cached = await dbService.getPdfFromCache(fileName);
                if (cached) fileContents.push(cached);
            }

            // Fallback: If no files found via reasoning, use the first file in structure as anchor
            if (fileContents.length === 0 && subject.structure.fileName) {
                const first = await dbService.getPdfFromCache(subject.structure.fileName);
                if (first) fileContents.push(first);
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
                fileContents,
                apiHistory,
                {
                    chapterTitle: `Global Subject: ${subject.subject}`,
                    chapterId: 'global',
                    pageOffset: 0,
                    mindMap: subject.structure
                }
            );

            const newHistory = [...chatHistory, userMsg, { id: `${msgId}_a`, role: 'assistant' as const, content: parsedRes.answer, parsed: parsedRes, status: 'done' as const, timestamp: Date.now() + 1 }];
            setChatHistory(newHistory);
            await dbService.saveConversationHistory(user.email, subjectId!, 'global', newHistory);

        } catch (err: any) {
            setChatHistory(prev => prev.map(m => m.id === `${msgId}_a` ? { ...m, content: err.message || 'Failed to sync with textbooks.', status: 'error' } : m));
        }
    };

    if (loading) return <LoadingSpinner fullScreen label="Warming up Subject Tutor..." />;
    if (!subject) return <div className="p-20 text-center">Subject not found.</div>;

    return (
        <div className="h-[calc(100vh-56px)] w-full flex flex-col bg-void font-sans overflow-hidden">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur z-20 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(`/subject/${subjectId}`)} className="p-1.5 rounded-lg hover:bg-raised text-ink-3 hover:text-ink transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div>
                        <h1 className="font-bold text-base text-ink line-clamp-1">{subject.subject} <span className="text-brand/60 ml-2">Global Tutor</span></h1>
                        <p className="text-[10px] text-ink-3 font-bold uppercase tracking-widest leading-none">Cross-Chapter Reasoning Enabled</p>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
                <div className="max-w-3xl mx-auto w-full">
                    {chatHistory.length === 0 ? (
                        <div className="py-20 text-center space-y-6">
                            <div className="w-20 h-20 bg-brand/10 border border-brand/20 rounded-3xl flex items-center justify-center text-3xl mx-auto shadow-sm">🌌</div>
                            <h2 className="text-3xl font-[Instrument_Serif] font-bold text-ink">Global Subject Intelligence</h2>
                            <p className="text-ink-2 max-w-sm mx-auto text-sm">Ask anything about {subject.subject}. I'll search across all chapters to provide a synthesized answer.</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mt-10">
                                {["Give me a high-level summary of the entire subject.", "How do the core concepts in the first and last chapters relate?", "What are the most recurring themes in this textbook?"].map((p, i) => (
                                    <button key={i} onClick={() => handleSend(p)} className="p-4 bg-surface border border-border rounded-2xl text-xs text-ink-2 hover:border-brand hover:text-brand transition-all flex items-center gap-3 group">
                                        <span className="text-brand/50 group-hover:text-brand">→</span>
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        chatHistory.map(m => (
                            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[90%] rounded-2xl p-5 ${m.role === 'user' ? 'bg-brand text-white' : 'bg-surface border border-border text-ink'}`}>
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
                                </div>
                            </motion.div>
                        ))
                    )}
                    <div ref={chatEndRef} className="h-20" />
                </div>
            </div>

            {/* Input */}
            <div className="p-6 bg-void border-t border-border/30">
                <div className="max-w-3xl mx-auto w-full">
                    <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex items-end gap-2 bg-surface border border-border rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-brand transition-all">
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            placeholder={`Ask Alucidate about ${subject.subject}...`}
                            className="flex-1 max-h-32 min-h-[44px] bg-transparent text-sm text-ink placeholder:text-ink-3 resize-none outline-none py-3 px-4"
                            rows={1}
                        />
                        <button type="submit" disabled={!input.trim()} className="bg-brand text-white hover:bg-brand-dim disabled:opacity-50 transition-all w-11 h-11 flex items-center justify-center shrink-0 rounded-xl">
                            <svg className="w-5 h-5 translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

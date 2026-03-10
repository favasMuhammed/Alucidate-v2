import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Maximize2, Zap, X, Check, Copy, Paperclip, ArrowUp, Loader2 } from 'lucide-react';
import { ConversationTurn, MindMapNode } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { AddNotesSheet } from '@/components/ui/AddNotesSheet';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parsed?: { answer: string; citations?: any[]; images?: any[]; };
    status: 'sending' | 'typing' | 'done' | 'error';
    timestamp: number;
}

interface TutorPanelProps {
    chatHistory: ChatMessage[];
    onSend: (text: string) => void;
    onExpandToggle: () => void;
    isExpanded: boolean;
    selectedNode: MindMapNode | null;
    onClearNode: () => void;
    subjectName: string;
    chapterName: string;
}

// ── Typing Greeting ──
const TypingGreeting: React.FC<{ text: string }> = ({ text }) => {
    const [displayed, setDisplayed] = useState('');
    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            setDisplayed(text.substring(0, i + 1));
            i++;
            if (i >= text.length) clearInterval(interval);
        }, 40);
        return () => clearInterval(interval);
    }, [text]);
    return <>{displayed}</>;
};

// ── AI Message Bubble ──
const AIMessage: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.parsed?.answer || message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="self-start max-w-full w-full bg-surface-2 border border-border border-l-[3px] border-l-purple rounded-[0_18px_18px_18px] p-4 sm:p-[18px] relative group"
        >
            <button
                onClick={handleCopy}
                className="absolute top-2.5 right-3 w-7 h-7 bg-raised-2 border border-border rounded-[var(--r-sm)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
            >
                {copied ? <Check className="w-[13px] h-[13px] text-success" /> : <Copy className="w-[13px] h-[13px] text-ink-3" />}
            </button>

            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:font-[Instrument_Serif] prose-p:text-[16px] prose-p:leading-[1.8] prose-p:text-ink-2 prose-strong:font-[Geist] prose-strong:font-bold prose-strong:text-ink prose-em:italic prose-a:text-brand">
                {message.status === 'typing' ? (
                    <div className="flex items-center gap-1.5 h-6 opacity-70">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" style={{ animationDelay: '200ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" style={{ animationDelay: '400ms' }} />
                    </div>
                ) : message.status === 'error' ? (
                    <p className="text-danger font-sans">{message.content}</p>
                ) : (
                    <>
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{message.parsed?.answer || message.content}</ReactMarkdown>
                        {/* Mock Streaming Cursor Logic (only show if actively streaming real-time, assuming 'done' turns off cursor) */}
                        {message.status === 'sending' && <span className="inline-block w-[2px] h-[1.1em] bg-brand ml-0.5 align-text-bottom animate-[cursor-blink_1s_step-end_infinite]" />}
                    </>
                )}
            </div>

            {/* Mock Citations if any */}
            {message.status === 'done' && message.parsed?.citations && message.parsed.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap gap-2 items-center">
                    <span className="font-mono text-[10px] text-ink-3 tracking-[0.08em]">SOURCES:</span>
                    {message.parsed.citations.map((cit, i) => (
                        <button key={i} className="flex items-center gap-1.5 bg-raised border border-border rounded-full px-2.5 py-1 hover:border-border-focus hover:text-ink-2 transition-colors cursor-pointer group/cit">
                            <span className="text-[11px] font-mono text-ink-3 group-hover/cit:text-ink-2 transition-colors">📄 {cit.title || 'Document'}</span>
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    );
};

export const TutorPanel: React.FC<TutorPanelProps> = ({ chatHistory, onSend, onExpandToggle, isExpanded, selectedNode, onClearNode, subjectName }) => {
    const { user } = useAuth();
    const [input, setInput] = useState('');
    const [isNotesOpen, setIsNotesOpen] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory, selectedNode]);

    const handleActionSend = (text: string) => {
        onSend(text);
        if (selectedNode) onClearNode();
    };

    const handleSaveNotes = (note: string, files: File[]) => {
        if (note.trim()) {
            handleActionSend(`[Note]: ${note}`);
        }
        if (files.length > 0) {
            handleActionSend(`[Attached ${files.length} file(s)]`);
        }
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-void relative overflow-hidden font-sans">
            {/* ── Header ── */}
            <div className="h-[48px] flex items-center justify-between px-4 border-b border-border shadow-sm shrink-0 bg-surface/90 backdrop-blur z-20">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand animate-pulse-glow" />
                    <span className="font-[Geist] font-bold text-[12px] tracking-[0.1em] text-ink-2 uppercase">TUTOR</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-ink-3 bg-raised-2 border border-border px-2.5 py-1 rounded-[var(--r-full)] tracking-wide">GEMINI CLASS</span>
                    <button onClick={onExpandToggle} className="text-ink-3 hover:text-ink transition-colors hidden lg:block">
                        <Maximize2 className="w-[15px] h-[15px]" />
                    </button>
                </div>
            </div>

            {/* ── Messages Area ── */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 relative scroll-smooth bg-void">
                {chatHistory.length === 0 ? (
                    <div className="min-h-full flex flex-col justify-center items-center py-10">
                        <Brain className="w-8 h-8 text-purple animate-float mb-6 drop-shadow-[0_0_12px_rgba(167,139,250,0.5)]" />
                        <h2 className="font-[Instrument_Serif] text-[24px] text-ink mb-2">
                            <TypingGreeting text={`Hello, ${user?.name?.split(' ')[0] || 'Student'}.`} />
                        </h2>
                        <p className="font-[Geist] font-normal text-[14px] text-ink-3 text-center mb-8 max-w-[280px]">
                            Ask me anything about {subjectName}.
                        </p>
                        <div className="flex flex-col gap-2 w-full max-w-[320px]">
                            {["Explain the key concept in detail", "What are the most important formulas?", "Generate a practice question"].map((prompt, i) => (
                                <motion.button
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i, ease: 'easeOut' }}
                                    onClick={() => handleActionSend(prompt)}
                                    className="w-full text-left bg-raised border border-border text-[13px] text-ink-2 rounded-[var(--r-md)] px-3.5 py-2.5 hover:border-border-focus hover:text-ink hover:bg-raised-2 transition-all transition-colors duration-200"
                                >
                                    {prompt}
                                </motion.button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="py-6 space-y-6 flex flex-col">
                        {chatHistory.map((msg, i) => (
                            msg.role === 'user' ? (
                                <motion.div key={msg.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }} className="self-end max-w-[85%] bg-brand text-white rounded-[18px_18px_4px_18px] px-4 py-2.5 shadow-[0_2px_8px_rgba(59,130,246,0.25)]">
                                    <p className="font-[Geist] font-normal text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                </motion.div>
                            ) : (
                                <AIMessage key={msg.id} message={msg} />
                            )
                        ))}
                    </div>
                )}
                <div ref={endRef} className="h-6" />
            </div>

            {/* ── Input Area ── */}
            <div className="shrink-0 p-4 sticky bottom-0 z-30" style={{ background: 'linear-gradient(to top, var(--void) 70%, transparent 100%)' }}>
                <div className="max-w-[800px] mx-auto relative flex flex-col">

                    {/* Suggestion Chip */}
                    <AnimatePresence>
                        {selectedNode && (
                            <motion.div
                                initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                className="absolute -top-10 left-0 bg-brand-glow border border-brand rounded-[var(--r-full)] px-3.5 py-1.5 flex items-center gap-2 shadow-sm"
                            >
                                <Zap className="w-3 h-3 text-brand" />
                                <button
                                    onClick={() => setInput(`Explain "${selectedNode.title}" in detail, referencing the textbook.`)}
                                    className="font-[Geist] font-medium text-[13px] text-brand hover:underline"
                                >
                                    Ask about: {selectedNode.title}
                                </button>
                                <button onClick={onClearNode} className="ml-1 text-ink-3 hover:text-ink transition-colors p-0.5"><X className="w-3 h-3" /></button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Input Container */}
                    <form
                        onSubmit={e => { e.preventDefault(); if (input.trim()) handleActionSend(input); setInput(''); }}
                        className="bg-surface-2 border border-border rounded-[24px] group focus-within:border-border-focus focus-within:shadow-[0_0_0_3px_var(--color-brand-glow)] transition-all duration-180 ease-out flex gap-2 w-full relative"
                    >
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) { handleActionSend(input); setInput(''); } } }}
                            placeholder="Ask ALUCIDATE Tutor anything..."
                            className="flex-1 min-h-[44px] max-h-[120px] bg-transparent resize-none border-none outline-none font-[Geist] font-normal text-[14px] text-ink placeholder:text-ink-3 py-3 pl-[16px] pr-[52px]"
                            rows={1}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="absolute right-2 bottom-2 w-9 h-9 rounded-full flex items-center justify-center transition-all bg-brand text-white shadow-[0_2px_12px_rgba(59,130,246,0.3)] hover:bg-brand-bright hover:scale-[1.04] disabled:bg-raised-2 disabled:text-ink-4 disabled:shadow-none disabled:hover:scale-100 disabled:cursor-not-allowed"
                        >
                            {/* Assuming if a message is 'typing', we show loading, but here we don't have global loading state. We can pass it as props later. */}
                            <ArrowUp className="w-4 h-4 translate-x-[0.5px] translate-y-[-0.5px]" strokeWidth={2.5} />
                        </button>
                    </form>

                    {/* Add Notes Button */}
                    <div className="mt-2 pl-2">
                        <button onClick={() => setIsNotesOpen(true)} className="flex items-center gap-1.5 font-[Geist] font-medium text-[12px] text-ink-3 hover:text-ink-2 group/notes transition-colors">
                            <Paperclip className="w-3 h-3 group-hover/notes:text-brand transition-colors" />
                            Add Notes
                        </button>
                    </div>

                </div>
            </div>

            <AddNotesSheet
                isOpen={isNotesOpen}
                onClose={() => setIsNotesOpen(false)}
                onSave={handleSaveNotes}
            />
        </div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, LayoutGrid, PanelRight, Map as MapIcon, FileText, Hash, MessageSquare } from 'lucide-react';
import { SubjectData, ChapterDetails, MindMapNode as NodeType, ConversationTurn } from '@/types';
import { dbService } from '@/services/dbService';
import { analyzeFiles } from '@/services/aiService';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// Extracted Components
import { MindMap } from '@/components/mindmap/MindMap';
import { SummaryView } from '@/components/chapter/SummaryView';
import { KeywordsView } from '@/components/chapter/KeywordsView';
import { TutorPanel } from '@/components/chat/TutorPanel';
import { useAuth } from '@/hooks/useAuth';

export const ChapterView: React.FC = () => {
    const { subjectId, chapterId } = useParams<{ subjectId: string; chapterId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [subject, setSubject] = useState<SubjectData | null>(null);
    const [chapter, setChapter] = useState<ChapterDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [chatHistory, setChatHistory] = useState<any[]>([]);

    // UI State
    const [activeTab, setActiveTab] = useState<'mindmap' | 'summary' | 'keywords'>('mindmap');
    const [selectedNode, setSelectedNode] = useState<NodeType | null>(null);
    const [chatOpen, setChatOpen] = useState(true);
    const [leftPanelWidth, setLeftPanelWidth] = useState(58); // %
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [mobileTab, setMobileTab] = useState<'mindmap' | 'summary' | 'keywords' | 'chat'>('mindmap');

    const isDragging = useRef(false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                setChatHistory(history || []);
                localStorage.setItem(`last_studied_${subjectId}`, new Date().toISOString());
            } catch (err: any) {
                if (mounted) setLoadError(err.message || 'Failed to load chapter.');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        init();
        return () => { mounted = false; };
    }, [subjectId, chapterId, user]);

    // Resizing Logic
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        requestAnimationFrame(() => {
            const newWidth = (e.clientX / window.innerWidth) * 100;
            if (newWidth >= 30 && newWidth <= 70) {
                setLeftPanelWidth(newWidth);
            }
        });
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleSendMsg = async (text: string) => {
        if (!text.trim() || !user || !subject || !chapter) return;
        const msgId = Date.now().toString();
        const userMsg = { id: `${msgId}_u`, role: 'user', content: text, status: 'done', timestamp: Date.now() };

        setChatHistory(prev => [...prev, userMsg, { id: `${msgId}_a`, role: 'assistant', content: '', status: 'sending', timestamp: Date.now() + 1 }]);

        const qsCount = parseInt(localStorage.getItem(`qs_${chapterId}`) || '0', 10) + 1;
        localStorage.setItem(`qs_${chapterId}`, qsCount.toString());

        try {
            const relevantFiles: any[] = [];
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

            const newHistory = [...chatHistory, userMsg, { id: `${msgId}_a`, role: 'assistant', content: parsedRes.answer, parsed: parsedRes, status: 'done', timestamp: Date.now() + 1 }];
            setChatHistory(newHistory);
            await dbService.saveConversationHistory(user.email, subjectId!, chapterId!, newHistory);
        } catch (err: any) {
            setChatHistory(prev => prev.map(m => m.id === `${msgId}_a` ? { ...m, content: err.message || 'Failed to generate response.', status: 'error' } : m));
        }
    };

    if (loading) return <LoadingSpinner fullScreen label="Preparing ALUCIDATE..." />;
    if (loadError || !subject || !chapter) return (
        <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
            <p className="text-danger">{loadError || 'Chapter not found.'}</p>
            <button onClick={() => navigate('/dashboard')} className="text-brand underline text-sm">← Back</button>
        </div>
    );

    // Mobile specific layout render mapping
    const MappedContent = () => {
        if (isMobile) {
            if (mobileTab === 'chat') {
                return (
                    <div className="h-full w-full pb-[56px] relative overflow-hidden bg-void">
                        <TutorPanel
                            chatHistory={chatHistory}
                            onSend={handleSendMsg}
                            onExpandToggle={() => { }}
                            isExpanded={true}
                            selectedNode={selectedNode}
                            onClearNode={() => setSelectedNode(null)}
                            subjectName={subject.subject}
                            chapterName={chapter.chapterTitle}
                        />
                    </div>
                );
            }
            if (mobileTab === 'mindmap') return <MindMap data={chapter.mindMap!} onNodeSelect={setSelectedNode} activeNodeId={selectedNode?.id || null} />;
            if (mobileTab === 'summary') return <SummaryView summary={chapter.summary} />;
            if (mobileTab === 'keywords') return <KeywordsView keywords={chapter.keywords} />;
        }

        return (
            <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
                    {activeTab === 'mindmap' && <MindMap data={chapter.mindMap!} onNodeSelect={setSelectedNode} activeNodeId={selectedNode?.id || null} />}
                    {activeTab === 'summary' && <SummaryView summary={chapter.summary} />}
                    {activeTab === 'keywords' && <KeywordsView keywords={chapter.keywords} />}
                </motion.div>
            </AnimatePresence>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-56px)] w-full bg-void font-sans overflow-hidden">

            {/* ── Chapter TopBar (Desktop mostly, mobile partially) ── */}
            <div className="sticky top-0 h-[52px] bg-surface/80 backdrop-blur-[20px] border-b border-border z-[90] flex items-center justify-between px-4 shrink-0 shadow-sm" style={{ WebkitBackdropFilter: 'blur(20px)' }}>
                {/* Left: Back & Title */}
                <div className="flex items-center gap-1 sm:gap-2 overflow-hidden flex-1 select-none">
                    <button onClick={() => navigate(`/subject/${subjectId}`)} className="p-1.5 rounded-lg hover:bg-raised text-ink-2 hover:text-ink transition-colors group">
                        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <h1 className="font-[Geist] font-bold text-[13px] sm:text-[14px] text-ink uppercase tracking-[0.06em] truncate max-w-[260px]">{chapter.chapterTitle}</h1>
                </div>

                {/* Center: Desktop Tabs */}
                {!isMobile && (
                    <div className="bg-raised rounded-[var(--r-lg)] p-[3px] flex gap-[2px] border border-border/50">
                        {(['mindmap', 'summary', 'keywords'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`relative px-3.5 py-1.5 font-[Geist] font-semibold text-[12px] tracking-[0.08em] uppercase rounded-[var(--r-md)] transition-colors duration-150 z-10 select-none ${activeTab === tab ? 'text-white' : 'text-ink-3 hover:text-ink-2'}`}
                            >
                                {activeTab === tab && (
                                    <motion.div
                                        layoutId="desktopActiveTab"
                                        className="absolute inset-0 bg-brand rounded-[var(--r-md)] shadow-[0_2px_8px_rgba(59,130,246,0.3)] -z-10"
                                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                    />
                                )}
                                {tab}
                            </button>
                        ))}
                    </div>
                )}

                {/* Right: Layout Toggles */}
                {!isMobile && (
                    <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-end pl-4">
                        <button className="p-2 rounded-lg text-ink-3 hover:bg-raised transition-colors">
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-border mx-1" />
                        <button
                            onClick={() => setChatOpen(!chatOpen)}
                            className={`p-2 rounded-lg transition-colors border shadow-sm ${chatOpen ? 'bg-surface border-brand/30 text-brand outline outline-1 outline-brand/10' : 'bg-surface border-border text-ink-3 hover:bg-raised hover:text-ink'}`}
                            title="Toggle Tutor Panel"
                        >
                            <PanelRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Main Layout ── */}
            <div className="flex flex-1 overflow-hidden relative w-full h-full">

                {/* Left Panel / Content Area */}
                <motion.div
                    animate={{ width: isMobile ? '100%' : (chatOpen ? `${leftPanelWidth}%` : '100%') }}
                    transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                    className="h-full relative overflow-hidden bg-void flex-shrink-0 z-10"
                >
                    <MappedContent />
                </motion.div>

                {/* Drag Handle */}
                {!isMobile && chatOpen && (
                    <div
                        onMouseDown={handleMouseDown}
                        className="w-1 h-full cursor-col-resize hover:bg-brand/50 transition-colors flex shrink-0 items-center justify-center relative z-20 group"
                    >
                        <div className="w-[1px] h-[20%] bg-brand/0 group-hover:bg-brand rounded-full transition-colors" />
                    </div>
                )}

                {/* Right Panel / Tutor Chat */}
                {!isMobile && (
                    <motion.div
                        initial={false}
                        animate={{
                            flex: chatOpen ? 1 : 0,
                            opacity: chatOpen ? 1 : 0
                        }}
                        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
                        className="h-full relative overflow-hidden bg-void border-l border-border z-10 flex flex-col min-w-0"
                    >
                        {chatOpen && (
                            <TutorPanel
                                chatHistory={chatHistory}
                                onSend={handleSendMsg}
                                onExpandToggle={() => setLeftPanelWidth(l => l <= 40 ? 58 : 30)}
                                isExpanded={leftPanelWidth <= 40}
                                selectedNode={selectedNode}
                                onClearNode={() => setSelectedNode(null)}
                                subjectName={subject.subject}
                                chapterName={chapter.chapterTitle}
                            />
                        )}
                    </motion.div>
                )}
            </div>

            {/* ── Mobile Bottom Navigation ── */}
            {isMobile && (
                <div className="fixed bottom-0 left-0 right-0 h-[56px] bg-surface/95 backdrop-blur-xl border-t border-border z-[100] flex justify-between items-center px-2 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.5)]">
                    {(['mindmap', 'summary', 'keywords', 'chat'] as const).map(tab => {
                        const Icon = tab === 'mindmap' ? MapIcon : tab === 'summary' ? FileText : tab === 'keywords' ? Hash : MessageSquare;
                        const isActive = mobileTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => setMobileTab(tab)}
                                className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 relative ${isActive ? 'text-brand' : 'text-ink-3'}`}
                            >
                                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                                <span className={`font-mono text-[10px] uppercase tracking-wider ${isActive ? 'font-bold' : 'font-medium'}`}>
                                    {tab === 'mindmap' ? 'Map' : tab}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

        </div>
    );
};

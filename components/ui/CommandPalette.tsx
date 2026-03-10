import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, Folder, Zap, Settings, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

const mockResults = [
    { id: '1', title: 'Calculus 101', type: 'Subject', icon: Folder, section: 'Recent Subjects' },
    { id: '2', title: 'Chapter 3: Derivatives', type: 'Chapter', icon: Folder, section: 'Recent Subjects' },
    { id: '3', title: 'Generate Practice Quiz', type: 'Action', icon: Zap, section: 'Actions' },
    { id: '4', title: 'Upload New Material', type: 'Action', icon: Zap, section: 'Actions' },
    { id: '5', title: 'Settings', type: 'System', icon: Settings, section: 'General' },
    { id: '6', title: 'Dashboard', type: 'Navigation', icon: ArrowRight, section: 'General' }
];

export const CommandPalette: React.FC = () => {
    const { isCommandPaletteOpen, setCommandPaletteOpen } = useAppStore();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Toggle logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCommandPaletteOpen(!isCommandPaletteOpen);
            }
            if (e.key === 'Escape' && isCommandPaletteOpen) {
                setCommandPaletteOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isCommandPaletteOpen, setCommandPaletteOpen]);

    useEffect(() => {
        if (isCommandPaletteOpen) {
            setQuery('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isCommandPaletteOpen]);

    const filtered = query
        ? mockResults.filter(r => r.title.toLowerCase().includes(query.toLowerCase()))
        : mockResults;

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const handleExecute = (id: string, type: string) => {
        setCommandPaletteOpen(false);
        if (type === 'Action') navigate('/dashboard');
        else if (type === 'Subject') navigate('/dashboard');
        else if (type === 'Navigation') navigate('/dashboard');
        else navigate('/dashboard'); // default
    };

    // Grouping
    const sections = Array.from(new Set(filtered.map(r => r.section)));

    return (
        <AnimatePresence>
            {isCommandPaletteOpen && (
                <div className="fixed inset-0 z-[110] font-sans flex items-start justify-center pt-[15vh] px-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-void/80 backdrop-blur-md"
                        onClick={() => setCommandPaletteOpen(false)}
                    />

                    {/* Palette */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -20, filter: 'blur(8px)' }}
                        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.98, y: -10, filter: 'blur(4px)' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                        className="relative w-full max-w-2xl bg-surface/90 backdrop-blur-xl border border-border shadow-[0_32px_80px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.1)] rounded-[20px] overflow-hidden flex flex-col"
                    >
                        {/* Input Area */}
                        <div className="flex items-center px-5 py-2 border-b border-border/60 bg-surface/50">
                            <Search className="w-5 h-5 text-ink-3 mr-3" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setActiveIndex(Math.min(filtered.length - 1, activeIndex + 1));
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setActiveIndex(Math.max(0, activeIndex - 1));
                                    } else if (e.key === 'Enter' && filtered.length > 0) {
                                        e.preventDefault();
                                        handleExecute(filtered[activeIndex].id, filtered[activeIndex].type);
                                    }
                                }}
                                className="flex-1 bg-transparent border-none outline-none py-4 font-[Geist] text-[18px] text-ink placeholder-ink-3 tracking-tight"
                                placeholder="What do you need?"
                            />
                            <kbd className="hidden sm:flex items-center justify-center h-6 px-2 border border-border/80 rounded-[var(--r-sm)] text-[10px] font-mono font-bold text-ink-3 uppercase bg-raised hover:text-ink transition-colors cursor-pointer shadow-sm">
                                ESC
                            </kbd>
                        </div>

                        {/* Results list */}
                        <div className="max-h-[50vh] overflow-y-auto p-3 scroll-smooth">
                            {filtered.length === 0 ? (
                                <div className="py-12 text-center flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-raised flex items-center justify-center text-ink-3">
                                        <Search className="w-5 h-5" />
                                    </div>
                                    <p className="font-[Geist] text-[14px] text-ink-3">No results found for "{query}"</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {sections.map(section => {
                                        const sectionItems = filtered.filter(f => f.section === section);
                                        return (
                                            <div key={section} className="flex flex-col gap-1">
                                                <div className="px-3 pb-2 pt-1 font-mono text-[10px] tracking-[0.1em] font-bold text-ink-4 uppercase">
                                                    {section}
                                                </div>
                                                {sectionItems.map(item => {
                                                    const globalIndex = filtered.findIndex(f => f.id === item.id);
                                                    const isActive = activeIndex === globalIndex;
                                                    const Icon = item.icon;
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => handleExecute(item.id, item.type)}
                                                            onMouseEnter={() => setActiveIndex(globalIndex)}
                                                            className={`w-full flex items-center justify-between p-3 rounded-[var(--r-md)] transition-all duration-75 group text-left ${isActive
                                                                    ? 'bg-brand text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]'
                                                                    : 'bg-transparent text-ink hover:bg-raised-2'
                                                                }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={`flex items-center justify-center w-8 h-8 rounded-[var(--r-sm)] transition-colors ${isActive ? 'bg-white/10' : 'bg-raised group-hover:bg-surface border border-border/50'}`}>
                                                                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-ink-2 group-hover:text-ink'}`} />
                                                                </div>
                                                                <span className={`font-[Geist] font-medium text-[14px] leading-tight ${isActive ? 'text-white' : 'text-ink'}`}>
                                                                    {item.title}
                                                                </span>
                                                            </div>
                                                            {isActive && (
                                                                <span className="text-white/60 flex items-center">
                                                                    <CornerDownLeft className="w-3.5 h-3.5" />
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

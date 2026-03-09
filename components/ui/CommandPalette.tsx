import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';

const mockResults = [
    { id: '1', title: 'Calculus 101', type: 'Subject', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { id: '2', title: 'Chapter 3: Derivatives', type: 'Chapter', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: '3', title: 'Upload new material', type: 'Action', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
    { id: '4', title: 'Settings', type: 'System', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
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
        if (type === 'Action') navigate('/admin');
        else if (type === 'Subject') navigate('/dashboard');
        else if (type === 'System') navigate('/dashboard'); // placeholder
    };

    return (
        <AnimatePresence>
            {isCommandPaletteOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-void/80 backdrop-blur-md z-[100]"
                        onClick={() => setCommandPaletteOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                        className="fixed top-[15vh] left-[50%] -translate-x-[50%] w-full max-w-2xl bg-surface border border-border shadow-[0_0_80px_rgba(59,130,246,0.1)] rounded-2xl overflow-hidden z-[101] flex flex-col"
                    >
                        <div className="flex items-center px-4 border-b border-border/50">
                            <svg className="w-5 h-5 text-ink-3 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
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
                                className="flex-1 bg-transparent border-none outline-none py-5 text-lg text-ink placeholder-ink-3 font-sans"
                                placeholder="Search Alucidate or type a command..."
                            />
                            <div className="flex items-center gap-1">
                                <kbd className="hidden sm:inline-block px-2 border border-border rounded-md text-xs font-sans text-ink-3 bg-raised">ESC</kbd>
                            </div>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
                            {filtered.length === 0 ? (
                                <div className="p-8 text-center text-ink-3 text-sm">No results found for "{query}"</div>
                            ) : (
                                filtered.map((item, index) => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleExecute(item.id, item.type)}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${activeIndex === index ? 'bg-brand text-white' : 'hover:bg-raised text-ink'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-5 h-5 ${activeIndex === index ? 'text-white' : 'text-ink-3'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                                            </svg>
                                            <span className="font-medium text-sm">{item.title}</span>
                                        </div>
                                        <span className={`text-xs uppercase tracking-wider font-bold ${activeIndex === index ? 'text-white/70' : 'text-ink-3'}`}>
                                            {item.type}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

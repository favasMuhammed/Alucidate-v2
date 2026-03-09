import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const AppShell: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();

    const handleLogoClick = () => {
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen flex flex-col bg-void text-ink font-sans selection:bg-brand/30 selection:text-white">
            {/* ── Topbar (56px fixed, backdrop-blur) ── */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-void/80 backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-border-subtle z-50 flex flex-col justify-center">
                <div className="w-full max-w-[1280px] mx-auto px-6 flex items-center justify-between">

                    {/* Logo & Breadcrumb */}
                    <div className="flex items-center gap-6">
                        <button
                            onClick={handleLogoClick}
                            className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
                        >
                            <span className="font-bold text-[18px] tracking-tight text-ink relative">
                                ALUCIDATE
                                {/* Tiny electric-blue glyph accent on the A */}
                                <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-brand glow-brand animate-pulse" />
                            </span>
                        </button>
                        <div className="hidden md:flex items-center gap-2 text-sm text-ink-2">
                            <span className="cursor-pointer hover:text-ink transition-colors">Dashboard</span>
                            {/* Add dynamic breadcrumbs later based on route matching */}
                        </div>
                    </div>

                    {/* Search & Profile */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}
                            className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-raised hover:bg-border/50 border border-border transition-colors text-ink-3 hover:text-ink text-sm group"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <span>Search / Cmd...</span>
                            <kbd className="hidden lg:inline-block px-1.5 py-0.5 rounded border border-border-subtle bg-void text-[10px] font-mono group-hover:border-border transition-colors">⌘K</kbd>
                        </button>

                        <div className="w-px h-5 bg-border mx-1" />
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-raised transition-colors group cursor-default">
                                <div className="w-7 h-7 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center text-xs font-bold text-brand">
                                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                                </div>
                                <span className="hidden md:block text-xs text-ink-2 max-w-[100px] truncate">{user?.name || user?.email}</span>
                            </div>
                            <button
                                onClick={logout}
                                title="Logout"
                                className="w-7 h-7 flex items-center justify-center rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── Main Content Area ── */}
            <main className="flex-1 w-full max-w-[1280px] mx-auto pt-14 flex flex-col min-w-0">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        variants={pageVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex-1 flex flex-col w-full h-full relative"
                    >
                        <Outlet />
                    </motion.div>
                </AnimatePresence>
            </main>

            <CommandPalette />
        </div>
    );
};

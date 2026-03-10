import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronLeft, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { hashStringToHue } from '@/utils';

export const TopBar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const setCommandPaletteOpen = useAppStore(s => s.setCommandPaletteOpen);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // generate breadcrumbs from pathname
    const paths = location.pathname.split('/').filter(Boolean);
    let breadcrumbs = ['Dashboard'];
    if (paths[0] === 'subject') breadcrumbs.push('Subject');
    if (paths[0] === 'admin') breadcrumbs = ['Dashboard', 'Admin'];

    return (
        <header className="fixed top-0 left-0 right-0 h-[56px] z-[100] w-full" style={{ background: 'rgba(5,5,8,0.75)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="h-full flex items-center px-6 gap-4">

                {/* Logo */}
                <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-glow" />
                    <span className="font-[Geist] font-bold text-[15px] tracking-[0.12em] text-ink uppercase group-hover:tracking-[0.15em] transition-all duration-200">Alucidate</span>
                </button>

                {/* Breadcrumbs */}
                <div className="hidden md:flex items-center ml-2 gap-2">
                    <AnimatePresence mode="popLayout">
                        {breadcrumbs.map((crumb, idx) => (
                            <React.Fragment key={crumb}>
                                {idx > 0 && <span className="text-ink-3 text-sm">/</span>}
                                <motion.span
                                    initial={{ x: 8, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -8, opacity: 0 }}
                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                    className={`text-[14px] ${idx === breadcrumbs.length - 1 ? 'font-medium text-ink' : 'text-ink-2'}`}
                                >
                                    {crumb}
                                </motion.span>
                            </React.Fragment>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="md:hidden flex items-center ml-2 text-ink-2">
                    {breadcrumbs.length > 1 && (
                        <button onClick={() => navigate(-1)} className="flex items-center gap-1">
                            <ChevronLeft className="w-4 h-4" />
                            <span className="font-medium text-[14px] text-ink">{breadcrumbs[breadcrumbs.length - 1]}</span>
                        </button>
                    )}
                </div>

                {/* Spacer */}
                <div className="ml-auto" />

                {/* Search Bar */}
                <button onClick={() => setCommandPaletteOpen(true)} className="flex items-center gap-2 bg-raised border border-border rounded-md px-3 h-8 group focus-within:border-border-focus focus-within:shadow-[0_0_0_3px_var(--color-brand-glow)] transition-all duration-200 ease-out w-[40px] md:w-[220px] overflow-hidden shrink-0">
                    <Search className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                    <span className="text-[13px] text-ink-3 hidden md:inline-block whitespace-nowrap">Search / Cmd...</span>
                    <kbd className="hidden md:inline-block ml-auto text-[10px] font-mono border border-border bg-surface px-1.5 rounded text-ink-3 group-hover:text-ink transition-colors">⌘K</kbd>
                </button>

                {/* Profile */}
                <div className="relative">
                    <button onClick={() => setDropdownOpen(!dropdownOpen)} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-semibold hover:shadow-[0_0_0_2px_var(--color-brand)] transition-shadow" style={{ background: `linear-gradient(135deg, hsl(${hashStringToHue(user?.email || 'A')}, 65%, 45%), hsl(${hashStringToHue(user?.email || 'A') + 30}, 60%, 35%))` }}>
                        {(user?.name || user?.email || 'U')[0].toUpperCase()}
                    </button>

                    <AnimatePresence>
                        {dropdownOpen && (
                            <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="absolute right-0 top-12 w-48 bg-raised border border-brand/20 rounded-xl shadow-2xl glass overflow-hidden flex flex-col p-1 z-[110]">
                                <div className="px-3 py-2 border-b border-border/50 mb-1">
                                    <p className="text-sm font-medium text-ink truncate">{user?.name || 'User'}</p>
                                    <p className="text-xs text-ink-3 truncate">{user?.email}</p>
                                </div>
                                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-ink-2 hover:text-ink hover:bg-surface rounded-md transition-colors text-left"><UserIcon className="w-3.5 h-3.5" /> Profile</button>
                                <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-ink-2 hover:text-ink hover:bg-surface rounded-md transition-colors text-left"><Settings className="w-3.5 h-3.5" /> Settings</button>
                                <button onClick={() => { setDropdownOpen(false); logout(); }} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-danger hover:bg-danger/10 rounded-md transition-colors text-left mt-1"><LogOut className="w-3.5 h-3.5" /> Sign Out</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>
        </header>
    );
};

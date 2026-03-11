import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/layout/TopBar';
const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as any } },
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
            <TopBar />

            {/* ── Main Content Area ── */}
            <main className="flex-1 w-full pt-[56px] flex flex-col min-w-0">
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

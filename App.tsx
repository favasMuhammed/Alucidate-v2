/**
 * App.tsx — Lean Application Router
 *
 * Handles:
 * - App-level state machine: loading → auth → admin | dashboard → chapter
 * - Session persistence via localStorage
 * - Pre-warm ping to wake up Render backend
 * - Delegates all UI to feature views
 */
import React, { useState, useCallback, useEffect } from 'react';
import { User, SubjectData, ChapterDetails } from './types';
import { dbService } from './services/dbService';
import { AuthView } from './features/auth/AuthView';
import { AdminView } from './features/admin/AdminView';
import { DashboardView, SubjectHomeView } from './features/dashboard/DashboardView';
import { ChapterView } from './features/chapter/ChapterView';
import { Spinner } from './components/ui/Spinner';

// ─── App State Machine ────────────────────────────────────────────────────────

type AppState = 'loading' | 'auth' | 'admin' | 'dashboard';

// Router: tracks which "page" the student is on within the dashboard flow
type DashboardState =
    | { view: 'subjects' }
    | { view: 'subject'; subject: SubjectData }
    | { view: 'chapter'; subject: SubjectData; chapter: ChapterDetails };

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
    const [appState, setAppState] = useState<AppState>('loading');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [dashboardState, setDashboardState] = useState<DashboardState>({ view: 'subjects' });

    // Pre-warm Render Free Tier backend on every app load
    useEffect(() => {
        const api = (import.meta as any).env.VITE_API_URL ?? 'http://localhost:3000';
        fetch(`${api}/health`).catch(() => { });
    }, []);

    // Check for existing session on mount
    const checkAuthStatus = useCallback(async () => {
        setAppState('loading');
        try {
            const email = localStorage.getItem('currentUserEmail');
            if (email) {
                const user = await dbService.getUser(email);
                if (user) {
                    setCurrentUser(user);
                    if (user.role === 'admin') {
                        setAppState('admin');
                    } else {
                        const has = await dbService.hasSubjects(user.className);
                        setAppState(has ? 'dashboard' : 'admin');
                    }
                    return;
                }
            }
        } catch {
            localStorage.removeItem('currentUserEmail');
        }
        setAppState('auth');
    }, []);

    useEffect(() => { checkAuthStatus(); }, [checkAuthStatus]);

    // ── Handlers ──

    const handleLogin = useCallback(async (user: User) => {
        localStorage.setItem('currentUserEmail', user.email);
        setCurrentUser(user);
        setDashboardState({ view: 'subjects' });
        if (user.role === 'admin') {
            setAppState('admin');
        } else {
            try {
                const has = await dbService.hasSubjects(user.className);
                setAppState(has ? 'dashboard' : 'admin');
            } catch {
                setAppState('admin');
            }
        }
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('currentUserEmail');
        setCurrentUser(null);
        setDashboardState({ view: 'subjects' });
        setAppState('auth');
    }, []);

    const handleCorpusUpdate = useCallback(() => {
        setDashboardState({ view: 'subjects' });
        setAppState('dashboard');
    }, []);

    // ── Routing ──

    if (appState === 'loading') {
        return <Spinner fullScreen label="Starting Alucidate..." />;
    }

    if (appState === 'auth') {
        return <AuthView onLogin={handleLogin} />;
    }

    if (appState === 'admin') {
        return (
            <AdminView
                user={currentUser!}
                onCorpusUpdate={handleCorpusUpdate}
                onLogout={handleLogout}
            />
        );
    }

    // ── Dashboard sub-router ──
    if (dashboardState.view === 'chapter' && currentUser) {
        return (
            <ChapterView
                user={currentUser}
                chapter={dashboardState.chapter}
                subject={dashboardState.subject}
                onBack={() => setDashboardState({ view: 'subject', subject: dashboardState.subject })}
                onBackToDashboard={() => setDashboardState({ view: 'subjects' })}
            />
        );
    }

    if (dashboardState.view === 'subject' && currentUser) {
        return (
            <SubjectHomeView
                user={currentUser}
                subject={dashboardState.subject}
                onBack={() => setDashboardState({ view: 'subjects' })}
                onSelectChapter={(chapter) =>
                    setDashboardState({ view: 'chapter', subject: dashboardState.subject, chapter })
                }
            />
        );
    }

    // Default: subject grid
    return (
        <DashboardView
            user={currentUser!}
            onLogout={handleLogout}
            onSwitchToAdmin={() => setAppState('admin')}
            onSelectSubject={(subject) => setDashboardState({ view: 'subject', subject })}
        />
    );
}

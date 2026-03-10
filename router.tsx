import React, { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { AuthView } from './features/auth/AuthView';
import { useAuth } from './hooks/useAuth';
import { LoadingSpinner } from './components/ui/LoadingSpinner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// ── Lazy loaded views ──────────────────────────────────────────────────────
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const AdminView = lazy(() => import('./features/admin/AdminView').then(m => ({ default: m.AdminView })));
const SubjectHomeView = lazy(() => import('./features/dashboard/SubjectHomeView').then(m => ({ default: m.SubjectHomeView })));
const SubjectChatView = lazy(() => import('./features/dashboard/SubjectChatView').then(m => ({ default: m.SubjectChatView })));
const ChapterView = lazy(() => import('./features/chapter/ChapterView').then(m => ({ default: m.ChapterView })));

// ── Loading Fallback ───────────────────────────────────────────────────────
const PageLoader = () => (
    <div className="flex-1 flex items-center justify-center h-full min-h-[60vh]">
        <LoadingSpinner label="Loading..." />
    </div>
);

// ── Auth Guard ─────────────────────────────────────────────────────────────
function AuthGuard({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
    const { user, loading } = useAuth();

    if (loading) return <PageLoader />;
    if (!user) return <Navigate to="/auth" replace />;
    if (adminOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
    return <ErrorBoundary>{children}</ErrorBoundary>;
}

// ── Router ─────────────────────────────────────────────────────────────────
export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />,
        children: [
            { index: true, element: <Navigate to="/dashboard" replace /> },
            {
                path: 'dashboard',
                element: (
                    <AuthGuard>
                        <React.Suspense fallback={<PageLoader />}>
                            <DashboardView />
                        </React.Suspense>
                    </AuthGuard>
                ),
            },
            {
                path: 'subject/:subjectId',
                children: [
                    {
                        index: true,
                        element: (
                            <AuthGuard>
                                <React.Suspense fallback={<PageLoader />}>
                                    <SubjectHomeView />
                                </React.Suspense>
                            </AuthGuard>
                        ),
                    },
                    {
                        path: 'chat',
                        element: (
                            <AuthGuard>
                                <React.Suspense fallback={<PageLoader />}>
                                    <SubjectChatView />
                                </React.Suspense>
                            </AuthGuard>
                        ),
                    },
                ],
            },
            {
                path: 'subject/:subjectId/chapter/:chapterId',
                element: (
                    <AuthGuard>
                        <React.Suspense fallback={<PageLoader />}>
                            <ChapterView />
                        </React.Suspense>
                    </AuthGuard>
                ),
            },
            {
                path: 'admin',
                element: (
                    <AuthGuard adminOnly>
                        <React.Suspense fallback={<PageLoader />}>
                            <AdminView />
                        </React.Suspense>
                    </AuthGuard>
                ),
            },
        ],
    },
    {
        path: '/auth',
        element: (
            <React.Suspense fallback={<div className="h-screen w-full bg-void flex items-center justify-center"><div className="animate-spin w-8 h-8 rounded-full border-t-2 border-brand" /></div>}>
                <AuthView onLogin={(user) => {
                    localStorage.setItem('currentUserEmail', user.email);
                    window.location.href = user.role === 'admin' ? '/admin' : '/dashboard';
                }} />
            </React.Suspense>
        ),
    },
]);

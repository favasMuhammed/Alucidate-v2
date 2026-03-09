import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { AuthView } from './features/auth/AuthView';

// Lazy load feature views to ensure FAANG-level code splitting
const lazyAdmin = () => import('./features/admin/AdminView');
const lazyDashboard = () => import('./features/dashboard/DashboardView');
const lazyChapter = () => import('./features/chapter/ChapterView');

// For now, placeholder components until we migrate the views
function Placeholder({ name }: { name: string }) {
    return <div className="p-8 text-ink">Mounting {name}...</div>;
}

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />,
        children: [
            { index: true, element: <Navigate to="/dashboard" replace /> },
            { path: 'dashboard', element: <Placeholder name="Dashboard" /> },
            { path: 'subject/:subjectId', element: <Placeholder name="Subject Home" /> },
            { path: 'subject/:subjectId/chapter/:chapterId', element: <Placeholder name="Chapter View" /> },
            { path: 'admin', element: <Placeholder name="Admin" /> },
        ],
    },
    {
        path: '/auth',
        element: (
            <React.Suspense fallback={<div className="h-screen w-full bg-void flex items-center justify-center text-ink"><div className="animate-spin w-8 h-8 rounded-full border-t-2 border-brand" /></div>}>
                <AuthView onLogin={(user) => {
                    localStorage.setItem('currentUserEmail', user.email);
                    window.location.href = user.role === 'admin' ? '/admin' : '/dashboard';
                }} />
            </React.Suspense>
        ),
    },
]);

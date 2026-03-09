import React, { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { dbService } from './services/dbService';
import { User } from './types';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

export default function App() {
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);

    // Pre-warm Render backend on initial app load
    useEffect(() => {
        const api = (import.meta as any).env.VITE_API_URL ?? 'http://localhost:3000';
        fetch(`${api}/health`).catch(() => { });
    }, []);

    // Check auth session
    useEffect(() => {
        const checkSession = async () => {
            try {
                const email = localStorage.getItem('currentUserEmail');
                if (email) {
                    const user = await dbService.getUser(email);
                    if (user) {
                        // In FAANG routing, auth check hydration happens on initial load
                        // If we have a user but are on root/auth, React Router loaders/hooks should handle redirection
                        // (We'll build a proper auth hook/guard in the next steps)
                    }
                }
            } catch (err) {
                console.warn("Auth check failed:", err);
            } finally {
                setIsCheckingAuth(false);
            }
        };
        checkSession();
    }, []);

    if (isCheckingAuth) return <LoadingSpinner fullScreen label="Waking secure servers..." />;

    return <RouterProvider router={router} />;
}

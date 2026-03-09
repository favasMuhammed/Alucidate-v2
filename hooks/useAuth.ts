import { useState, useEffect } from 'react';
import { User } from '@/types';
import { dbService } from '@/services/dbService';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const hydrate = async () => {
            try {
                const email = localStorage.getItem('currentUserEmail');
                if (email) {
                    const found = await dbService.getUser(email);
                    if (found) setUser(found);
                }
            } catch {
                // Session invalid
            } finally {
                setLoading(false);
            }
        };
        hydrate();
    }, []);

    const logout = () => {
        localStorage.removeItem('currentUserEmail');
        setUser(null);
        window.location.href = '/auth';
    };

    return { user, loading, logout };
}

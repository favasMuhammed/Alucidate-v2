const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

// Adds a timeout to any fetch. On timeout, throws a user-friendly message.
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error('Server took too long to respond. It may be waking up — please try again in 30 seconds.');
        }
        throw new Error('Network error. Please check your connection and try again.');
    } finally {
        clearTimeout(timer);
    }
}

export async function sendOTP(email: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${API_URL}/api/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send verification code.');
    return true;
}

export async function verifyOTP(email: string, code: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${API_URL}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to verify code.');
    return true;
}

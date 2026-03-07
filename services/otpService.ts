const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

export async function sendOTP(email: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/api/otp/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send OTP');
        }

        return true;
    } catch (error: any) {
        console.error('sendOTP Error:', error);
        throw error;
    }
}

export async function verifyOTP(email: string, code: string): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/api/otp/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, code }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to verify OTP');
        }

        return true;
    } catch (error: any) {
        console.error('verifyOTP Error:', error);
        throw error;
    }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security Headers (14 headers in one line) ---
app.use(helmet());

// --- CORS Whitelist ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (origin) console.log(`[CORS] Request from origin: ${origin}`);
        const isLocalDev = origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (!origin || allowedOrigins.includes(origin) || isLocalDev) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejection: Origin ${origin} not in whitelist: ${allowedOrigins.join(', ')}`);
            callback(new Error(`CORS policy: Origin ${origin} not allowed.`));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10kb' }));

// --- Rate Limiter: max 5 OTP sends per 15 minutes per IP ---
const otpSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many OTP requests from this IP. Please wait 15 minutes.' },
});

// --- Upstash Redis OTP Store (survives server restarts & cold starts) ---
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(command, ...args) {
    if (!REDIS_URL || !REDIS_TOKEN) {
        throw new Error('Upstash Redis credentials not configured.');
    }
    const response = await fetch(`${REDIS_URL}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await response.json();
    if (data.error) throw new Error(`Redis error: ${data.error}`);
    return data.result;
}

async function getOtp(email) {
    const raw = await redisCommand('GET', `otp:${email}`);
    return raw ? JSON.parse(raw) : null;
}

async function setOtp(email, data) {
    // Store with 10-minute TTL (Redis auto-deletes after expiry)
    await redisCommand('SET', `otp:${email}`, JSON.stringify(data), 'EX', '600');
}

async function deleteOtp(email) {
    await redisCommand('DEL', `otp:${email}`);
}

async function updateOtp(email, updates) {
    const existing = await getOtp(email);
    if (!existing) return;
    // Preserve remaining TTL by re-setting with 600s from now (worst case adds ~seconds)
    const ttlRaw = await redisCommand('TTL', `otp:${email}`);
    const ttl = ttlRaw > 0 ? ttlRaw : 300;
    await redisCommand('SET', `otp:${email}`, JSON.stringify({ ...existing, ...updates }), 'EX', String(ttl));
}

// --- Resend Email Function ---
async function sendEmail({ to, subject, html }) {
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured on the server.');
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: process.env.FROM_EMAIL || 'Alucidate <onboarding@resend.dev>',
            to,
            subject,
            html,
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Failed to send email via Resend.');
    }
    return data;
}

// --- Root Info ---
app.get('/', (req, res) => {
    res.send('Alucidate OTP Backend is active. Use /health for status.');
});

// --- Health Check ---
app.get('/health', async (req, res) => {
    let redisStatus = 'unconfigured';
    if (REDIS_URL && REDIS_TOKEN) {
        try {
            await redisCommand('PING');
            redisStatus = 'connected';
        } catch {
            redisStatus = 'error';
        }
    }
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        redis: redisStatus,
    });
});

// --- POST /api/otp/send ---
app.post('/api/otp/send', otpSendLimiter, async (req, res) => {
    try {
        const rawEmail = req.body?.email;
        if (!rawEmail || typeof rawEmail !== 'string') {
            return res.status(400).json({ error: 'A valid email address is required.' });
        }

        const email = rawEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        const now = Date.now();
        const existingOTP = await getOtp(email);

        // 30-second resend cooldown
        if (existingOTP && (now - existingOTP.lastSent) < 30 * 1000) {
            const waitSeconds = Math.ceil((30 * 1000 - (now - existingOTP.lastSent)) / 1000);
            return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another OTP.` });
        }

        // Generate cryptographically secure 6-digit OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();

        await setOtp(email, {
            code: otpCode,
            expiresAt: now + 5 * 60 * 1000,
            lastSent: now,
            failedAttempts: 0,
            lockedUntil: null,
        });

        // OTP should NOT be logged in production for security
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEV] OTP for ${email}: ${otpCode}`);
        }

        const emailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #0d1117; border: 1px solid #1e2a42; border-radius: 12px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1a2744 0%, #0d1117 100%); padding: 32px 40px; border-bottom: 1px solid #1e2a42;">
                    <h1 style="margin: 0; font-size: 22px; color: #e2e8f0; font-weight: 600; letter-spacing: -0.02em;">AI<span style="font-weight: 300;">ucidate</span></h1>
                </div>
                <div style="padding: 40px;">
                    <p style="margin: 0 0 24px; color: #94a3b8; font-size: 15px; line-height: 1.6;">Here is your secure sign-in code:</p>
                    <div style="background: #1a2744; border: 1px solid #2d4a8a; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 28px;">
                        <span style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #60a5fa; font-family: 'Courier New', monospace;">${otpCode}</span>
                    </div>
                    <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.6;">This code expires in <strong style="color: #94a3b8;">5 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
                </div>
            </div>
        `;

        await sendEmail({
            to: email,
            subject: 'Your Alucidate Verification Code',
            html: emailHtml,
        });

        res.json({ success: true, message: 'Verification code sent.' });
    } catch (error) {
        console.error('Send OTP Error:', error?.message || error);
        res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }
});

// --- POST /api/otp/verify ---
app.post('/api/otp/verify', async (req, res) => {
    try {
        const rawEmail = req.body?.email;
        const code = req.body?.code;

        if (!rawEmail || !code) {
            return res.status(400).json({ error: 'Email and code are required.' });
        }

        const email = rawEmail.trim().toLowerCase();
        const storedData = await getOtp(email);

        if (!storedData) {
            return res.status(400).json({ error: 'No active verification code for this email. Please request a new one.' });
        }

        // Check brute-force lockout
        if (storedData.lockedUntil && Date.now() < storedData.lockedUntil) {
            const waitMinutes = Math.ceil((storedData.lockedUntil - Date.now()) / 60000);
            return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMinutes} minute(s).` });
        }

        if (Date.now() > storedData.expiresAt) {
            await deleteOtp(email);
            return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
        }

        if (storedData.code !== String(code).trim()) {
            const failedAttempts = (storedData.failedAttempts || 0) + 1;

            // Lock out after 5 failed attempts for 5 minutes
            if (failedAttempts >= 5) {
                await updateOtp(email, { failedAttempts, lockedUntil: Date.now() + 5 * 60 * 1000 });
                return res.status(429).json({ error: 'Too many failed attempts. This code is locked for 5 minutes.' });
            }

            await updateOtp(email, { failedAttempts });
            const remaining = 5 - failedAttempts;
            return res.status(400).json({ error: `Invalid code. ${remaining} attempt(s) remaining.` });
        }

        // ✅ Verified — delete from Redis so it cannot be reused
        await deleteOtp(email);
        res.json({ success: true, message: 'Verification successful.' });
    } catch (error) {
        console.error('Verify OTP Error:', error?.message || error);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Alucidate OTP Server running on port ${PORT}`);
});

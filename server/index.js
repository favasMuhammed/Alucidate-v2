import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.ALLOWED_ORIGINS || 'http://localhost:5173' }));
app.use(express.json());

// In-memory OTP store map: email -> { code, expiresAt, lastSent }
const otpStore = new Map();

// Zoho SMTP Transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 587, // STARTTLS
    secure: false,
    auth: {
        user: process.env.ZOHO_EMAIL,
        pass: process.env.ZOHO_APP_PASSWORD,
    },
});

// Clean up expired OTPs periodically (every 5 mins)
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (now > data.expiresAt) {
            otpStore.delete(email);
        }
    }
}, 5 * 60 * 1000);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'OTP Server running' });
});

app.post('/api/otp/send', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ error: 'Valid email is required.' });
        }

        const now = Date.now();
        const existingOTP = otpStore.get(email);

        // Optional: 30-second cooldown on resending
        if (existingOTP && (now - existingOTP.lastSent) < 30 * 1000) {
            return res.status(429).json({ error: 'Please wait before requesting another OTP.' });
        }

        // Generate 6-digit numeric OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();

        // Save to store (expires in 5 minutes)
        otpStore.set(email, {
            code: otpCode,
            expiresAt: now + 5 * 60 * 1000,
            lastSent: now
        });

        // Send email
        const mailOptions = {
            from: `"Alucidate App" <${process.env.ZOHO_EMAIL}>`,
            to: email,
            subject: 'Your Alucidate Login Verification Code',
            text: `Your login verification code is: ${otpCode}\n\nThis code will expire in 5 minutes. Do not share this code with anyone.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #1e3a8a;">Alucidate Login Verification</h2>
                    <p style="color: #334155; font-size: 16px;">Here is your secure verification code:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0f172a;">${otpCode}</span>
                    </div>
                    <p style="color: #64748b; font-size: 14px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'OTP sent to email.' });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ error: 'Failed to send OTP email. Please try again later.' });
    }
});

app.post('/api/otp/verify', (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
        return res.status(400).json({ error: 'No OTP found for this email, or it has expired.' });
    }

    if (Date.now() > storedData.expiresAt) {
        otpStore.delete(email);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (storedData.code !== code) {
        return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    // Success! Clear the OTP so it can't be reused immediately
    otpStore.delete(email);
    res.json({ success: true, message: 'OTP verified successfully.' });
});

app.listen(PORT, () => {
    console.log(`OTP Express Server running on port ${PORT}`);
});

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 587,
    secure: false, // TLS requires secure: false for port 587
    requireTLS: true,
    auth: {
        user: 'info@nayrix.com',
        pass: 'tish5HJvhzwh'
    },
    logger: true,
    debug: true
});

console.log('Verifying connection...');
transporter.verify(function (error, success) {
    if (error) {
        console.log('Verification Error:', error);
    } else {
        console.log('Server is ready to take our messages');
    }
    process.exit(0);
});

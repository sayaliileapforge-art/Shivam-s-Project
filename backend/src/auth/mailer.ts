import nodemailer from 'nodemailer';

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordOtp(email: string, otp: string): Promise<{ delivered: boolean; debugOtp?: string }> {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
    }
    console.warn(`[DEV OTP] Email: ${email}, OTP: ${otp}`);
    return { delivered: false, debugOtp: otp };
  }

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();

  if (!from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP_FROM or SMTP_USER must be set for sending OTP emails.');
    }
    console.warn(`[DEV OTP] Email: ${email}, OTP: ${otp}`);
    return { delivered: false, debugOtp: otp };
  }

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Your OTP for password reset',
    text: `Your OTP is ${otp}. It will expire soon.`,
    html: `<p>Your OTP is <strong>${otp}</strong>.</p><p>This OTP will expire in a few minutes.</p>`,
  });

  return { delivered: true };
}

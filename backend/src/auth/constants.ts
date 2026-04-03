export const MOBILE_REGEX = /^[6-9]\d{9}$/;
export const OTP_DIGITS = 6;
export const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

import { MOBILE_REGEX } from './constants';

export function isValidEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isValidMobile(mobile: string): boolean {
  return MOBILE_REGEX.test(mobile.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeMobile(mobile: string): string {
  return mobile.trim();
}

import { MOBILE_REGEX, SCHOOL_CODE_REGEX, VENDOR_ROLES } from './constants';

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

export function normalizeSchoolCode(schoolCode: string): string {
  return schoolCode.trim().toUpperCase();
}

export function isValidSchoolCode(schoolCode: string): boolean {
  return SCHOOL_CODE_REGEX.test(normalizeSchoolCode(schoolCode));
}

export function isVendorRole(role: string): boolean {
  return VENDOR_ROLES.includes(role);
}

const MOBILE_REGEX = /^[6-9]\d{9}$/;

const rawBase = (((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)
  || ((import.meta as any).env?.VITE_API_URL as string | undefined)
  || '').trim();
const API_BASE = rawBase
  ? rawBase.replace(/\/$/, '').endsWith('/api')
    ? rawBase.replace(/\/$/, '')
    : `${rawBase.replace(/\/$/, '')}/api`
  : '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const AUTH_TOKEN_KEY = 'auth-token';

export interface AuthUserDto {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUserDto;
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  return token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : {
        'Content-Type': 'application/json',
      };
}

export function isValidMobile(value: string): boolean {
  return MOBILE_REGEX.test(value.trim());
}

export async function signup(payload: { name: string; email: string; mobile: string; password: string }) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<AuthUserDto>;
  if (!res.ok || !result.success) {
    throw new Error(result.error || result.message || 'Signup failed');
  }

  return result.data as AuthUserDto;
}

export async function login(payload: { identifier: string; password: string }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<LoginResponse>;
  if (!res.ok || !result.success || !result.data) {
    throw new Error(result.error || result.message || 'Login failed');
  }

  return result.data;
}

export async function forgotPassword(payload: { email: string }) {
  const res = await fetch(`${API_BASE}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<null>;
  if (!res.ok || !result.success) {
    throw new Error(result.error || result.message || 'Failed to send OTP');
  }

  return result.message || 'OTP sent to your email';
}

export async function fetchProfile() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  const result = await res.json() as ApiResponse<AuthUserDto>;
  if (!res.ok || !result.success || !result.data) {
    throw new Error(result.error || result.message || 'Failed to fetch profile');
  }

  return result.data;
}

export async function updateProfile(payload: { name: string; firmName?: string; profileImage?: string }) {
  const res = await fetch(`${API_BASE}/auth/profile`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<AuthUserDto>;
  if (!res.ok || !result.success || !result.data) {
    throw new Error(result.error || result.message || 'Failed to update profile');
  }

  return result.data;
}

export async function sendOtp(payload: { email: string }) {
  const res = await fetch(`${API_BASE}/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<{ debugOtp?: string }>;
  if (!res.ok || !result.success) {
    throw new Error(result.error || result.message || 'Failed to send OTP');
  }

  return {
    message: result.message || 'OTP sent',
    debugOtp: result.data?.debugOtp,
  };
}

export async function verifyOtp(payload: { email: string; otp: string }) {
  const res = await fetch(`${API_BASE}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<null>;
  if (!res.ok || !result.success) {
    throw new Error(result.error || result.message || 'Failed to verify OTP');
  }

  return result.message || 'OTP verified';
}

export async function changePassword(payload: { email: string; otp: string; newPassword: string }) {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await res.json() as ApiResponse<null>;
  if (!res.ok || !result.success) {
    throw new Error(result.error || result.message || 'Failed to change password');
  }

  return result.message || 'Password changed successfully';
}

import bcrypt from 'bcrypt';


import jwt from 'jsonwebtoken';
import { PoolClient } from 'pg';
import { BCRYPT_ROUNDS, OTP_DIGITS, OTP_EXPIRY_MINUTES } from './constants';
import { getAuthPool, hasPostgresConfig, withAuthClient } from '../config/postgres';
import { isValidEmail, isValidMobile, normalizeEmail, normalizeMobile } from './validators';
import { sendPasswordOtp } from './mailer';
import AuthUserModel from '../models/AuthUser';
import AuthPasswordResetModel from '../models/AuthPasswordReset';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: 'sub_vendor' | string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: string | null;
}

interface DbAuthUser {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: string | null;
  password_hash: string;
}

interface MongoAuthUser {
  mongoId: string;
  id: number;
  name: string;
  email: string;
  mobile: string;
  role: string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: string | null;
  passwordHash: string;
}

interface RawMongoAuthUser {
  _id: unknown;
  name?: unknown;
  schoolName?: unknown;
  contactName?: unknown;
  email?: unknown;
  mobile?: unknown;
  phone?: unknown;
  role?: unknown;
  firmName?: unknown;
  profileImage?: unknown;
  lastLoginAt?: unknown;
  passwordHash?: unknown;
  password?: unknown;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapMongoAuthUser(raw: RawMongoAuthUser | null): MongoAuthUser | null {
  if (!raw?._id) return null;

  const mongoId = String(raw._id);
  const name = readString(raw.name) || readString(raw.schoolName) || readString(raw.contactName) || 'User';
  const email = normalizeEmail(readString(raw.email));
  const mobile = normalizeMobile(readString(raw.mobile) || readString(raw.phone));
  const passwordHash = readString(raw.passwordHash) || readString(raw.password);

  if (!passwordHash) {
    return null;
  }

  return {
    mongoId,
    id: mongoObjectIdToNumeric(mongoId),
    name,
    email,
    mobile,
    role: readString(raw.role) || 'sub_vendor',
    firmName: readString(raw.firmName),
    profileImage: readString(raw.profileImage),
    lastLoginAt: readIsoDate(raw.lastLoginAt),
    passwordHash,
  };
}

function randomOtp(): string {
  const min = Math.pow(10, OTP_DIGITS - 1);
  const max = Math.pow(10, OTP_DIGITS) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

function mongoObjectIdToNumeric(mongoId: string): number {
  return Number(String(mongoId).replace(/[^0-9]/g, '').slice(0, 12) || 0);
}

function signToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN?.trim() || '7d';
  return jwt.sign(
    { sub: String(user.id), email: user.email, mobile: user.mobile, role: user.role },
    secret,
    { expiresIn } as jwt.SignOptions,
  );
}

function toAuthUser(input: {
  id: number;
  name: string;
  email: string;
  mobile: string;
  role?: string;
  firmName?: string;
  profileImage?: string;
  lastLoginAt?: string | null;
}): AuthUser {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    role: input.role || 'sub_vendor',
    firmName: input.firmName || '',
    profileImage: input.profileImage || '',
    lastLoginAt: input.lastLoginAt || null,
  };
}

async function findUserByEmailOrMobile(client: PoolClient, identifier: string): Promise<DbAuthUser | null> {
  const result = await client.query<DbAuthUser>(
    `SELECT
      id,
      name,
      email,
      mobile,
      role,
      firm_name AS "firmName",
      profile_image AS "profileImage",
      last_login_at AS "lastLoginAt",
      password_hash
     FROM auth_users
     WHERE email = $1 OR mobile = $1
     LIMIT 1`,
    [identifier],
  );
  return result.rows[0] || null;
}

async function findMongoUserByEmailOrMobile(identifier: string): Promise<MongoAuthUser | null> {
  const normalized = identifier.includes('@') ? normalizeEmail(identifier) : normalizeMobile(identifier);

  const queryOr: Array<Record<string, unknown>> = [
    { email: normalized },
    { mobile: normalized },
    { phone: normalized },
  ];

  if (normalized.includes('@')) {
    queryOr.push({ email: { $regex: `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  }

  const rawAuthUser = await AuthUserModel.collection.findOne({ $or: queryOr }) as RawMongoAuthUser | null;
  const mappedAuthUser = mapMongoAuthUser(rawAuthUser);
  if (mappedAuthUser) {
    return mappedAuthUser;
  }

  // Legacy mobile-app auth data can live in `users` with `phone` + `password`.
  const rawLegacyUser = await AuthUserModel.db.collection('users').findOne({ $or: queryOr }) as RawMongoAuthUser | null;
  return mapMongoAuthUser(rawLegacyUser);
}

export async function signup(payload: { name: string; email: string; mobile: string; password: string }) {
  const name = payload.name?.trim();
  const email = normalizeEmail(payload.email || '');
  const mobile = normalizeMobile(payload.mobile || '');
  const password = payload.password || '';

  if (!name || !email || !mobile || !password) {
    return { status: 400, body: { success: false, error: 'All fields are required' } };
  }
  if (!isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }
  if (!isValidMobile(mobile)) {
    return { status: 400, body: { success: false, error: 'Invalid mobile number' } };
  }

  if (!hasPostgresConfig()) {
    const emailExists = await AuthUserModel.exists({ email });
    if (emailExists) {
      return { status: 409, body: { success: false, error: 'Email already registered' } };
    }

    const mobileExists = await AuthUserModel.exists({ mobile });
    if (mobileExists) {
      return { status: 409, body: { success: false, error: 'Mobile number already registered' } };
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const created = await AuthUserModel.create({
      name,
      email,
      mobile,
      role: 'sub_vendor',
      passwordHash,
    });

    const user = toAuthUser({
      id: mongoObjectIdToNumeric(String(created._id)),
      name: created.name,
      email: created.email,
      mobile: created.mobile,
      role: created.role,
      firmName: created.firmName,
      profileImage: created.profileImage,
      lastLoginAt: created.lastLoginAt ? new Date(created.lastLoginAt).toISOString() : null,
    });

    return { status: 201, body: { success: true, data: user } };
  }

  return withAuthClient(async (client) => {
    const emailCheck = await client.query('SELECT 1 FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    if (emailCheck.rowCount) {
      return { status: 409, body: { success: false, error: 'Email already registered' } };
    }

    const mobileCheck = await client.query('SELECT 1 FROM auth_users WHERE mobile = $1 LIMIT 1', [mobile]);
    if (mobileCheck.rowCount) {
      return { status: 409, body: { success: false, error: 'Mobile number already registered' } };
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const inserted = await client.query<AuthUser>(
      `INSERT INTO auth_users (name, email, mobile, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
        id,
        name,
        email,
        mobile,
        role,
        firm_name AS "firmName",
        profile_image AS "profileImage",
        last_login_at AS "lastLoginAt"`,
      [name, email, mobile, 'sub_vendor', passwordHash],
    );

    return { status: 201, body: { success: true, data: inserted.rows[0] } };
  });
}

export async function login(payload: { identifier: string; password: string }) {
  const identifierRaw = payload.identifier?.trim() || '';
  const password = payload.password || '';

  if (!identifierRaw || !password) {
    return { status: 400, body: { success: false, error: 'Identifier and password are required' } };
  }

  const useEmail = identifierRaw.includes('@');
  const identifier = useEmail ? normalizeEmail(identifierRaw) : normalizeMobile(identifierRaw);

  if (useEmail) {
    if (!isValidEmail(identifier)) {
      return { status: 400, body: { success: false, error: 'Invalid email format' } };
    }
  } else if (!isValidMobile(identifier)) {
    return { status: 400, body: { success: false, error: 'Invalid mobile number' } };
  }

  if (!hasPostgresConfig()) {
    const user = await findMongoUserByEmailOrMobile(identifier);
    if (!user) {
      return { status: 401, body: { success: false, error: 'Invalid credentials' } };
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return { status: 401, body: { success: false, error: 'Invalid credentials' } };
    }

    const now = new Date();
    await AuthUserModel.updateOne({ _id: user.mongoId }, { $set: { lastLoginAt: now } });

    const userPayload = toAuthUser({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      firmName: user.firmName,
      profileImage: user.profileImage,
      lastLoginAt: now.toISOString(),
    });

    const token = signToken(userPayload);

    return {
      status: 200,
      body: {
        success: true,
        data: {
          token,
          user: userPayload,
        },
      },
    };
  }

  return withAuthClient(async (client) => {
    const user = await findUserByEmailOrMobile(client, identifier);
    if (!user) {
      return { status: 401, body: { success: false, error: 'Invalid credentials' } };
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return { status: 401, body: { success: false, error: 'Invalid credentials' } };
    }

    const now = new Date();
    await client.query('UPDATE auth_users SET last_login_at = $1, updated_at = NOW() WHERE id = $2', [now, user.id]);

    const userPayload = toAuthUser({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      firmName: user.firmName,
      profileImage: user.profileImage,
      lastLoginAt: now.toISOString(),
    });

    const token = signToken(userPayload);

    return {
      status: 200,
      body: {
        success: true,
        data: {
          token,
          user: userPayload,
        },
      },
    };
  });
}

export async function getProfileByEmail(emailInput: string) {
  const email = normalizeEmail(emailInput || '');
  if (!isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }

  if (!hasPostgresConfig()) {
    const user = await AuthUserModel.findOne({ email }).lean();
    if (!user) {
      return { status: 404, body: { success: false, error: 'User not found' } };
    }

    const profile = toAuthUser({
      id: mongoObjectIdToNumeric(String(user._id)),
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      firmName: user.firmName,
      profileImage: user.profileImage,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
    });

    return { status: 200, body: { success: true, data: profile } };
  }

  return withAuthClient(async (client) => {
    const result = await client.query<AuthUser>(
      `SELECT
        id,
        name,
        email,
        mobile,
        role,
        firm_name AS "firmName",
        profile_image AS "profileImage",
        last_login_at AS "lastLoginAt"
       FROM auth_users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );

    if (!result.rowCount) {
      return { status: 404, body: { success: false, error: 'User not found' } };
    }

    return { status: 200, body: { success: true, data: result.rows[0] } };
  });
}

export async function updateProfileByEmail(payload: { email: string; name: string; firmName?: string; profileImage?: string }) {
  const email = normalizeEmail(payload.email || '');
  const name = (payload.name || '').trim();
  const firmName = (payload.firmName || '').trim();
  const profileImage = (payload.profileImage || '').trim();

  if (!isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }
  if (!name) {
    return { status: 400, body: { success: false, error: 'Name is required' } };
  }

  if (!hasPostgresConfig()) {
    const updated = await AuthUserModel.findOneAndUpdate(
      { email },
      { $set: { name, firmName, profileImage, updatedAt: new Date() } },
      { new: true },
    ).lean();

    if (!updated) {
      return { status: 404, body: { success: false, error: 'User not found' } };
    }

    const profile = toAuthUser({
      id: mongoObjectIdToNumeric(String(updated._id)),
      name: updated.name,
      email: updated.email,
      mobile: updated.mobile,
      role: updated.role,
      firmName: updated.firmName,
      profileImage: updated.profileImage,
      lastLoginAt: updated.lastLoginAt ? new Date(updated.lastLoginAt).toISOString() : null,
    });

    return { status: 200, body: { success: true, data: profile, message: 'Profile updated successfully' } };
  }

  return withAuthClient(async (client) => {
    const updated = await client.query<AuthUser>(
      `UPDATE auth_users
       SET name = $1,
           firm_name = $2,
           profile_image = $3,
           updated_at = NOW()
       WHERE email = $4
       RETURNING
         id,
         name,
         email,
         mobile,
         role,
         firm_name AS "firmName",
         profile_image AS "profileImage",
         last_login_at AS "lastLoginAt"`,
      [name, firmName, profileImage, email],
    );

    if (!updated.rowCount) {
      return { status: 404, body: { success: false, error: 'User not found' } };
    }

    return { status: 200, body: { success: true, data: updated.rows[0], message: 'Profile updated successfully' } };
  });
}

export async function sendOtp(payload: { email: string }) {
  const email = normalizeEmail(payload.email || '');
  if (!email || !isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }

  const otp = randomOtp();
  const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  if (!hasPostgresConfig()) {
    const user = await AuthUserModel.findOne({ email }).lean();
    if (!user) {
      return { status: 404, body: { success: false, error: 'Email not found' } };
    }

    await AuthPasswordResetModel.updateMany({ email, isUsed: false }, { $set: { isUsed: true } });
    await AuthPasswordResetModel.create({
      email,
      otpHash,
      expiresAt,
      isVerified: false,
      isUsed: false,
    });

    const delivery = await sendPasswordOtp(email, otp);
    return {
      status: 200,
      body: {
        success: true,
        message: delivery.delivered ? 'OTP sent to your email' : 'OTP generated in development mode',
        ...(delivery.debugOtp ? { data: { debugOtp: delivery.debugOtp } } : {}),
      },
    };
  }

  return withAuthClient(async (client) => {
    const userResult = await client.query('SELECT id FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    if (!userResult.rowCount) {
      return { status: 404, body: { success: false, error: 'Email not found' } };
    }

    await client.query('DELETE FROM auth_password_resets WHERE email = $1 AND is_used = FALSE', [email]);
    await client.query(
      `INSERT INTO auth_password_resets (email, otp_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, otpHash, expiresAt],
    );

    const delivery = await sendPasswordOtp(email, otp);
    return {
      status: 200,
      body: {
        success: true,
        message: delivery.delivered ? 'OTP sent to your email' : 'OTP generated in development mode',
        ...(delivery.debugOtp ? { data: { debugOtp: delivery.debugOtp } } : {}),
      },
    };
  });
}

async function getActivePgOtpRecord(client: PoolClient, email: string) {
  const result = await client.query<{
    id: number;
    otp_hash: string;
    expires_at: Date;
    is_verified: boolean;
    is_used: boolean;
  }>(
    `SELECT id, otp_hash, expires_at, is_verified, is_used
     FROM auth_password_resets
     WHERE email = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function getActiveMongoOtpRecord(email: string) {
  return AuthPasswordResetModel.findOne({ email }).sort({ createdAt: -1 }).lean();
}

export async function verifyOtp(payload: { email: string; otp: string }) {
  const email = normalizeEmail(payload.email || '');
  const otp = (payload.otp || '').trim();

  if (!isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }
  if (!/^\d{6}$/.test(otp)) {
    return { status: 400, body: { success: false, error: 'Invalid OTP format' } };
  }

  if (!hasPostgresConfig()) {
    const otpRecord = await getActiveMongoOtpRecord(email);
    if (!otpRecord || otpRecord.isUsed) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    if (new Date(otpRecord.expiresAt).getTime() < Date.now()) {
      return { status: 400, body: { success: false, error: 'OTP expired' } };
    }

    const isOtpMatch = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isOtpMatch) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    await AuthPasswordResetModel.updateOne({ _id: otpRecord._id }, { $set: { isVerified: true } });
    return { status: 200, body: { success: true, message: 'OTP verified successfully' } };
  }

  return withAuthClient(async (client) => {
    const otpRecord = await getActivePgOtpRecord(client, email);
    if (!otpRecord || otpRecord.is_used) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      return { status: 400, body: { success: false, error: 'OTP expired' } };
    }

    const isOtpMatch = await bcrypt.compare(otp, otpRecord.otp_hash);
    if (!isOtpMatch) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    await client.query('UPDATE auth_password_resets SET is_verified = TRUE WHERE id = $1', [otpRecord.id]);
    return { status: 200, body: { success: true, message: 'OTP verified successfully' } };
  });
}

export async function changePassword(payload: { email: string; otp: string; newPassword: string }) {
  const email = normalizeEmail(payload.email || '');
  const otp = (payload.otp || '').trim();
  const newPassword = payload.newPassword || '';

  if (!isValidEmail(email)) {
    return { status: 400, body: { success: false, error: 'Invalid email format' } };
  }
  if (!/^\d{6}$/.test(otp)) {
    return { status: 400, body: { success: false, error: 'Invalid OTP format' } };
  }
  if (newPassword.length < 6) {
    return { status: 400, body: { success: false, error: 'Password must be at least 6 characters' } };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  if (!hasPostgresConfig()) {
    const otpRecord = await getActiveMongoOtpRecord(email);
    if (!otpRecord || otpRecord.isUsed) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    if (new Date(otpRecord.expiresAt).getTime() < Date.now()) {
      return { status: 400, body: { success: false, error: 'OTP expired' } };
    }

    const isOtpMatch = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isOtpMatch) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    await AuthUserModel.updateOne({ email }, { $set: { passwordHash, updatedAt: new Date() } });
    await AuthPasswordResetModel.updateOne({ _id: otpRecord._id }, { $set: { isUsed: true } });

    return { status: 200, body: { success: true, message: 'Password reset successful' } };
  }

  return withAuthClient(async (client) => {
    const otpRecord = await getActivePgOtpRecord(client, email);
    if (!otpRecord || otpRecord.is_used) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }
    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      return { status: 400, body: { success: false, error: 'OTP expired' } };
    }

    const isOtpMatch = await bcrypt.compare(otp, otpRecord.otp_hash);
    if (!isOtpMatch) {
      return { status: 400, body: { success: false, error: 'Invalid OTP' } };
    }

    await client.query('BEGIN');
    try {
      await client.query(
        'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE email = $2',
        [passwordHash, email],
      );
      await client.query(
        'UPDATE auth_password_resets SET is_used = TRUE WHERE id = $1',
        [otpRecord.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    return { status: 200, body: { success: true, message: 'Password reset successful' } };
  });
}

export async function forgotPassword(payload: { email: string }) {
  return sendOtp(payload);
}

export async function resetPassword(payload: { email: string; otp: string; newPassword: string }) {
  return changePassword(payload);
}

export async function ensureAuthDatabaseReady(): Promise<void> {
  const pool = getAuthPool();
  await pool.query('SELECT 1');
}

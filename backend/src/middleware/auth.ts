import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  auth?: {
    sub: string;
    email: string;
    role?: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    return res.status(500).json({ success: false, error: 'JWT_SECRET is not configured' });
  }

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    const email = String(decoded.email || '');
    const sub = String(decoded.sub || '');
    if (!email || !sub) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    req.auth = {
      sub,
      email,
      role: typeof decoded.role === 'string' ? decoded.role : undefined,
    };
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

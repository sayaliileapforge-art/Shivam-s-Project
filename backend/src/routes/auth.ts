import { Router, Request, Response } from 'express';
import {
  signup,
  login,
  sendOtp,
  verifyOtp,
  changePassword,
  getProfileByEmail,
  updateProfileByEmail,
} from '../auth/service';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await signup({
      name: typeof body.name === 'string' ? body.name : '',
      email: typeof body.email === 'string' ? body.email : '',
      mobile: typeof body.mobile === 'string' ? body.mobile : '',
      password: typeof body.password === 'string' ? body.password : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await login(req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getProfileByEmail(req.auth?.email || '');
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await updateProfileByEmail({
      email: req.auth?.email || '',
      name: typeof body.name === 'string' ? body.name : '',
      firmName: typeof body.firmName === 'string' ? body.firmName : '',
      profileImage: typeof body.profileImage === 'string' ? body.profileImage : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await sendOtp({
      email: typeof body.email === 'string' ? body.email : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await verifyOtp({
      email: typeof body.email === 'string' ? body.email : '',
      otp: typeof body.otp === 'string' ? body.otp : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/change-password', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await changePassword({
      email: typeof body.email === 'string' ? body.email : '',
      otp: typeof body.otp === 'string' ? body.otp : '',
      newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Backward-compatible aliases
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await sendOtp({
      email: typeof body.email === 'string' ? body.email : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await changePassword({
      email: typeof body.email === 'string' ? body.email : '',
      otp: typeof body.otp === 'string' ? body.otp : '',
      newPassword: typeof body.newPassword === 'string' ? body.newPassword : '',
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

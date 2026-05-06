import { Router, Request, Response } from 'express';
import { registerRealtimeClient } from '../realtime';

const router = Router();

router.get('/stream', (req: Request, res: Response) => {
  const projectId = typeof req.query.projectId === 'string'
    ? req.query.projectId.trim()
    : undefined;
  registerRealtimeClient(res, projectId || undefined);
});

export default router;

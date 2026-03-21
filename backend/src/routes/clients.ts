import { Router, Request, Response } from 'express';
import Client from '../models/Client';

const router = Router();

// Get all clients
router.get('/', async (req: Request, res: Response) => {
  try {
    const clients = await Client.find();
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get client by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Create client
router.post('/', async (req: Request, res: Response) => {
  try {
    const client = new Client(req.body);
    await client.save();
    res.status(201).json({ success: true, data: client });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update client
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!client) {
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }
    res.json({ success: true, data: client });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Delete client
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) {
      res.status(404).json({ success: false, error: 'Client not found' });
      return;
    }
    res.json({ success: true, message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

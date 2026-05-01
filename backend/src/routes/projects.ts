import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project';
import ProductTemplate from '../models/ProductTemplate';
import DataRecord from '../models/DataRecord';

const router = Router();

// Get templates for a specific project (matches both projectId string field and legacy productId ObjectId field)
router.get('/:id/templates', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid project id' });
      return;
    }
    const conditions: Record<string, any>[] = [
      { projectId: id },
      { productId: new mongoose.Types.ObjectId(id) },
    ];
    const templates = await ProductTemplate.find({ $or: conditions }).sort({ updatedAt: -1 });
    console.log(`[Projects] GET /${id}/templates — found ${templates.length} templates`);
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get all projects (optionally filtered by clientId)
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query.clientId) {
      const rawId = req.query.clientId as string;
      console.log('[Projects] GET / — filtering by clientId:', rawId);
      try {
        filter.clientId = new mongoose.Types.ObjectId(rawId);
      } catch {
        // If rawId is not a valid ObjectId, fall back to string match
        filter.clientId = rawId;
      }
    } else {
      console.log('[Projects] GET / — no clientId filter, returning all projects');
    }
    const projects = await Project.find(filter).populate('clientId').populate('templateId');
    console.log(`[Projects] GET / — found ${projects.length} projects for filter:`, JSON.stringify(filter));
    res.json({ success: true, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get project by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await Project.findById(req.params.id).populate('clientId').populate('templateId');
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const project = new Project(req.body);
    await project.save();
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Delete project (cascades to templates and data records)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid project id' });
      return;
    }

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const objectId = new mongoose.Types.ObjectId(id);

    // Delete all related data in parallel
    await Promise.all([
      DataRecord.deleteMany({ projectId: objectId }),
      ProductTemplate.deleteMany({
        $or: [{ projectId: id }, { productId: objectId }],
      }),
    ]);

    await project.deleteOne();

    console.log(`[Projects] DELETE /${id} — project and related data deleted`);
    res.json({ success: true, message: 'Project and all related data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

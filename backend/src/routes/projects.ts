import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project';
import ProjectDesignTemplate from '../models/ProjectDesignTemplate';

const router = Router();

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

// Delete project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Project Design Templates ────────────────────────────────────────────────

function mapTemplate(t: any) {
  const obj = t.toObject ? t.toObject() : { ...t };
  const { _id, __v, ...rest } = obj;
  return { ...rest, id: String(_id) };
}

// GET all templates for a project (own + same-client + public)
router.get('/:projectId/templates', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    const clientId = project ? String((project as any).clientId || '') : '';

    const conditions: any[] = [{ projectId }];
    if (clientId) conditions.push({ clientId });
    conditions.push({ isPublic: true });

    const templates = await ProjectDesignTemplate.find({ $or: conditions });
    res.json({ success: true, data: templates.map(mapTemplate) });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST create a template
router.post('/:projectId/templates', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const template = new ProjectDesignTemplate({ ...req.body, projectId });
    await template.save();
    res.status(201).json({ success: true, data: mapTemplate(template) });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// PUT update a template
router.put('/:projectId/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const template = await ProjectDesignTemplate.findByIdAndUpdate(
      req.params.templateId,
      req.body,
      { new: true }
    );
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, data: mapTemplate(template) });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// DELETE a template
router.delete('/:projectId/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const template = await ProjectDesignTemplate.findByIdAndDelete(req.params.templateId);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }
    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

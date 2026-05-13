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
    const templates = (await ProductTemplate.find({ $or: conditions })).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
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

    // Delete all related data in parallel.
    // IMPORTANT: isGlobal:true templates are gallery templates — they must never be
    // cascade-deleted when a project is removed. Only delete project-specific copies.
    await Promise.all([
      DataRecord.deleteMany({ projectId: objectId }),
      ProductTemplate.deleteMany({
        $or: [{ projectId: id }, { productId: objectId }],
        isGlobal: { $ne: true },
      }),
    ]);

    await project.deleteOne();

    console.log(`[Projects] DELETE /${id} — project and non-global templates deleted (gallery templates preserved)`);
    res.json({ success: true, message: 'Project and all related data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── Data Records ──────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/records?category=xxx
 * Returns all persisted data records for a project + category.
 * Each record is returned as the plain variables object (i.e. what the frontend stored).
 */
router.get('/:id/records', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = req.query.category ? String(req.query.category) : undefined;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid project id' });
      return;
    }

    const filter: Record<string, any> = { projectId: new mongoose.Types.ObjectId(id) };
    if (category !== undefined) filter.category = category;

    const records = await DataRecord.find(filter).lean();
    const data = records.map((r) => r.variables);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/projects/:id/records
 * Bulk-replaces all records for a given project + category.
 * Body: { category: string, records: object[] }
 *
 * Each element of `records` is stored verbatim in `variables`.
 * Images should already be server-relative URL strings (e.g. "/uploads/filename.jpg"),
 * NOT base64 data URLs.
 */
router.post('/:id/records', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category, records } = req.body as { category: string; records: Record<string, any>[] };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid project id' });
      return;
    }
    if (!Array.isArray(records)) {
      res.status(400).json({ success: false, error: '`records` must be an array' });
      return;
    }

    const projectId = new mongoose.Types.ObjectId(id);
    const cat = String(category ?? '');

    // Replace all existing records for this project + category
    await DataRecord.deleteMany({ projectId, category: cat });

    if (records.length > 0) {
      await DataRecord.insertMany(
        records.map((rec) => ({
          projectId,
          category: cat,
          variables: rec,
          status: 'pending',
        }))
      );
    }

    res.json({ success: true, count: records.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PATCH /api/projects/:id/records/photo
 * Updates the `photo` field of a single record identified by its frontend-generated id.
 * Body: { category: string, frontendId: string, photoUrl: string }
 */
router.patch('/:id/records/photo', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category, frontendId, photoUrl } = req.body as {
      category: string;
      frontendId: string;
      photoUrl: string;
    };

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid project id' });
      return;
    }
    if (!frontendId || !photoUrl) {
      res.status(400).json({ success: false, error: 'frontendId and photoUrl are required' });
      return;
    }

    const projectId = new mongoose.Types.ObjectId(id);
    await DataRecord.updateOne(
      { projectId, category: String(category ?? ''), 'variables.id': frontendId },
      { $set: { 'variables.photo': photoUrl } }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;

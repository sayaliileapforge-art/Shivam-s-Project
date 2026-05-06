import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import PrintRule from '../models/PrintRule';
import ProductTemplate from '../models/ProductTemplate';

const router = Router();

function isValidId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── GET /api/rules?projectId=xxx ────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId || !isValidId(String(projectId))) {
      res.status(400).json({ success: false, error: 'Valid projectId required' });
      return;
    }

    const rules = await PrintRule.find({
      projectId: new mongoose.Types.ObjectId(String(projectId)),
      isActive: true,
    }).sort({ priority: 1, createdAt: 1 });

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ─── GET /api/rules/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      res.status(400).json({ success: false, error: 'Invalid rule id' });
      return;
    }
    const rule = await PrintRule.findById(id);
    if (!rule) {
      res.status(404).json({ success: false, error: 'Rule not found' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ─── POST /api/rules ──────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      templateId,
      templateName,
      csvFileName,
      groupOperator,
      conditionGroups,
      fieldMappings,
      priority,
      isDefault,
    } = req.body;

    if (!projectId || !isValidId(String(projectId))) {
      res.status(400).json({ success: false, error: 'Valid projectId required' });
      return;
    }
    if (!templateId || !isValidId(String(templateId))) {
      res.status(400).json({ success: false, error: 'Valid templateId required' });
      return;
    }

    // Verify template exists
    const template = await ProductTemplate.findById(templateId);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    // When saving as default, clear existing defaults for this project
    if (isDefault) {
      await PrintRule.updateMany(
        { projectId: new mongoose.Types.ObjectId(String(projectId)), isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const rule = new PrintRule({
      projectId: new mongoose.Types.ObjectId(String(projectId)),
      templateId: new mongoose.Types.ObjectId(String(templateId)),
      templateName: String(templateName || template.templateName),
      csvFileName: String(csvFileName || ''),
      groupOperator: groupOperator || 'AND',
      conditionGroups: conditionGroups || [],
      fieldMappings: fieldMappings || [],
      priority: Number(priority) || 1,
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    await rule.save();
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── PUT /api/rules/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      res.status(400).json({ success: false, error: 'Invalid rule id' });
      return;
    }

    const existing = await PrintRule.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Rule not found' });
      return;
    }

    const {
      templateId,
      templateName,
      csvFileName,
      groupOperator,
      conditionGroups,
      fieldMappings,
      priority,
      isDefault,
      isActive,
    } = req.body;

    // When promoting to default, demote other rules
    if (isDefault && !existing.isDefault) {
      await PrintRule.updateMany(
        { projectId: existing.projectId, isDefault: true, _id: { $ne: id } },
        { $set: { isDefault: false } }
      );
    }

    const updatePayload: Record<string, unknown> = {};
    if (templateId && isValidId(String(templateId))) {
      updatePayload.templateId = new mongoose.Types.ObjectId(String(templateId));
    }
    if (typeof templateName === 'string') updatePayload.templateName = templateName;
    if (typeof csvFileName === 'string') updatePayload.csvFileName = csvFileName;
    if (groupOperator) updatePayload.groupOperator = groupOperator;
    if (conditionGroups !== undefined) updatePayload.conditionGroups = conditionGroups;
    if (fieldMappings !== undefined) updatePayload.fieldMappings = fieldMappings;
    if (priority !== undefined) updatePayload.priority = Number(priority);
    if (isDefault !== undefined) updatePayload.isDefault = Boolean(isDefault);
    if (isActive !== undefined) updatePayload.isActive = Boolean(isActive);

    const updated = await PrintRule.findByIdAndUpdate(id, { $set: updatePayload }, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// ─── DELETE /api/rules/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      res.status(400).json({ success: false, error: 'Invalid rule id' });
      return;
    }
    const rule = await PrintRule.findByIdAndDelete(id);
    if (!rule) {
      res.status(404).json({ success: false, error: 'Rule not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;

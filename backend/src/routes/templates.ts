import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import ProductTemplate from '../models/ProductTemplate';
import Product from '../models/Product';
import TemplateSelection from '../models/TemplateSelection';

const router = Router();

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function resolvePreviewImage(payload: Record<string, any>): string {
  return String(payload.preview_image || payload.previewImageUrl || '').trim();
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const requestedProductId = String(req.query.productId || req.query.projectId || '').trim();
    console.log('[templates] GET /api/templates', {
      productId: requestedProductId || null,
      query: req.query,
    });

    // Fetch templates by projectId or isGlobal (optional global flag)
    let filter: Record<string, any> = {};
    if (requestedProductId) {
      filter = {
        $or: [
          { productId: requestedProductId },
          { isGlobal: true }
        ]
      };
    }
    const templates = await ProductTemplate.find(filter).sort({ updatedAt: -1 });
    console.log('[templates] Templates found', {
      count: templates.length,
      ids: templates.map((template) => String(template._id)),
    });

    res.json({
      success: true,
      data: templates,
      meta: {
        total: templates.length
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    if (!isValidObjectId(productId)) {
      res.status(400).json({ success: false, error: 'Invalid productId' });
      return;
    }

    const { category, search } = req.query;
    const filter: Record<string, any> = { productId, isActive: true };
    if (category) filter.category = category;
    if (search) filter.templateName = { $regex: String(search), $options: 'i' };

    const templates = await ProductTemplate.find(filter).sort({ updatedAt: -1 });
    console.log('[templates] GET /api/templates/product/:productId', {
      productId,
      count: templates.length,
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }

    const template = await ProductTemplate.findById(id);
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      productId,
      templateName,
      previewImageUrl,
      preview_image,
      designFileUrl,
      designData,
      category = 'Other',
      tags = [],
      isActive = true,
    } = req.body;

    const normalizedPreview = resolvePreviewImage({ preview_image, previewImageUrl });

    if (!productId || !templateName || !normalizedPreview) {
      res.status(400).json({ success: false, error: 'productId, templateName, and preview_image are required' });
      return;
    }
    if (!isValidObjectId(productId)) {
      res.status(400).json({ success: false, error: 'Invalid productId' });
      return;
    }

    const productExists = await Product.exists({ _id: productId });
    if (!productExists) {
      res.status(404).json({ success: false, error: 'Product not found for template mapping' });
      return;
    }

    const template = new ProductTemplate({
      productId,
      templateName: String(templateName).trim(),
      preview_image: normalizedPreview,
      previewImageUrl: normalizedPreview,
      designFileUrl,
      designData: designData ?? {},
      category,
      tags,
      isActive,
    });

    await template.save();
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid template id' });
      return;
    }

    const existingTemplate = await ProductTemplate.findById(id);
    if (!existingTemplate) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

    const normalizedPreview = resolvePreviewImage(req.body as Record<string, any>)
      || existingTemplate.preview_image
      || existingTemplate.previewImageUrl
      || '';

    const updatePayload: Record<string, any> = {
      ...req.body,
      preview_image: normalizedPreview || undefined,
      previewImageUrl: normalizedPreview || undefined,
    };

    const template = await ProductTemplate.findByIdAndUpdate(id, updatePayload, { new: true });

    res.json({ success: true, data: template });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post('/selection', async (req: Request, res: Response) => {
  try {
    const { userId, productId, templateId, action, metadata } = req.body;

    if (!productId || !templateId || !action) {
      res.status(400).json({ success: false, error: 'productId, templateId and action are required' });
      return;
    }
    if (!isValidObjectId(productId) || !isValidObjectId(templateId)) {
      res.status(400).json({ success: false, error: 'Invalid productId or templateId' });
      return;
    }

    const mappedTemplate = await ProductTemplate.findOne({ _id: templateId, productId, isActive: true });
    if (!mappedTemplate) {
      res.status(404).json({ success: false, error: 'Template is not linked to this product' });
      return;
    }

    const selection = new TemplateSelection({
      userId,
      productId,
      templateId,
      action,
      metadata: metadata ?? {},
    });

    await selection.save();
    res.status(201).json({ success: true, data: selection });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;

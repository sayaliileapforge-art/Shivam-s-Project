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
    const err = error as Error;
    console.error('[templates] GET /api/templates failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
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

    console.log('[templates] Querying /api/templates/product/:productId', {
      productId,
      filter,
      database: mongoose.connection.name,
      collection: 'producttemplates',
    });

    const templates = await ProductTemplate.find(filter).sort({ updatedAt: -1 });
    console.log('[templates] Query result', {
      productId,
      count: templates.length,
      templateIds: templates.map((t) => String(t._id)),
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] GET /api/templates/product/:productId failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
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
    const err = error as Error;
    console.error('[templates] GET /api/templates/:id failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
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

    console.log('[templates] Saving template', {
      productId,
      templateName: template.templateName,
      collection: 'producttemplates',
      database: mongoose.connection.name,
    });

    const savedTemplate = await template.save();
    console.log('[templates] Template saved successfully', {
      _id: String(savedTemplate._id),
      templateName: savedTemplate.templateName,
      createdAt: savedTemplate.createdAt,
    });

    res.status(201).json({ success: true, data: savedTemplate });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template save failed', {
      error: err.message,
      stack: err.stack,
      mongoError: (error as any).code,
      mongoMessage: (error as any).message,
    });
    res.status(400).json({ success: false, error: err.message });
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

    console.log('[templates] Updating template', {
      _id: id,
      database: mongoose.connection.name,
      updateFields: Object.keys(updatePayload),
    });

    const template = await ProductTemplate.findByIdAndUpdate(id, updatePayload, { new: true });
    console.log('[templates] Template updated successfully', {
      _id: id,
      updatedAt: template?.updatedAt,
    });

    res.json({ success: true, data: template });
  } catch (error) {
    const err = error as Error;
    console.error('[templates] Template update failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(400).json({ success: false, error: err.message });
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
    const err = error as Error;
    console.error('[templates] Template selection save failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(400).json({ success: false, error: err.message });
  }
});

// Migration endpoint: Sync localStorage project templates to MongoDB
router.post('/migration/sync-project-templates', async (req: Request, res: Response) => {
  try {
    const { projectId, templates } = req.body as {
      projectId: string;
      templates: Array<{
        id?: string;
        templateName: string;
        templateType?: string;
        canvas?: Record<string, any>;
        margin?: Record<string, any>;
        thumbnail?: string;
        isPublic?: boolean;
        applicableFor?: string[];
      }>;
    };

    if (!projectId || !Array.isArray(templates)) {
      res.status(400).json({
        success: false,
        error: 'projectId and templates array are required'
      });
      return;
    }

    console.log('[templates:migration] Starting sync', {
      projectId,
      count: templates.length,
      database: mongoose.connection.name,
    });

    const savedTemplates = [];
    const errors = [];

    for (const tpl of templates) {
      try {
        // Check if product exists
        const productExists = await Product.exists({ _id: projectId });
        if (!productExists) {
          console.warn('[templates:migration] Product not found:', { projectId });
          errors.push({ templateName: tpl.templateName, error: 'Product not found' });
          continue;
        }

        // Create template in MongoDB
        const newTemplate = new ProductTemplate({
          productId: projectId,
          templateName: String(tpl.templateName).trim(),
          category: 'Other', // Default category
          preview_image: tpl.thumbnail || '',
          previewImageUrl: tpl.thumbnail || '',
          designData: {
            templateType: tpl.templateType,
            canvas: tpl.canvas,
            margin: tpl.margin,
            applicableFor: tpl.applicableFor,
          },
          isActive: tpl.isPublic !== false,
          tags: [`migrated_${new Date().toISOString().split('T')[0]}`],
        });

        await newTemplate.save();
        savedTemplates.push({
          _id: String(newTemplate._id),
          templateName: newTemplate.templateName,
        });

        console.log('[templates:migration] Template saved', {
          templateName: tpl.templateName,
          _id: String(newTemplate._id),
        });
      } catch (err) {
        const error = err as Error;
        console.error('[templates:migration] Template save failed', {
          templateName: tpl.templateName,
          error: error.message,
        });
        errors.push({
          templateName: tpl.templateName,
          error: error.message,
        });
      }
    }

    console.log('[templates:migration] Sync complete', {
      projectId,
      saved: savedTemplates.length,
      failed: errors.length,
    });

    res.json({
      success: true,
      message: `Migrated ${savedTemplates.length} templates to MongoDB`,
      data: {
        saved: savedTemplates,
        errors,
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[templates:migration] Migration failed', {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

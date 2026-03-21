import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import ProductTemplate from '../models/ProductTemplate';
import Product from '../models/Product';
import TemplateSelection from '../models/TemplateSelection';

const router = Router();

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      productId,
      category,
      search,
      page = '1',
      pageSize = '12',
      active = 'true',
    } = req.query;

    const filter: Record<string, any> = {};
    if (productId) filter.productId = productId;
    if (category) filter.category = category;
    if (active !== 'all') filter.isActive = String(active) === 'true';
    if (search) filter.templateName = { $regex: String(search), $options: 'i' };

    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.max(1, Math.min(50, Number(pageSize) || 12));

    const [items, total] = await Promise.all([
      ProductTemplate.find(filter)
        .sort({ updatedAt: -1 })
        .skip((pageNum - 1) * perPage)
        .limit(perPage),
      ProductTemplate.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      meta: {
        page: pageNum,
        pageSize: perPage,
        total,
        totalPages: Math.ceil(total / perPage),
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
      designFileUrl,
      designData,
      category = 'Other',
      tags = [],
      isActive = true,
    } = req.body;

    if (!productId || !templateName || !previewImageUrl) {
      res.status(400).json({ success: false, error: 'productId, templateName, and previewImageUrl are required' });
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
      previewImageUrl,
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

    const template = await ProductTemplate.findByIdAndUpdate(id, req.body, { new: true });
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found' });
      return;
    }

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

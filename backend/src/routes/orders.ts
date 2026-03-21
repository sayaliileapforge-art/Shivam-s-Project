import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import ProductTemplate from '../models/ProductTemplate';
import TemplateOrder from '../models/TemplateOrder';

const router = Router();

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, productId, status } = req.query;
    const filter: Record<string, any> = {};
    if (userId) filter.userId = userId;
    if (productId) filter.productId = productId;
    if (status) filter.status = status;

    const orders = await TemplateOrder.find(filter)
      .populate('productId', 'name')
      .populate('templateId', 'templateName previewImageUrl category')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      productId,
      templateId,
      quantity,
      unitPrice,
      customDesignData,
    } = req.body;

    if (!productId || !templateId || !quantity) {
      res.status(400).json({ success: false, error: 'productId, templateId and quantity are required' });
      return;
    }
    if (!isValidObjectId(productId) || !isValidObjectId(templateId)) {
      res.status(400).json({ success: false, error: 'Invalid productId or templateId' });
      return;
    }

    const [product, template] = await Promise.all([
      Product.findById(productId),
      ProductTemplate.findOne({ _id: templateId, productId, isActive: true }),
    ]);

    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    if (!template) {
      res.status(404).json({ success: false, error: 'Template not found for selected product' });
      return;
    }

    const qty = Math.max(1, Number(quantity));
    const perUnit = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : Number(product.price || product.publicPrice || 0);
    const totalAmount = qty * perUnit;

    const order = new TemplateOrder({
      userId,
      productId,
      templateId,
      quantity: qty,
      unitPrice: perUnit,
      totalAmount,
      customDesignData: customDesignData ?? undefined,
      selectedTemplateSnapshot: {
        templateName: template.templateName,
        previewImageUrl: template.previewImageUrl,
        category: template.category,
      },
      status: 'pending',
    });

    await order.save();
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;

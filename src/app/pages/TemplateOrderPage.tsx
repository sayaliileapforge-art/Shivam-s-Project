import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { fetchProductById } from '../../lib/productApi';
import { getTemplateById, resolveTemplatePreview, type TemplateRecord } from '../../lib/templateApi';
import { createTemplateOrder, type TemplateOrderRecord } from '../../lib/orderApi';
import { useRbac } from '../../lib/rbac';
import type { Product } from '../../lib/productStore';
import { formatPrice, getPriceByRole } from '../../lib/pricingUtils';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function TemplateOrderPage() {
  const { productId = '' } = useParams();
  const query = useQuery();
  const navigate = useNavigate();
  const { user } = useRbac();

  const templateId = query.get('templateId') || '';

  const [product, setProduct] = useState<Product | null>(null);
  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState<TemplateOrderRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!productId || !templateId) return;

    Promise.all([fetchProductById(productId), getTemplateById(templateId)])
      .then(([p, t]) => {
        setProduct(p);
        setTemplate(t);
      })
      .catch((err) => setError((err as Error).message || 'Failed to load order data'));
  }, [productId, templateId]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return getPriceByRole(product, user?.role || null);
  }, [product, user?.role]);

  const totalPrice = unitPrice * quantity;

  const placeOrder = async () => {
    if (!productId || !templateId) {
      setError('Missing product or template selection');
      return;
    }

    try {
      setPlacingOrder(true);
      setError('');
      const order = await createTemplateOrder({
        userId: user?.id,
        productId,
        templateId,
        quantity,
        unitPrice,
      });
      setOrderResult(order);
    } catch (err) {
      setError((err as Error).message || 'Failed to create order');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!templateId) {
    return (
      <div className='space-y-4'>
        <p className='text-destructive'>Template not selected.</p>
        <Button variant='outline' onClick={() => navigate(`/products/${productId}/templates`)}>
          Go to Template Selection
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <Button variant='ghost' className='gap-2' onClick={() => navigate(`/products/${productId}/templates`)}>
        <ArrowLeft className='h-4 w-4' /> Back to Templates
      </Button>

      <h1 className='text-3xl font-semibold'>Direct Order</h1>

      {error && <p className='text-sm text-destructive'>{error}</p>}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <Card className='p-4 lg:col-span-2 space-y-4'>
          <h2 className='text-lg font-semibold'>Product Summary</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <p className='text-sm text-muted-foreground'>Product</p>
              <p className='font-medium'>{product?.name || 'Loading...'}</p>
              <p className='text-sm text-muted-foreground mt-2'>Template</p>
              <p className='font-medium'>{template?.templateName || 'Loading...'}</p>
              {template?.category && <p className='text-xs text-muted-foreground'>{template.category}</p>}
            </div>
            <div className='h-44 bg-muted rounded overflow-hidden'>
              {template ? (
                <img
                  src={resolveTemplatePreview(template)}
                  alt={template.templateName}
                  className='w-full h-full object-cover'
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect fill='%23f3f4f6' width='400' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236b7280'%3ENo preview%3C/text%3E%3C/svg%3E";
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='quantity'>Quantity</Label>
            <Input
              id='quantity'
              type='number'
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className='max-w-40'
            />
          </div>
        </Card>

        <Card className='p-4 space-y-4 h-fit'>
          <h2 className='text-lg font-semibold'>Checkout</h2>
          <div className='space-y-2 text-sm'>
            <div className='flex justify-between'>
              <span>Unit Price</span>
              <span>{formatPrice(unitPrice)}</span>
            </div>
            <div className='flex justify-between'>
              <span>Quantity</span>
              <span>{quantity}</span>
            </div>
            <div className='flex justify-between font-semibold text-base border-t pt-2'>
              <span>Total</span>
              <span>{formatPrice(totalPrice)}</span>
            </div>
          </div>

          {!orderResult ? (
            <Button className='w-full' onClick={placeOrder} disabled={placingOrder || !product || !template}>
              {placingOrder ? 'Placing Order...' : 'Place Order'}
            </Button>
          ) : (
            <div className='space-y-2'>
              <p className='text-green-600 text-sm'>Order created successfully.</p>
              <p className='text-xs text-muted-foreground'>Order ID: {orderResult._id}</p>
              <Button className='w-full' onClick={() => navigate('/print-orders')}>Go to Orders</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

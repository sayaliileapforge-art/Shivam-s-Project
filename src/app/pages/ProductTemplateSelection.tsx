import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Heart, Search } from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { fetchProductById } from '../../lib/productApi';
import { getTemplatesByProductId, saveSelectedTemplate, type TemplateRecord } from '../../lib/templateApi';
import { useRbac } from '../../lib/rbac';
import type { Product } from '../../lib/productStore';

const FAVORITE_KEY = 'favorite_templates_v1';
const RECENT_KEY = 'recent_templates_v1';
const PAGE_SIZE = 8;

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
}

export function ProductTemplateSelection() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useRbac();

  const [product, setProduct] = useState<Product | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITE_KEY));
  const [recent, setRecent] = useState<string[]>(() => readIds(RECENT_KEY));
  const [page, setPage] = useState(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError('');

    Promise.all([
      fetchProductById(productId),
      getTemplatesByProductId(productId),
    ])
      .then(([productData, templateData]) => {
        setProduct(productData);
        setTemplates(templateData);
      })
      .catch((err) => {
        setError((err as Error).message || 'Failed to load templates');
      })
      .finally(() => setLoading(false));
  }, [productId]);

  const categories = useMemo(() => {
    const vals = Array.from(new Set(templates.map((t) => t.category))).sort();
    return ['All', ...vals];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((t) => {
      const matchCategory = category === 'All' || t.category === category;
      const matchTerm =
        !term ||
        t.templateName.toLowerCase().includes(term) ||
        t.tags.some((tag) => tag.toLowerCase().includes(term));
      return matchCategory && matchTerm;
    });
  }, [templates, search, category]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const pagedTemplates = filteredTemplates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, category]);

  const toggleFavorite = (templateId: string) => {
    const next = favorites.includes(templateId)
      ? favorites.filter((id) => id !== templateId)
      : [templateId, ...favorites];
    setFavorites(next);
    writeIds(FAVORITE_KEY, next);
  };

  const rememberRecent = (templateId: string) => {
    const next = [templateId, ...recent.filter((id) => id !== templateId)].slice(0, 12);
    setRecent(next);
    writeIds(RECENT_KEY, next);
  };

  const openUseTemplateDialog = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setSelectionDialogOpen(true);
  };

  const handleTemplateAction = async (action: 'customize' | 'direct_order') => {
    if (!selectedTemplateId || !productId) return;

    try {
      await saveSelectedTemplate({
        userId: user?.id,
        productId,
        templateId: selectedTemplateId,
        action,
      });

      rememberRecent(selectedTemplateId);
      setSelectionDialogOpen(false);

      if (action === 'customize') {
        navigate(`/designer-studio?productId=${productId}&templateId=${selectedTemplateId}`);
        return;
      }

      navigate(`/products/${productId}/order?templateId=${selectedTemplateId}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to save selected template');
    }
  };

  return (
    <div className='space-y-6'>
      <Button variant='ghost' className='gap-2' onClick={() => navigate('/products')}>
        <ArrowLeft className='h-4 w-4' /> Back to Products
      </Button>

      <div>
        <h1 className='text-3xl font-semibold'>Template Selection</h1>
        <p className='text-muted-foreground mt-1'>
          {product ? `Choose a template for ${product.name}` : 'Choose a template for your product'}
        </p>
      </div>

      {error && <p className='text-sm text-destructive'>{error}</p>}

      <Card className='p-4 space-y-4'>
        <div className='flex flex-col md:flex-row gap-3 md:items-center md:justify-between'>
          <div className='relative w-full md:max-w-md'>
            <Search className='h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search templates by name/tag'
              className='pl-9'
            />
          </div>

          <div className='flex flex-wrap gap-2'>
            {categories.map((cat) => (
              <Button
                key={cat}
                type='button'
                size='sm'
                variant={category === cat ? 'default' : 'outline'}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {recent.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary'>Recently Used</Badge>
            {recent.slice(0, 5).map((id) => {
              const t = templates.find((x) => x._id === id);
              if (!t) return null;
              return (
                <Button key={id} size='sm' variant='outline' onClick={() => openUseTemplateDialog(id)}>
                  {t.templateName}
                </Button>
              );
            })}
          </div>
        )}
      </Card>

      {loading ? (
        <Card className='p-8 text-center text-muted-foreground'>Loading templates...</Card>
      ) : pagedTemplates.length === 0 ? (
        <Card className='p-8 text-center text-muted-foreground'>No templates found for this product.</Card>
      ) : (
        <>
          <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
            {pagedTemplates.map((template) => (
              <Card
                key={template._id}
                className='group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5'
              >
                <div className='relative h-40 bg-muted overflow-hidden'>
                  <img
                    src={template.previewImageUrl}
                    alt={template.templateName}
                    className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect fill='%23f3f4f6' width='400' height='200'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236b7280'%3ENo preview%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <button
                    className='absolute top-2 right-2 bg-white/90 rounded-full p-2 hover:bg-white'
                    onClick={() => toggleFavorite(template._id)}
                    aria-label='toggle favorite'
                  >
                    <Heart
                      className={`h-4 w-4 ${favorites.includes(template._id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`}
                    />
                  </button>
                </div>

                <div className='p-3 space-y-3'>
                  <div>
                    <p className='font-medium line-clamp-1'>{template.templateName}</p>
                    <p className='text-xs text-muted-foreground mt-1'>{template.category}</p>
                  </div>

                  <Button className='w-full' onClick={() => openUseTemplateDialog(template._id)}>
                    Use Template
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <Card className='p-3 flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>
              Page {page} of {totalPages}
            </p>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </Card>
        </>
      )}

      <Dialog open={selectionDialogOpen} onOpenChange={setSelectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Selected Template</DialogTitle>
            <DialogDescription>
              Continue to designer for customization, or place a direct order.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='flex-row gap-2 sm:justify-end'>
            <Button variant='outline' onClick={() => handleTemplateAction('customize')}>
              Customize in Designer
            </Button>
            <Button onClick={() => handleTemplateAction('direct_order')}>Direct Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

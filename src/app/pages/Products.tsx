import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Plus, Search, Edit, Trash2, Package, Eye, EyeOff, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Product as ProductType, loadTemplates, ProductTemplate } from "../../lib/productStore";
import { ProductForm } from "../components/products/ProductForm";
import { useRbac } from "../../lib/rbac";
import { getPriceByRole, formatPrice, getRoleDisplayName } from "../../lib/pricingUtils";
import { fetchProducts, removeProduct } from "../../lib/productApi";

function getApplicableForByRole(role: string | null | undefined): "Vendor" | "Client" | "Public" {
  if (role === "client") return "Client";
  if (!role) return "Public";
  return "Vendor";
}

export function Products() {
  const { user } = useRbac();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<ProductType[]>([]);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadProductList = async () => {
    try {
      setIsLoading(true);
      const applicableFor = getApplicableForByRole(user?.role);
      const loaded = await fetchProducts(applicableFor);
      const loadedTemplates = loadTemplates();
      setProducts(loaded);
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error("Failed to fetch products", error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProductList();
  }, [user?.role]);

  const filtered = products.filter((p) =>
    [p.name, p.id].some((v) =>
      v.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      await removeProduct(id);
      setProducts(products.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete product", error);
      alert("Failed to delete product. Please try again.");
    }
  };

  const handleSave = async () => {
    await loadProductList();
    setIsAddOpen(false);
    setIsEditOpen(false);
    setEditingProduct(null);
  };

  const openEdit = (product: ProductType) => {
    setEditingProduct(product);
    setIsEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Products & Media</h1>
          <p className="text-muted-foreground mt-1">
            Manage product catalog with images, videos, and templates
          </p>
        </div>

        {/* ── Add Product Dialog ── */}
        <Dialog
          open={isAddOpen}
          onOpenChange={(o) => {
            setIsAddOpen(o);
            if (!o) setEditingProduct(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <ProductForm
              templates={templates}
              onSave={handleSave}
              onCancel={() => setIsAddOpen(false)}
              isLoading={isLoading}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Search ── */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products by name..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Product Grid/List ── */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Product Catalog ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Package className="h-12 w-12 opacity-30" />
              <p className="text-sm">
                No products found. Click <strong>Add Product</strong> to get started.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Package className="h-10 w-10 animate-pulse opacity-40" />
              <p className="text-sm">Loading products...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((product) => (
                <Card
                  key={product.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Product Image */}
                  <div className="relative h-48 bg-muted overflow-hidden">
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='192'%3E%3Crect fill='%23f3f4f6' width='320' height='192'/%3E%3C/svg%3E";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-16 w-16 text-muted-foreground opacity-30" />
                      </div>
                    )}

                    {/* Image Badge */}
                    {product.images && product.images.length > 0 && (
                      <Badge className="absolute top-2 left-2 bg-black/60">
                        {product.images.length} image{product.images.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>

                    {/* Price Display */}
                    <div className="py-2 px-3 bg-primary/10 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">
                        {getRoleDisplayName(user?.role || null)}
                      </p>
                      <p className="text-lg font-bold text-primary">
                        {formatPrice(getPriceByRole(product, user?.role || null))}
                      </p>
                    </div>

                    {/* Visibility Badges */}
                    <div className="flex flex-wrap gap-1">
                      {product.visibleTo && product.visibleTo.length > 0 ? (
                        product.visibleTo.map((visibility) => (
                          <Badge key={visibility} variant="secondary" className="text-xs">
                            {visibility}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Hidden
                        </Badge>
                      )}
                    </div>

                    {/* Media Icons */}
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {product.videoUrl && <Badge variant="outline">Video</Badge>}
                      {product.youtubeLink && <Badge variant="outline">YouTube</Badge>}
                      {product.instagramLink && <Badge variant="outline">Instagram</Badge>}
                      {product.templates && product.templates.length > 0 && (
                        <Badge variant="outline">{product.templates.length} Templates</Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => navigate(`/products/${product.id}/templates`)}
                      >
                        Use Template
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => openEdit(product)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Product Dialog ── */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(o) => {
          setIsEditOpen(o);
          if (!o) setEditingProduct(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              templates={templates}
              onSave={handleSave}
              onCancel={() => setIsEditOpen(false)}
              isLoading={isLoading}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

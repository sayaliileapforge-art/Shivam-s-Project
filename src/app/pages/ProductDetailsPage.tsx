import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ProductDetails } from "../components/products/ProductDetails";
import { TemplateShowcase } from "../components/products/TemplateShowcase";
import { API_BASE } from "../../lib/apiService";
import { fetchProductById } from "../../lib/productApi";
import { resolveTemplatePreview, type TemplateRecord } from "../../lib/templateApi";
import { Product, ProductTemplate } from "../../lib/productStore";
import { useRbac } from "../../lib/rbac";
import { getPriceByRole, formatPrice, getRoleDisplayName } from "../../lib/pricingUtils";

export function ProductDetailsPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { user } = useRbac();
  const [product, setProduct] = useState<Product | null>(null);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!productId) return;

    setIsLoading(true);
    setError("");

    const templatesUrl = `${API_BASE}/templates/product/${encodeURIComponent(productId)}`;

    Promise.all([
      fetchProductById(productId),
      fetch(templatesUrl).then(async (response) => {
        const json = await response.json();
        console.log("Full API response:", json);
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || "Failed to fetch templates");
        }
        const items = Array.isArray(json?.data) ? (json.data as TemplateRecord[]) : [];
        console.log("Templates array:", items);
        return items;
      }),
    ])
      .then(([productData, templateData]) => {
        setProduct(productData || null);

        const mappedTemplates = templateData.map((t) => ({
          id: t._id,
          name: t.templateName,
          previewImageUrl: resolveTemplatePreview(t),
          description: t.description,
          createdAt: t.createdAt,
        }));

        setTemplates(mappedTemplates);
        if (mappedTemplates.length > 0) {
          setSelectedTemplateId(mappedTemplates[0].id);
        } else {
          setSelectedTemplateId(null);
        }
      })
      .catch((err) => {
        setError((err as Error).message || "Failed to load templates");
      })
      .finally(() => setIsLoading(false));
  }, [productId]);

  const handleOrderNow = () => {
    if (!product || !selectedTemplateId) {
      alert("Please select a template before ordering");
      return;
    }

    setIsLoading(true);

    const displayPrice = getPriceByRole(product, user?.role || null);
    const roleDisplay = getRoleDisplayName(user?.role || null);
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

    // Simulate order placement with pricing details
    setTimeout(() => {
      alert(
        `Order placed successfully!\n\n📦 Product: ${product.name}\n🎨 Template: ${selectedTemplate?.name}\n💰 Price: ${formatPrice(displayPrice)} (${roleDisplay})\n\n✉️ Order confirmation will be sent to your email.`
      );
      setIsLoading(false);
    }, 1000);
  };

  if (!product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="p-8 text-center text-muted-foreground">
          <p>{isLoading ? "Loading product..." : "Product not found or has been removed."}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        className="gap-2"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Product Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product Header */}
          <div className="space-y-3">
            <h1 className="text-4xl font-bold">{product.name}</h1>
            {product.visibleTo && product.visibleTo.length > 0 && (
              <div className="flex gap-2">
                {product.visibleTo.map((visibility) => (
                  <Badge key={visibility} className="text-xs">
                    {visibility}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <Card className="p-6">
            <ProductDetails product={product} />
          </Card>
        </div>

        {/* Template & Order Section */}
        <div className="space-y-6">
          <Card className="p-6 sticky top-6">
            {/* Quick Info */}
            <div className="space-y-4 pb-6 border-b border-border">
              <div>
                <p className="text-sm text-muted-foreground">Product ID</p>
                <p className="font-mono text-sm">{product.id}</p>
              </div>
              {product.createdAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Available Since</p>
                  <p className="text-sm">{new Date(product.createdAt).toLocaleDateString("en-IN")}</p>
                </div>
              )}
            </div>

            {error ? (
              <p className="text-sm text-destructive py-3">{error}</p>
            ) : null}

            {/* Template Showcase */}
            {templates.length > 0 ? (
              <TemplateShowcase
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={setSelectedTemplateId}
                onOrderNow={handleOrderNow}
                isLoading={isLoading}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center py-8">
                  {isLoading ? "Loading templates..." : "No templates available for this product. Please contact support."}
                </p>
                <Button disabled className="w-full">
                  Order Now
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Additional Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">How to Order</h2>
        <ol className="space-y-3 list-decimal list-inside text-sm">
          <li>Select your preferred template from the options on the right</li>
          <li>Review the product images, videos, and details</li>
          <li>Click "Order Now" to proceed with your purchase</li>
          <li>Enter shipping and payment details</li>
          <li>Your order will be processed and you'll receive updates via email</li>
        </ol>
      </Card>
    </div>
  );
}

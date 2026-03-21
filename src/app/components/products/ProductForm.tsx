import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ArrowDown, ArrowUp, CheckCircle2, ImagePlus, Link2, Lock, UploadCloud, X } from "lucide-react";
import { Alert, AlertDescription } from "../ui/alert";
import { VisibilityControl, VisibilityOption } from "./VisibilityControl";
import { Product, ProductTemplate } from "../../../lib/productStore";
import { useRbac } from "../../../lib/rbac";
import { validatePricing, canEditPrices, formatPrice } from "../../../lib/pricingUtils";
import { createProduct, editProduct } from "../../../lib/productApi";

interface ProductFormProps {
  product?: Product;
  templates?: ProductTemplate[];
  onSave: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormData {
  name: string;
  descriptionHtml: string;
  videoUrl: string;
  youtubeLink: string;
  instagramLink: string;
  templates: string[];
  applicableFor: VisibilityOption[];
  isVisible: boolean;
  vendorPrice: string;
  clientPrice: string;
  publicPrice: string;
}

interface ImageItem {
  id: string;
  previewUrl: string;
  source: "existing" | "new";
  file?: File;
}

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/svg+xml"];
const MAX_IMAGE_SIZE_MB = 5;
const MAX_VIDEO_SIZE_MB = 50;
const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}/i;
const instagramPattern = /^(https?:\/\/)?(www\.)?instagram\.com\/[\w\-.]+\/?/i;

function stripHtml(html: string): string {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").trim();
}

export function ProductForm({
  product,
  templates = [],
  onSave,
  onCancel,
  isLoading = false,
}: ProductFormProps) {
  const { user } = useRbac();
  const isSuperAdmin = user?.role === "super_admin";

  const [form, setForm] = useState<FormData>({
    name: product?.name || "",
    descriptionHtml: product?.descriptionHtml || product?.description || "",
    videoUrl: product?.videoUrl || "",
    youtubeLink: product?.youtubeLink || "",
    instagramLink: product?.instagramLink || "",
    templates: product?.templates || [],
    applicableFor: product?.applicableFor || product?.visibleTo || [],
    isVisible: product?.isVisible ?? true,
    vendorPrice: product?.vendorPrice?.toString() || "",
    clientPrice: product?.clientPrice?.toString() || "",
    publicPrice: product?.publicPrice?.toString() || "",
  });

  const [imageItems, setImageItems] = useState<ImageItem[]>(
    (product?.images || []).map((url, index) => ({
      id: `existing-${index}-${url}`,
      previewUrl: url,
      source: "existing",
    }))
  );
  const [thumbnailId, setThumbnailId] = useState<string>("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFilePreview, setVideoFilePreview] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (thumbnailId) return;
    if (imageItems.length === 0) return;
    setThumbnailId(imageItems[0].id);
  }, [imageItems, thumbnailId]);

  useEffect(() => {
    return () => {
      imageItems.forEach((item) => {
        if (item.source === "new") {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      if (videoFilePreview) {
        URL.revokeObjectURL(videoFilePreview);
      }
    };
  }, [imageItems, videoFilePreview]);

  const thumbnailIndex = useMemo(() => {
    return imageItems.findIndex((item) => item.id === thumbnailId);
  }, [imageItems, thumbnailId]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const plainDescription = form.descriptionHtml.trim();

    if (!form.name.trim()) newErrors.name = "Product name is required";
    if (!plainDescription) newErrors.description = "Product description is required";
    if (imageItems.length === 0) newErrors.images = "At least one image is required";
    if (form.applicableFor.length === 0) newErrors.visibleTo = "Select at least one Applicable For option";

    if (form.youtubeLink && !youtubePattern.test(form.youtubeLink)) {
      newErrors.youtubeLink = "Please enter a valid YouTube URL";
    }
    if (form.instagramLink && !instagramPattern.test(form.instagramLink)) {
      newErrors.instagramLink = "Please enter a valid Instagram URL";
    }

    // Validate pricing only for Super Admin
    if (isSuperAdmin) {
      const pricingValidation = validatePricing({
        vendorPrice: form.vendorPrice,
        clientPrice: form.clientPrice,
        publicPrice: form.publicPrice,
      });

      if (!pricingValidation.valid) {
        Object.assign(newErrors, pricingValidation.errors);
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addImageFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newErrors: Record<string, string> = {};

    const newItems: ImageItem[] = [];
    for (const file of fileArray) {
      if (!IMAGE_MIME_TYPES.includes(file.type)) {
        newErrors.images = "Only JPEG, PNG, and SVG images are supported";
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        newErrors.images = `Each image must be smaller than ${MAX_IMAGE_SIZE_MB}MB`;
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id: `new-${Date.now()}-${Math.random()}`,
        previewUrl,
        source: "new",
        file,
      });
    }

    setErrors((prev) => ({ ...prev, ...newErrors, images: newErrors.images || "" }));
    if (newItems.length === 0) return;

    setImageItems((prev) => [...prev, ...newItems]);
    if (!thumbnailId) {
      setThumbnailId(newItems[0].id);
    }
  };

  const handleRemoveImage = (id: string) => {
    setImageItems((prev) => {
      const item = prev.find((entry) => entry.id === id);
      if (item?.source === "new") {
        URL.revokeObjectURL(item.previewUrl);
      }
      const updated = prev.filter((entry) => entry.id !== id);
      if (thumbnailId === id && updated.length > 0) {
        setThumbnailId(updated[0].id);
      }
      return updated;
    });
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= imageItems.length) return;

    setImageItems((prev) => {
      const cloned = [...prev];
      const temp = cloned[index];
      cloned[index] = cloned[newIndex];
      cloned[newIndex] = temp;
      return cloned;
    });
  };

  const handleVideoFileChange = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setErrors((prev) => ({ ...prev, videoFile: "Please upload a valid video file" }));
      return;
    }

    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, videoFile: `Video must be smaller than ${MAX_VIDEO_SIZE_MB}MB` }));
      return;
    }

    if (videoFilePreview) {
      URL.revokeObjectURL(videoFilePreview);
    }

    const preview = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoFilePreview(preview);
    setErrors((prev) => ({ ...prev, videoFile: "" }));
  };

  const handleToggleTemplate = (templateId: string) => {
    setForm({
      ...form,
      templates: form.templates.includes(templateId)
        ? form.templates.filter((id) => id !== templateId)
        : [...form.templates, templateId],
    });
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setUploadProgress(0);
      setStatusMessage("");

      const imageFiles = imageItems
        .filter((item) => item.source === "new" && item.file)
        .map((item) => item.file as File);
      const existingImages = imageItems
        .filter((item) => item.source === "existing")
        .map((item) => item.previewUrl);

      const payload = {
        name: form.name.trim(),
        description: form.descriptionHtml.trim(),
        descriptionHtml: form.descriptionHtml,
        images: existingImages,
        thumbnailImage:
          thumbnailIndex >= 0 && imageItems[thumbnailIndex]?.source === "existing"
            ? imageItems[thumbnailIndex].previewUrl
            : undefined,
        thumbnailIndex,
        videoUrl: form.videoUrl.trim() || undefined,
        youtubeLink: form.youtubeLink.trim() || undefined,
        instagramLink: form.instagramLink.trim() || undefined,
        applicableFor: form.applicableFor,
        isVisible: form.isVisible,
        vendorPrice: parseFloat(form.vendorPrice) || 0,
        clientPrice: parseFloat(form.clientPrice) || 0,
        publicPrice: parseFloat(form.publicPrice) || 0,
        price: parseFloat(form.publicPrice) || 0,
        imageFiles,
        videoFile,
      };

      if (product?.id) {
        await editProduct(product.id, payload, (percent) => setUploadProgress(percent));
        setStatusMessage("Product updated successfully");
      } else {
        await createProduct(payload, (percent) => setUploadProgress(percent));
        setStatusMessage("Product created successfully");
      }

      onSave();
    } catch (error) {
      console.error("Failed to save product:", error);
      setStatusMessage((error as Error).message || "Failed to save product");
    }
  };

  return (
    <div className="space-y-6">
      {/* Permission Warning */}
      {!isSuperAdmin && (
        <Alert className="border-amber-200 bg-amber-50">
          <Lock className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            Pricing fields are managed by Super Admin only. You can set visibility and link templates.
          </AlertDescription>
        </Alert>
      )}

      {/* Product Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Product Name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value });
            if (errors.name) setErrors({ ...errors, name: "" });
          }}
          placeholder="Enter product name"
          disabled={isLoading}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Product Description *</Label>
        <Textarea
          id="description"
          value={form.descriptionHtml}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, descriptionHtml: e.target.value }));
            if (errors.description) setErrors((prev) => ({ ...prev, description: "" }));
          }}
          className="min-h-32"
          placeholder="Enter product description"
          disabled={isLoading}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>

      {/* Images Upload */}
      <div className="space-y-3">
        <Label>Product Images *</Label>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (event.dataTransfer.files?.length > 0) {
              addImageFiles(event.dataTransfer.files);
            }
          }}
        >
          <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Drag & drop images here or browse</p>
          <p className="text-xs text-muted-foreground">JPEG, PNG, SVG up to 5MB each</p>
          <Input
            type="file"
            accept="image/jpeg,image/png,image/svg+xml"
            multiple
            className="mt-3"
            onChange={(event) => {
              if (event.target.files) {
                addImageFiles(event.target.files);
              }
              event.currentTarget.value = "";
            }}
            disabled={isLoading}
          />
        </div>

        {imageItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Gallery (pick thumbnail and reorder):</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {imageItems.map((image, index) => (
                <Card key={image.id} className="p-2 space-y-2">
                  <img
                    src={image.previewUrl}
                    alt={`Product image ${index + 1}`}
                    className="w-full h-28 object-cover rounded border border-border"
                  />
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="thumbnail-image"
                        checked={thumbnailId === image.id}
                        onChange={() => setThumbnailId(image.id)}
                      />
                      Thumbnail
                    </label>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" onClick={() => moveImage(index, -1)} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={() => moveImage(index, 1)} disabled={index === imageItems.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="destructive" size="icon" onClick={() => handleRemoveImage(image.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
        {errors.images && <p className="text-xs text-destructive">{errors.images}</p>}
      </div>

      {/* Video */}
      <div className="space-y-2">
        <Label htmlFor="videoUrl">Short Video (Upload file or URL)</Label>
        <Input
          type="file"
          accept="video/*"
          onChange={(event) => handleVideoFileChange(event.target.files?.[0])}
          disabled={isLoading}
        />
        <Input
          id="videoUrl"
          value={form.videoUrl}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
          placeholder="https://example.com/video.mp4"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">Upload supports MP4/WebM/QuickTime up to 50MB</p>
        {videoFilePreview || form.videoUrl ? (
          <video controls className="w-full max-h-56 rounded border border-border">
            <source src={videoFilePreview || form.videoUrl} />
          </video>
        ) : null}
        {errors.videoFile && <p className="text-xs text-destructive">{errors.videoFile}</p>}
      </div>

      {/* YouTube Link */}
      <div className="space-y-2">
        <Label htmlFor="youtubeLink">YouTube Link (Optional)</Label>
        <Input
          id="youtubeLink"
          value={form.youtubeLink}
          onChange={(e) => setForm({ ...form, youtubeLink: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">Share a YouTube video</p>
        {errors.youtubeLink && <p className="text-xs text-destructive">{errors.youtubeLink}</p>}
      </div>

      {/* Instagram Link */}
      <div className="space-y-2">
        <Label htmlFor="instagramLink">Instagram Link (Optional)</Label>
        <Input
          id="instagramLink"
          value={form.instagramLink}
          onChange={(e) => setForm({ ...form, instagramLink: e.target.value })}
          placeholder="https://www.instagram.com/..."
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground">Link to an Instagram post or profile</p>
        {errors.instagramLink && <p className="text-xs text-destructive">{errors.instagramLink}</p>}
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Product Visibility Toggle
        </Label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isVisible}
            onChange={(event) => setForm({ ...form, isVisible: event.target.checked })}
            disabled={isLoading}
          />
          Product is visible in listings
        </label>
      </div>

      {/* Pricing Section - Super Admin Only */}
      {isSuperAdmin && (
        <Card className="p-4 border-primary/50 bg-primary/5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Badge className="bg-primary">Super Admin</Badge>
            Role-Based Pricing
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vendor Price */}
            <div className="space-y-2">
              <Label htmlFor="vendorPrice">Vendor Price (₹) *</Label>
              <Input
                id="vendorPrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.vendorPrice}
                onChange={(e) => {
                  setForm({ ...form, vendorPrice: e.target.value });
                  if (errors.vendorPrice) setErrors({ ...errors, vendorPrice: "" });
                }}
                placeholder="0.00"
                disabled={isLoading}
              />
              {form.vendorPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(parseFloat(form.vendorPrice))}
                </p>
              )}
              {errors.vendorPrice && (
                <p className="text-xs text-destructive">{errors.vendorPrice}</p>
              )}
              <p className="text-xs text-muted-foreground">For vendors/staff</p>
            </div>

            {/* Client Price */}
            <div className="space-y-2">
              <Label htmlFor="clientPrice">Client Price (₹) *</Label>
              <Input
                id="clientPrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.clientPrice}
                onChange={(e) => {
                  setForm({ ...form, clientPrice: e.target.value });
                  if (errors.clientPrice) setErrors({ ...errors, clientPrice: "" });
                }}
                placeholder="0.00"
                disabled={isLoading}
              />
              {form.clientPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(parseFloat(form.clientPrice))}
                </p>
              )}
              {errors.clientPrice && (
                <p className="text-xs text-destructive">{errors.clientPrice}</p>
              )}
              <p className="text-xs text-muted-foreground">For registered clients</p>
            </div>

            {/* Public Price */}
            <div className="space-y-2">
              <Label htmlFor="publicPrice">Public Price (₹) *</Label>
              <Input
                id="publicPrice"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.publicPrice}
                onChange={(e) => {
                  setForm({ ...form, publicPrice: e.target.value });
                  if (errors.publicPrice) setErrors({ ...errors, publicPrice: "" });
                }}
                placeholder="0.00"
                disabled={isLoading}
              />
              {form.publicPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatPrice(parseFloat(form.publicPrice))}
                </p>
              )}
              {errors.publicPrice && (
                <p className="text-xs text-destructive">{errors.publicPrice}</p>
              )}
              <p className="text-xs text-muted-foreground">For public users</p>
            </div>
          </div>

          {/* Pricing Notes */}
          <div className="mt-4 p-3 bg-background rounded border border-border text-sm text-muted-foreground">
            <p>💡 <strong>Pricing Strategy:</strong> Set different prices for different user roles to control margins and access.</p>
          </div>
        </Card>
      )}

      {/* Templates */}
      {templates.length > 0 && (
        <div className="space-y-3">
          <Label>Link Templates (Optional)</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {templates.map((template) => (
              <Card
                key={template.id}
                className={`p-3 cursor-pointer transition-colors ${
                  form.templates.includes(template.id)
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-muted"
                }`}
                onClick={() => handleToggleTemplate(template.id)}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.templates.includes(template.id)}
                    onChange={() => {}}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{template.name}</p>
                    {template.description && (
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Visibility Control */}
      <VisibilityControl
        selected={form.applicableFor}
        onChange={(applicableFor) => {
          setForm({ ...form, applicableFor });
          if (errors.visibleTo) setErrors({ ...errors, visibleTo: "" });
        }}
        disabled={isLoading}
      />
      {errors.visibleTo && <p className="text-xs text-destructive">{errors.visibleTo}</p>}

      {(uploadProgress > 0 || statusMessage) && (
        <Alert className={statusMessage.includes("success") ? "border-green-300 bg-green-50" : ""}>
          {statusMessage.includes("success") ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <ImagePlus className="h-4 w-4" />}
          <AlertDescription>
            {uploadProgress > 0 && uploadProgress < 100 ? `Uploading media... ${uploadProgress}%` : statusMessage || "Ready"}
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-border">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Saving..." : product ? "Update Product" : "Create Product"}
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outline"
          disabled={isLoading}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

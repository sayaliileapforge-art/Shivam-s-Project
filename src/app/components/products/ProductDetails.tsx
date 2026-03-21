import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { ImageGallery } from "./ImageGallery";
import { ExternalLink, Play, DollarSign } from "lucide-react";
import { Product } from "../../../lib/productStore";
import { useRbac } from "../../../lib/rbac";
import { getPriceByRole, formatPrice, getRoleDisplayName } from "../../../lib/pricingUtils";

interface ProductDetailsProps {
  product: Product;
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const { user } = useRbac();
  const displayPrice = getPriceByRole(product, user?.role || null);
  const userRoleDisplay = getRoleDisplayName(user?.role || null);

  return (
    <div className="space-y-6">
      {/* Price Display */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Your Price ({userRoleDisplay})</p>
            <p className="text-3xl font-bold text-primary">{formatPrice(displayPrice)}</p>
          </div>
          <DollarSign className="h-12 w-12 text-primary/30" />
        </div>
      </Card>
      {/* Image Gallery */}
      {product.images && product.images.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Product Images</h3>
          <ImageGallery images={product.images} />
        </div>
      )}

      {/* Description */}
      {product.description && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Description</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {product.description}
          </p>
        </div>
      )}

      {/* Videos Section */}
      {(product.videoUrl || product.youtubeLink) && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Videos</h3>

          {/* Uploaded Video */}
          {product.videoUrl && (
            <Card className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <Play className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Uploaded Video</p>
                  <p className="text-xs text-muted-foreground">
                    {product.videoUrl}
                  </p>
                </div>
              </div>
              <video
                src={product.videoUrl}
                controls
                className="w-full max-h-96 rounded bg-muted"
              >
                Your browser does not support the video tag.
              </video>
            </Card>
          )}

          {/* YouTube Video */}
          {product.youtubeLink && (
            <Card className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <Play className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium">YouTube Video</p>
                  <a
                    href={product.youtubeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {product.youtubeLink}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              {/* YouTube Embed */}
              <div className="aspect-video bg-muted rounded overflow-hidden">
                <iframe
                  width="100%"
                  height="100%"
                  src={getYoutubeEmbedUrl(product.youtubeLink)}
                  title="YouTube video"
                  allowFullScreen
                  className="border-0"
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Social Links */}
      {product.instagramLink && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Social Media</h3>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-gradient-to-br from-pink-600 via-red-600 to-yellow-500 rounded-full flex-shrink-0 flex items-center justify-center">
                <span className="text-white text-xs font-bold">📷</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Instagram</p>
                <a
                  href={product.instagramLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View on Instagram
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Visibility Info */}
      <div className="space-y-3 pt-4 border-t border-border">
        <h3 className="text-sm font-semibold">Visibility</h3>
        <div className="flex flex-wrap gap-2">
          {product.visibleTo && product.visibleTo.length > 0 ? (
            product.visibleTo.map((visibility: string) => (
              <Badge key={visibility} variant="secondary">
                {visibility}
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No visibility settings</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Converts YouTube URLs to embed format
 * Supports: https://youtu.be/videoId, https://www.youtube.com/watch?v=videoId
 */
function getYoutubeEmbedUrl(url: string): string {
  try {
    let videoId = "";

    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    } else if (url.includes("youtube.com/watch")) {
      const urlParams = new URLSearchParams(url.split("?")[1]);
      videoId = urlParams.get("v") || "";
    }

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }
  } catch (e) {
    console.error("Failed to parse YouTube URL:", url);
  }

  return url;
}

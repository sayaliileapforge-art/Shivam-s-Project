import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "../ui/button";
import { ProductTemplate } from "../../../lib/productStore";

interface TemplateShowcaseProps {
  templates: ProductTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onOrderNow: () => void;
  isLoading?: boolean;
}

export function TemplateShowcase({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onOrderNow,
  isLoading = false,
}: TemplateShowcaseProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!templates || templates.length === 0) {
    return (
      <div className="w-full bg-muted rounded-lg flex items-center justify-center py-12">
        <p className="text-muted-foreground">No templates available for this product</p>
      </div>
    );
  }

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320; // Card width + gap
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Available Templates</h3>

      <div className="relative">
        {/* Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-4 scroll-smooth scrollbar-hide"
          style={{ scrollBehavior: "smooth" }}
        >
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex-shrink-0 w-80 group cursor-pointer"
              onClick={() => onSelectTemplate(template.id)}
            >
              {/* Template Card */}
              <div
                className={`relative border-4 rounded-lg overflow-hidden transition-all ${
                  selectedTemplateId === template.id
                    ? "border-primary shadow-lg scale-105"
                    : "border-muted hover:border-muted-foreground"
                }`}
              >
                {/* Preview Image */}
                <div className="bg-muted h-48 overflow-hidden">
                  <img
                    src={template.previewImageUrl}
                    alt={template.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='192'%3E%3Crect fill='%23f3f4f6' width='320' height='192'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%236b7280' font-size='14'%3EPreview not available%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>

                {/* Template Info */}
                <div className="p-4 bg-card border-t border-border">
                  <h4 className="font-semibold text-sm line-clamp-1">
                    {template.name}
                  </h4>
                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {template.description}
                    </p>
                  )}
                </div>

                {/* Selection Badge */}
                {selectedTemplateId === template.id && (
                  <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-1">
                    <Check className="h-5 w-5" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Buttons */}
        {templates.length > 3 && (
          <>
            <button
              onClick={() => scroll("left")}
              className="absolute left-0 top-1/3 -translate-y-1/2 -translate-x-4 bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-full shadow-md transition-colors z-10"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="absolute right-0 top-1/3 -translate-y-1/2 translate-x-4 bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-full shadow-md transition-colors z-10"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Selection Summary & Action Button */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          {selectedTemplateId ? (
            <>
              <Check className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-600">
                Template Selected
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Select a template to continue
            </span>
          )}
        </div>
        <Button
          onClick={onOrderNow}
          disabled={!selectedTemplateId || isLoading}
          size="lg"
          className="gap-2"
        >
          {isLoading ? "Processing..." : "Order Now"}
        </Button>
      </div>
    </div>
  );
}

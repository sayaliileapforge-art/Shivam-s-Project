import React, { useState, useRef } from "react";
import { Search, Grid3x3, List, X } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  SHAPES_GALLERY,
  GALLERY_CATEGORIES,
  getGalleryItems,
  searchGalleryItems,
  type ShapeItem,
} from "../../../lib/shapesGallery";

export interface ShapesGalleryProps {
  onSelectItem: (item: ShapeItem) => void;
  onDragStart?: (item: ShapeItem, e: React.DragEvent<HTMLDivElement>) => void;
  isOpen: boolean;
  onClose: () => void;
}

function normalizePreviewMarkup(preview: string): string {
  const trimmed = preview.trim();
  if (!trimmed) return "";
  if (!/^<svg\b/i.test(trimmed)) return "";

  const withXmlns = /<svg\b[^>]*xmlns=/i.test(trimmed)
    ? trimmed
    : trimmed.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');

  return withXmlns.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
    let next = String(attrs || "");
    if (!/\bviewBox\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' viewBox="0 0 24 24"';
    }
    if (!/\bwidth\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' width="24"';
    }
    if (!/\bheight\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' height="24"';
    }
    return `<svg${next}>`;
  });
}

/**
 * Gallery Item Component - displays individual shape/icon
 */
function GalleryItemCard({
  item,
  onSelect,
  onDragStart,
}: {
  item: ShapeItem;
  onSelect: (item: ShapeItem) => void;
  onDragStart?: (item: ShapeItem, e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(item, e)}
      onClick={() => onSelect(item)}
      className="aspect-square flex flex-col items-center justify-center p-2 rounded-lg border border-border hover:border-primary hover:bg-accent cursor-pointer transition-all group active:scale-95"
      title={item.label}
    >
      {/* Preview Content */}
      {item.preview ? (
        <div className="w-8 h-8 mb-1 text-muted-foreground group-hover:text-foreground transition-colors flex items-center justify-center">
          <div
            className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:overflow-visible [&>svg]:[color:currentColor] [&>svg_*]:stroke-current"
            dangerouslySetInnerHTML={{ __html: normalizePreviewMarkup(item.preview) }}
          />
        </div>
      ) : (
        <div className="w-8 h-8 mb-1 bg-muted rounded group-hover:bg-accent transition-colors flex items-center justify-center">
          <Grid3x3 className="w-4 h-4 text-muted-foreground" />
        </div>
      )}

      {/* Label */}
      <span className="text-[11px] font-medium text-center line-clamp-2 text-muted-foreground group-hover:text-foreground">
        {item.label}
      </span>

      {/* Badge for shape type */}
      {item.type === "shape" && (
        <span className="mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
          Shape
        </span>
      )}
      {item.type === "icon" && (
        <span className="mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-600">
          Icon
        </span>
      )}
    </div>
  );
}

/**
 * Shapes Gallery Component
 * Displays organized gallery of shapes, icons, and design elements
 */
export function ShapesGallery({
  onSelectItem,
  onDragStart,
  isOpen,
  onClose,
}: ShapesGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get items based on active category and search
  const galleryItems =
    searchQuery.trim().length > 0
      ? searchGalleryItems(searchQuery)
      : getGalleryItems(activeCategory === "all" ? undefined : activeCategory);

  const categories = GALLERY_CATEGORIES();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-popover border rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 p-4 border-b space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Shapes & Icons Gallery</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder="Search shapes, icons..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="text-xs"
              >
                Clear
              </Button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {galleryItems.length} item{galleryItems.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-1 bg-muted p-0.5 rounded">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("grid")}
              >
                <Grid3x3 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2"
                onClick={() => setViewMode("list")}
              >
                <List className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Categories Sidebar */}
          <div className="w-40 shrink-0 border-r bg-muted/30">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1">
                {categories.map((cat: any) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setSearchQuery("");
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      activeCategory === cat.id
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{cat.label}</span>
                    <span className="text-xs ml-2 opacity-70">{cat.count}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Gallery Grid/List */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-4">
                {galleryItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-muted-foreground text-sm">No items found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Try adjusting your search or category
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-4 gap-2 auto-rows-max">
                    {galleryItems.map((item: ShapeItem) => (
                      <GalleryItemCard
                        key={item.id}
                        item={item}
                        onSelect={() => {
                          onSelectItem(item);
                          onClose();
                        }}
                        onDragStart={onDragStart}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {galleryItems.map((item: ShapeItem) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => onDragStart?.(item, e)}
                        onClick={() => {
                          onSelectItem(item);
                          onClose();
                        }}
                        className="p-3 rounded-lg border border-border hover:border-primary hover:bg-accent cursor-pointer transition-all flex items-center gap-3 group"
                      >
                        {/* Icon Preview */}
                        {item.preview ? (
                          <div className="w-6 h-6 text-muted-foreground group-hover:text-foreground flex-shrink-0">
                            <div
                              className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:overflow-visible [&>svg]:[color:currentColor] [&>svg_*]:stroke-current"
                              dangerouslySetInnerHTML={{ __html: normalizePreviewMarkup(item.preview) }}
                            />
                          </div>
                        ) : (
                          <div className="w-6 h-6 bg-muted rounded flex-shrink-0" />
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.label}
                          </p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Badge */}
                        <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                          {item.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer Info */}
        <div className="shrink-0 px-4 py-3 border-t text-xs text-muted-foreground bg-muted/20">
          <p>
            💡 <strong>Tip:</strong> Click to insert, or drag & drop onto canvas.
            Use search to find items quickly.
          </p>
        </div>
      </div>
    </div>
  );
}

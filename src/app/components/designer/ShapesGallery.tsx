import React, { useState, useRef } from "react";
import { Search, Grid3x3, List, X } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  GALLERY_CATEGORIES,
  getGalleryItems,
  searchGalleryItems,
  normalizeShapePreviewSvg,
  type ShapeItem,
} from "../../../lib/shapesGallery";

export interface CustomShapeConfig {
  kind: "polygon" | "star";
  sidesOrPoints: number;
}

export interface ShapesGalleryProps {
  onSelectItem: (item: ShapeItem) => void;
  onCreateCustomShape?: (shape: CustomShapeConfig) => void;
  onDragStart?: (item: ShapeItem, e: React.DragEvent<HTMLDivElement>) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface CustomShapePreset {
  id: string;
  label: string;
  kind: "polygon" | "star";
  sidesOrPoints: number;
  preview: string;
}

const CUSTOM_SHAPE_PRESETS: CustomShapePreset[] = [
  { id: "poly-3", label: "Triangle", kind: "polygon", sidesOrPoints: 3, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='12,4 20,19 4,19'/></svg>" },
  { id: "poly-4", label: "Diamond", kind: "polygon", sidesOrPoints: 4, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='12,3 21,12 12,21 3,12'/></svg>" },
  { id: "poly-5", label: "Pentagon", kind: "polygon", sidesOrPoints: 5, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='12,3 20,9 17,20 7,20 4,9'/></svg>" },
  { id: "poly-6", label: "Hexagon", kind: "polygon", sidesOrPoints: 6, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='7,4 17,4 22,12 17,20 7,20 2,12'/></svg>" },
  { id: "poly-8", label: "Octagon", kind: "polygon", sidesOrPoints: 8, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8'/></svg>" },
  { id: "star-4", label: "Star 4", kind: "star", sidesOrPoints: 4, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M12 3 14.5 9.5 21 12 14.5 14.5 12 21 9.5 14.5 3 12 9.5 9.5z'/></svg>" },
  { id: "star-5", label: "Star 5", kind: "star", sidesOrPoints: 5, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='m12 3 2.8 5.8L21 9.8l-4.5 4.3 1 6.1L12 17.2 6.5 20.2l1-6.1L3 9.8l6.2-1z'/></svg>" },
  { id: "star-6", label: "Star 6", kind: "star", sidesOrPoints: 6, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M12 3 14.2 8.4 20 9.2 15.8 13 17.1 19 12 15.9 6.9 19 8.2 13 4 9.2 9.8 8.4z'/></svg>" },
  { id: "star-8", label: "Star 8", kind: "star", sidesOrPoints: 8, preview: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M12 2.5 13.8 7l4.7.5-3.6 3 1.1 4.6-4-2.5-4 2.5 1.1-4.6-3.6-3 4.7-.5z'/></svg>" },
];

function getFallbackShapePreview(item: ShapeItem): string {
  switch (item.id) {
    case "shape-rectangle":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><rect x='4' y='6' width='16' height='12'/></svg>";
    case "shape-circle":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><circle cx='12' cy='12' r='7'/></svg>";
    case "shape-triangle":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='12,4 20,19 4,19'/></svg>";
    case "shape-line":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><line x1='4' y1='12' x2='20' y2='12'/></svg>";
    case "shape-polygon":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='12,3 20,9 17,20 7,20 4,9'/></svg>";
    case "shape-star":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='m12 3 2.8 5.8L21 9.8l-4.5 4.3 1 6.1L12 17.2 6.5 20.2l1-6.1L3 9.8l6.2-1z'/></svg>";
    case "shape-hexagon":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><polygon points='7,4 17,4 22,12 17,20 7,20 2,12'/></svg>";
    case "shape-rounded-rect":
      return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><rect x='4' y='6' width='16' height='12' rx='4' ry='4'/></svg>";
    default:
      return "";
  }
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
  const previewMarkup = item.preview
    ? normalizeShapePreviewSvg(item.preview)
    : normalizeShapePreviewSvg(getFallbackShapePreview(item));

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(item, e)}
      onClick={() => onSelect(item)}
      className="aspect-square flex flex-col items-center justify-center p-2 rounded-lg border border-border hover:border-primary hover:bg-accent cursor-pointer transition-all group active:scale-95"
      title={item.label}
    >
      {/* Preview Content */}
      {previewMarkup ? (
        <div className="w-8 h-8 mb-1 text-muted-foreground group-hover:text-foreground transition-colors flex items-center justify-center">
          <div
            className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:overflow-visible [&>svg]:[color:currentColor] [&>svg_*]:stroke-current"
            dangerouslySetInnerHTML={{ __html: previewMarkup }}
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
  onCreateCustomShape,
  onDragStart,
  isOpen,
  onClose,
}: ShapesGalleryProps) {
  const [activeTab, setActiveTab] = useState<"gallery" | "custom">("gallery");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [customShapeKind, setCustomShapeKind] = useState<"polygon" | "star">("polygon");
  const [customShapeSidesOrPoints, setCustomShapeSidesOrPoints] = useState(6);
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
      <div className="bg-popover border rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
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

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "gallery" | "custom")}> 
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "gallery" ? (
            <div className="h-full min-h-0 flex overflow-hidden">
              <div className="w-40 shrink-0 border-r bg-muted/30 min-h-0 overflow-y-auto">
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
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="p-4">
                  {galleryItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-muted-foreground text-sm">No items found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Try adjusting your search or category
                    </p>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-4 gap-2 auto-rows-max pb-4">
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
                  <div className="space-y-2 pb-4">
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
                        {(item.preview || getFallbackShapePreview(item)) ? (
                          <div className="w-6 h-6 text-muted-foreground group-hover:text-foreground flex-shrink-0">
                            <div
                              className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:overflow-visible [&>svg]:[color:currentColor] [&>svg_*]:stroke-current"
                              dangerouslySetInnerHTML={{
                                __html: normalizeShapePreviewSvg(item.preview || getFallbackShapePreview(item)),
                              }}
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
              </div>
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-y-auto p-4 space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Shape Type</Label>
                    <Select
                      value={customShapeKind}
                      onValueChange={(value) => setCustomShapeKind(value as "polygon" | "star")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="polygon">Polygon</SelectItem>
                        <SelectItem value="star">Star</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{customShapeKind === "polygon" ? "Sides" : "Points"}</Label>
                    <Input
                      type="number"
                      min={3}
                      max={12}
                      className="h-8 text-xs"
                      value={customShapeSidesOrPoints}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = Number(e.target.value || 0);
                        setCustomShapeSidesOrPoints(Math.max(3, Math.min(12, Number.isFinite(next) ? next : 3)));
                      }}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    onCreateCustomShape?.({ kind: customShapeKind, sidesOrPoints: customShapeSidesOrPoints });
                    onClose();
                  }}
                  disabled={!onCreateCustomShape}
                >
                  Insert Custom Shape
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2 auto-rows-max pb-4">
                {CUSTOM_SHAPE_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => {
                      onCreateCustomShape?.({ kind: preset.kind, sidesOrPoints: preset.sidesOrPoints });
                      onClose();
                    }}
                    className="aspect-square flex flex-col items-center justify-center p-2 rounded-lg border border-border hover:border-primary hover:bg-accent cursor-pointer transition-all group active:scale-95"
                    title={`${preset.label} (${preset.sidesOrPoints})`}
                  >
                    <div className="w-8 h-8 mb-1 text-muted-foreground group-hover:text-foreground transition-colors flex items-center justify-center">
                      <div
                        className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block [&>svg]:overflow-visible [&>svg]:[color:currentColor] [&>svg_*]:stroke-current"
                        dangerouslySetInnerHTML={{ __html: normalizeShapePreviewSvg(preset.preview) }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-center line-clamp-2 text-muted-foreground group-hover:text-foreground">
                      {preset.label}
                    </span>
                    <span className="mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      {preset.sidesOrPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

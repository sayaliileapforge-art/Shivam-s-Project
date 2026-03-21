# Shapes & Icons Gallery - Developer Guide

## Quick Start

### Opening the Gallery
```tsx
// Automatically opens via toolbar button click in DesignerStudio
// Click "Shapes" icon in left toolbar → Gallery modal opens
```

### Gallery Structure

```
ShapesGallery (Modal)
├─ Header (Search + View Toggle)
├─ Sidebar (Categories)
├─ Grid/List View (Items)
└─ Footer (Tips)
```

### Adding Items Programmatically

```tsx
// Via click in gallery
canvasRef.current?.addShapeFromGallery("shape-rectangle");

// Direct shape methods
canvasRef.current?.addRect();
canvasRef.current?.addCircle();
canvasRef.current?.addTriangle();
canvasRef.current?.addPolygon(5);      // Pentagon
canvasRef.current?.addStar(5);         // 5-pointed star
canvasRef.current?.addHexagon();
canvasRef.current?.addRoundedRect();
canvasRef.current?.addSVG(svgString);  // SVG icon
```

## File Organization

```
src/
├─ lib/
│  └─ shapesGallery.ts           # Definitions & utilities
├─ app/
│  ├─ pages/
│  │  └─ DesignerStudio.tsx     # Gallery integration
│  └─ components/
│     └─ designer/
│        ├─ FabricCanvas.tsx     # Shape drawing methods
│        └─ ShapesGallery.tsx    # Gallery component
└─ SHAPES_GALLERY_TESTING.md     # Testing guide
```

## Key Types

### ShapeItem
```tsx
interface ShapeItem {
  id: string;                    // Unique ID
  label: string;                 // Display name
  category: "basic" | "arrows" | "symbols" | "decorative" | "social" | "ui";
  type: "shape" | "icon" | "svg";
  preview?: string;              // SVG string for rendering
  description?: string;          // Optional description
}
```

### Gallery Hooks
```tsx
// Hook gallery item selection
const handleSelectItem = (item: ShapeItem) => {
  if (item.type === "shape") {
    canvasRef.current?.addShapeFromGallery(item.id);
  } else if (item.type === "icon" && item.preview) {
    canvasRef.current?.addSVG(item.preview);
  }
};
```

## Available Shapes & Icons

### Basic Shapes (8 items)
- **Rectangle** - Indigo with rounded corners
- **Circle** - Green
- **Triangle** - Purple
- **Line** - Gray
- **Polygon** - Blue pentagon
- **Star** - Orange
- **Hexagon** - Pink
- **Rounded Rectangle** - Cyan

### Arrows (5 items)
- Right, Left, Up, Down, Diagonal

### Symbols (6 items)
- Checkmark, Cross, Plus, Minus, Star, Heart

### Decorative (5 items)
- Horizontal line, Dot divider, Left/Right brackets, Flourish

### Social Icons (4 items)
- Facebook, Twitter, Instagram, LinkedIn

### UI Elements (5 items)
- Button, Badge, Tag, Search Icon, Menu Icon

## Customization

### Adding New Shapes
1. Add to `BASIC_SHAPES` or relevant category in `shapesGallery.ts`
2. Update `addShapeFromGallery()` mapping in FabricCanvas
3. Implement shape drawing method if needed

```tsx
// Example
export const BASIC_SHAPES: ShapeItem[] = [
  {
    id: "shape-new",
    label: "New Shape",
    category: "basic",
    type: "shape",
    description: "My new shape"
  },
  // ... add to addShapeFromGallery mapping
];
```

### Adding New Icons
1. Add to appropriate category array with SVG preview
2. SVG string format:
```tsx
{
  id: "icon-custom",
  label: "Custom Icon",
  category: "symbols",
  type: "icon",
  preview: `<svg viewBox="0 0 24 24" ...>...</svg>`
}
```

### Styling Modifications

#### Gallery Modal Styling
```tsx
// src/app/components/designer/ShapesGallery.tsx
// Line ~75: className="fixed inset-0 bg-black/50 z-40"  // Backdrop opacityLine ~76: className="bg-popover border rounded-xl"           // Modal styling
```

#### Shape Colors
```tsx
// src/app/components/designer/FabricCanvas.tsx
// Each shape has customizable fill and stroke
fill: "rgba(99,102,241,0.15)",  // Light indigo
stroke: "#6366f1",              // Dark indigo
strokeWidth: 1.5
```

## Events & Handlers

### Gallery Selection
```tsx
// In DesignerStudio.tsx
const handleGalleryItemSelect = (item: ShapeItem) => {
  // Called when user clicks or drag-drops an item
  // Automatically adds shape and closes gallery
  // Switches to select tool
};
```

### Drag-Drop
```tsx
// Triggered when user drags item from gallery onto canvas
// Event listeners in FabricCanvas useEffect (~line 652)
// Handlers:
// - handleDragOver: Visual feedback
// - handleDragLeave: Cleanup
// - handleDrop: Add shape at position
```

## Performance Tips

1. **Lazy Loading**: Gallery items rendered on demand
2. **SVG Optimization**: Use lightweight SVG paths
3. **Batch Operations**: Group multiple adds in single render cycle
4. **Caching**: Gallery data (shapesGallery.ts) remains in memory

## Testing Checklist (Quick)

```tsx
// Category filtering
✓ Click each category - items update
✓ Item count is correct per category

// Search
✓ Type "arrow" - 5 items show
✓ Type "heart" - 1 item shows
✓ Clear button works

// Insert
✓ Click rectangle - appears on canvas
✓ Click icon - SVG renders

// Drag-drop
✓ Drag shape - visual feedback
✓ Drop - shape added at position

// Layers
✓ New shapes appear in layers panel
✓ Shapes have unique names
✓ Can lock/unlock/delete

// Export
✓ Gallery shapes export to PNG/PDF
```

## Troubleshooting

### Gallery doesn't open
- Check browser console for import errors
- Verify ShapesGallery component is imported in DesignerStudio
- Check z-index conflicts

### Shapes don't appear
- Verify canvas is initialized
- Check if shape is within canvas bounds
- Try adding at margin-based position (mmToPx)

### Drag-drop not working
- Browser must support HTML5 drag-drop
- Check event listeners attached correctly
- Verify dataTransfer contains valid JSON

### Performance issues
- Reduce number of items in gallery
- Optimize SVG paths (simplify)
- Profile with DevTools Performance tab

## API Reference

### FabricCanvasHandle Methods

```tsx
// New methods
addTriangle(): void
addPolygon(sides?: number): void     // Default: 5
addStar(points?: number): void       // Default: 5
addHexagon(): void
addRoundedRect(): void
addShapeFromGallery(shapeId: string): void

// Existing methods still available
addRect(): void
addCircle(): void
addLine(): void
addText(): void
addImage(dataUrl: string): void
addCurvedText(opts?: CurvedTextOpts): void
```

### Utility Functions (shapesGallery.ts)

```tsx
// Get all items for category
getGalleryItems(category?: string): ShapeItem[]

// Search items
searchGalleryItems(query: string): ShapeItem[]

// Get item by ID
getGalleryItem(id: string): ShapeItem | undefined

// Get categories list
GALLERY_CATEGORIES(): Category[]
```

## Code Examples

### Insert shape programmatically
```tsx
// In a component with canvas ref
canvasRef.current?.addRect();
const layers = canvasRef.current?.getLayers();
console.log("Total layers:", layers?.length);
```

### Search gallery items
```tsx
import { searchGalleryItems } from "@/lib/shapesGallery";

const results = searchGalleryItems("star");
// Returns all items with "star" in label or description
```

### Filter by category
```tsx
import { getGalleryItems } from "@/lib/shapesGallery";

const arrows = getGalleryItems("arrows");
// Returns 5 arrow icons
```

## Links & Resources

- **Component**: `src/app/components/designer/ShapesGallery.tsx`
- **Definitions**: `src/lib/shapesGallery.ts`
- **Canvas Integration**: `src/app/components/designer/FabricCanvas.tsx`
- **Studio Page**: `src/app/pages/DesignerStudio.tsx`
- **Testing Guide**: `SHAPES_GALLERY_TESTING.md`
- **Fabric.js Docs**: https://fabricjs.com/docs/
- **SVG Reference**: https://developer.mozilla.org/en-US/docs/Web/SVG

## Version History

**v1.0** - March 18, 2026
- Initial implementation
- 30+ shapes and icons
- Full gallery UI
- Drag-drop support
- Layer integration

---

**Status**: ✅ Production Ready  
**Last Updated**: March 18, 2026  
**Maintainer**: Enterprise SaaS Admin Portal Team

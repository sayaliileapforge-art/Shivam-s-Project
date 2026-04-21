import { useRef, useState } from "react";
import { Upload, X, ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface Props {
  /** The variable key this placeholder is bound to, e.g. "photo", "logo". */
  fieldKey: string;
  /** Current image data URL or remote URL, or null if no image uploaded yet. */
  currentValue?: string | null;
  /** Called when the user uploads or clears an image. null = cleared. */
  onImageChange: (fieldKey: string, dataUrl: string | null) => void;
}

/**
 * Right-panel section shown when an image-variable placeholder is selected on
 * the canvas.  Lets the user upload a preview image for that variable so it
 * renders correctly on the canvas and in exports.
 */
export function VariableImageUploadPanel({ fieldKey, currentValue, onImageChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // ── File helpers ────────────────────────────────────────────────────────────

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Not an image file"));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) resolve(result);
        else reject(new Error("Failed to read file"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onImageChange(fieldKey, dataUrl);
    } catch {
      // non-image file — silently ignore
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5 text-sky-600" />
          <span className="text-xs font-semibold text-foreground">Image Variable</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
          {`{{${fieldKey}}}`}
        </span>
      </div>

      {/* Preview or Drop Zone */}
      {currentValue ? (
        <div className="relative rounded-md overflow-hidden border border-border group bg-muted/30">
          <img
            src={currentValue}
            alt={fieldKey}
            className="w-full object-contain max-h-36"
          />
          <button
            type="button"
            onClick={() => onImageChange(fieldKey, null)}
            title="Remove image"
            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          className={[
            "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md py-6 cursor-pointer transition-colors select-none",
            dragging
              ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
              : "border-border hover:border-sky-400 hover:bg-accent/50",
          ].join(" ")}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-center px-2">
            Drop image here or{" "}
            <span className="text-sky-600 font-medium">click to upload</span>
          </p>
          <p className="text-[10px] text-muted-foreground/70">PNG, JPG, SVG, WebP</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          {currentValue ? (
            <>
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Replace
            </>
          ) : (
            <>
              <Upload className="h-3 w-3 mr-1.5" />
              Upload Image
            </>
          )}
        </Button>

        {currentValue && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onImageChange(fieldKey, null)}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        This image is used for canvas preview and export. During CSV bulk export,
        each row&apos;s value overrides this upload.
      </p>
    </div>
  );
}

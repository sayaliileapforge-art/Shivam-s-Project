import { useEffect, useMemo, useState } from "react";
import { Search, Globe, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { getTemplates, resolveTemplatePreview, type TemplateRecord } from "../../lib/templateApi";

export function TemplateGallery() {
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getTemplates()
      .then((data) => setTemplates(data))
      .catch((err) => setError((err as Error).message || "Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  const publicTemplates = useMemo(
    () => templates.filter((t) => t.isActive !== false),
    [templates]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publicTemplates;
    return publicTemplates.filter((t) => {
      return (
        t.templateName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [publicTemplates, query]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Template Gallery</h1>
        <p className="text-muted-foreground">
          Browse public templates, open any design, customize it in Designer Studio, and save as a new template.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, type, or audience"
              className="pl-9"
            />
          </div>
          {error ? (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {loading ? "Loading templates..." : "No public templates found."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t._id} className="overflow-hidden">
              <div className="relative h-44 bg-muted">
                {t.preview_image || t.previewImageUrl ? (
                  <img
                    src={resolveTemplatePreview(t)}
                    alt={t.templateName}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No preview
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  {t.isActive !== false ? (
                    <Badge className="gap-1">
                      <Globe className="h-3 w-3" /> Public
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="h-3 w-3" /> Private
                    </Badge>
                  )}
                </div>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="line-clamp-1 text-base">{t.templateName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{t.category}</Badge>
                  {t.tags?.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

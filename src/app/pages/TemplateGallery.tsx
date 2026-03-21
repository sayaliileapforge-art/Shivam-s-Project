import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Palette, Globe, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { loadAllProjectTemplates } from "../../lib/projectStore";
import { DESIGNER_CONTEXT_KEY } from "../../lib/fabricUtils";

const DESIGNER_IMPORT_MODE_KEY = "vendor_designer_import_mode";

export function TemplateGallery() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const templates = useMemo(() => loadAllProjectTemplates(), []);
  const publicTemplates = useMemo(() => templates.filter((t) => t.isPublic !== false), [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publicTemplates;
    return publicTemplates.filter((t) => {
      return (
        t.templateName.toLowerCase().includes(q) ||
        t.templateType.toLowerCase().includes(q) ||
        (t.applicableFor || "").toLowerCase().includes(q)
      );
    });
  }, [publicTemplates, query]);

  const openInDesigner = (templateId: string, projectId: string, templateName: string) => {
    localStorage.setItem(
      DESIGNER_CONTEXT_KEY,
      JSON.stringify({
        projectId,
        templateId,
        templateName,
      })
    );
    localStorage.setItem(DESIGNER_IMPORT_MODE_KEY, "true");
    navigate("/designer-studio");
  };

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
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No public templates found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <div className="relative h-44 bg-muted">
                {t.thumbnail ? (
                  <img src={t.thumbnail} alt={t.templateName} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No preview
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  {t.isPublic !== false ? (
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
                  <Badge variant="secondary">{t.templateType}</Badge>
                  {t.applicableFor ? <Badge variant="outline">{t.applicableFor}</Badge> : null}
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => openInDesigner(t.id, t.projectId, t.templateName)}
                >
                  <Palette className="h-4 w-4" /> Open and Customize
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

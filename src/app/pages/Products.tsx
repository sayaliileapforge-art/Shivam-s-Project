import { useState } from "react";
import { Plus, Search, Edit, Trash2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

interface Product {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  vendorPrice: number;
}

const CATEGORIES = [
  "Photo Book",
  "ID Card",
  "Year Book",
  "Calendar",
  "Certificate",
  "Diary",
  "Album",
  "Other",
];

const emptyForm = { name: "", category: "", basePrice: "", vendorPrice: "" };

export function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = products.filter((p) =>
    [p.name, p.category, p.id].some((v) =>
      v.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleAdd = () => {
    if (!form.name || !form.category || !form.basePrice || !form.vendorPrice) return;
    const newProduct: Product = {
      id: `PRD-${String(products.length + 1).padStart(3, "0")}`,
      name: form.name,
      category: form.category,
      basePrice: Number(form.basePrice),
      vendorPrice: Number(form.vendorPrice),
    };
    setProducts((prev) => [...prev, newProduct]);
    setForm(emptyForm);
    setIsAddOpen(false);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: product.category,
      basePrice: String(product.basePrice),
      vendorPrice: String(product.vendorPrice),
    });
    setIsEditOpen(true);
  };

  const handleEdit = () => {
    if (!form.name || !form.category || !form.basePrice || !form.vendorPrice) return;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === editingId
          ? { ...p, name: form.name, category: form.category, basePrice: Number(form.basePrice), vendorPrice: Number(form.vendorPrice) }
          : p
      )
    );
    setForm(emptyForm);
    setEditingId(null);
    setIsEditOpen(false);
  };

  const handleDelete = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Products & Pricing</h1>
          <p className="text-muted-foreground mt-1">Manage product catalog and pricing</p>
        </div>

        {/* ── Add Product Dialog ── */}
        <Dialog open={isAddOpen} onOpenChange={(o) => { setIsAddOpen(o); if (!o) setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-2">
                <Label>Product Name *</Label>
                <Input
                  placeholder="e.g. A4 Photo Book"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Base Price (₹) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  min={0}
                  value={form.basePrice}
                  onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor Price (₹) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  min={0}
                  value={form.vendorPrice}
                  onChange={(e) => setForm({ ...form, vendorPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setIsAddOpen(false); setForm(emptyForm); }}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={!form.name || !form.category || !form.basePrice || !form.vendorPrice}>
                Add Product
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Search ── */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ── */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Product Catalog</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Package className="h-12 w-12 opacity-30" />
              <p className="text-sm">No products yet. Click <strong>Add Product</strong> to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Base Price</TableHead>
                  <TableHead>Vendor Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.id}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell>₹{product.basePrice.toLocaleString()}</TableCell>
                    <TableCell>₹{product.vendorPrice.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="gap-2" onClick={() => openEdit(product)}>
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Product Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={(o) => { setIsEditOpen(o); if (!o) { setForm(emptyForm); setEditingId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
              <Label>Product Name *</Label>
              <Input
                placeholder="e.g. A4 Photo Book"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base Price (₹) *</Label>
              <Input
                type="number"
                placeholder="0"
                min={0}
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor Price (₹) *</Label>
              <Input
                type="number"
                placeholder="0"
                min={0}
                value={form.vendorPrice}
                onChange={(e) => setForm({ ...form, vendorPrice: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setIsEditOpen(false); setForm(emptyForm); setEditingId(null); }}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={!form.name || !form.category || !form.basePrice || !form.vendorPrice}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

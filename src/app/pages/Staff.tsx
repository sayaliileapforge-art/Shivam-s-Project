import { useState, useRef } from "react";
import {
  UserCog, Plus, Trash2, Edit, Search, TrendingUp,
  Phone, Mail, MapPin, X, Camera, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";
import {
  loadStaff, addStaffMember, updateStaffMember, deleteStaffMember,
  type StaffMember, type StaffRole,
} from "../../lib/staffStore";

const ROLES: StaffRole[] = ["Staff", "Salesperson", "Credit_manager", "Accounts", "Admin"];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh",
];

const emptyForm = {
  fullName: "", email: "", contact: "", role: "Staff" as StaffRole,
  address: "", pincode: "", city: "", state: "", district: "", photo: "",
};

const ROLE_COLORS: Record<StaffRole, string> = {
  Staff: "secondary",
  Salesperson: "default",
  Credit_manager: "outline",
  Accounts: "outline",
  Admin: "destructive",
};

export function Staff() {
  const [members, setMembers] = useState<StaffMember[]>(() => loadStaff());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [viewMember, setViewMember] = useState<StaffMember | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setMembers(loadStaff());

  const filtered = members.filter((m) => {
    const matchSearch =
      m.fullName.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.contact.includes(search);
    const matchRole = filterRole === "all" || m.role === filterRole;
    return matchSearch && matchRole;
  });

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    if (!form.contact.trim()) e.contact = "Contact is required";
    else if (!/^\d{10}$/.test(form.contact.replace(/\D/g, ""))) e.contact = "Enter 10-digit number";
    if (!form.role) e.role = "Role is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (editingId) {
      updateStaffMember(editingId, {
        fullName: form.fullName,
        email: form.email,
        contact: form.contact,
        role: form.role,
        address: form.address,
        pincode: form.pincode,
        city: form.city,
        state: form.state,
        district: form.district,
        photo: form.photo || undefined,
        status: "active",
      });
    } else {
      addStaffMember({
        fullName: form.fullName,
        email: form.email,
        contact: form.contact,
        role: form.role,
        address: form.address,
        pincode: form.pincode,
        city: form.city,
        state: form.state,
        district: form.district,
        photo: form.photo || undefined,
        status: "active",
      });
    }
    refresh();
    closeForm();
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    setIsFormOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setForm({
      fullName: m.fullName, email: m.email, contact: m.contact,
      role: m.role, address: m.address, pincode: m.pincode,
      city: m.city, state: m.state, district: m.district,
      photo: m.photo ?? "",
    });
    setErrors({});
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, photo: ev.target!.result as string }));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toggleStatus = (m: StaffMember) => {
    updateStaffMember(m.id, { status: m.status === "active" ? "inactive" : "active" });
    refresh();
  };

  const stats = {
    total: members.length,
    active: members.filter((m) => m.status === "active").length,
    inactive: members.filter((m) => m.status === "inactive").length,
  };

  const set = (k: keyof typeof emptyForm) => (val: string) =>
    setForm((f) => ({ ...f, [k]: val }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Staff Management</h1>
          <p className="text-muted-foreground mt-1">Manage team members and their roles</p>
        </div>
        <Can permission={Permission.STAFF__MANAGE}>
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        </Can>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Staff", value: stats.total, icon: UserCog },
          { label: "Active", value: stats.active, icon: CheckCircle2 },
          { label: "Inactive", value: stats.inactive, icon: XCircle },
          { label: "Roles", value: ROLES.length, icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="shadow-md">
            <CardContent className="p-6">
              <Icon className="h-5 w-5 text-secondary mb-2" />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Staff Members</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs w-52"
                />
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <UserCog className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {members.length === 0
                  ? "No staff members yet. Click \"Add Staff\" to get started."
                  : "No members match your search."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground font-mono">{m.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8 shrink-0">
                          {m.photo && <AvatarImage src={m.photo} />}
                          <AvatarFallback className="bg-gradient-to-br from-secondary to-accent text-white text-xs">
                            {m.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium leading-none">{m.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_COLORS[m.role] as "secondary" | "default" | "outline" | "destructive"}>
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{m.contact}</TableCell>
                    <TableCell className="text-sm">{m.city || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={m.status === "active" ? "default" : "secondary"} className="text-xs">
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-xs">Actions</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewMember(m)}>
                            <UserCog className="h-4 w-4 mr-2" /> View Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(m)}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(m)}>
                            {m.status === "active"
                              ? <><XCircle className="h-4 w-4 mr-2" /> Deactivate</>
                              : <><CheckCircle2 className="h-4 w-4 mr-2" /> Activate</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => { deleteStaffMember(m.id); refresh(); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit Staff Dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Staff Member" : "Add New Staff"}</DialogTitle>
          </DialogHeader>

          {/* Photo */}
          <div className="flex justify-center pt-1 pb-2">
            <div className="relative cursor-pointer" onClick={() => photoInputRef.current?.click()}>
              <Avatar className="h-20 w-20">
                {form.photo && <AvatarImage src={form.photo} />}
                <AvatarFallback className="bg-gradient-to-br from-secondary to-accent text-white text-xl">
                  {form.fullName ? form.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                <Camera className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          <div className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} placeholder="Full Name" />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input value={form.email} onChange={(e) => set("email")(e.target.value)} placeholder="Email" type="email" />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            {/* Contact */}
            <div className="space-y-1.5">
              <Label>Contact <span className="text-destructive">*</span></Label>
              <Input value={form.contact} onChange={(e) => set("contact")(e.target.value)} placeholder="Contact Number" type="tel" />
              {errors.contact && <p className="text-xs text-destructive">{errors.contact}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Role <span className="text-destructive">*</span></Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set("role")(r)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      form.role === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-muted-foreground/30 hover:border-primary text-muted-foreground"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address")(e.target.value)} placeholder="Address" />
            </div>

            {/* Pincode + City */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pincode</Label>
                <Input value={form.pincode} onChange={(e) => set("pincode")(e.target.value)} placeholder="Pincode" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set("city")(e.target.value)} placeholder="City" />
              </div>
            </div>

            {/* State */}
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={form.state} onValueChange={set("state")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select State" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* District */}
            <div className="space-y-1.5">
              <Label>District</Label>
              <Input value={form.district} onChange={(e) => set("district")(e.target.value)} placeholder="Select District" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={closeForm}>
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit}>
              {editingId ? "Save Changes" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Profile Dialog ── */}
      {viewMember && (
        <Dialog open={!!viewMember} onOpenChange={(o) => { if (!o) setViewMember(null); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Staff Profile</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-3">
              <Avatar className="h-20 w-20">
                {viewMember.photo && <AvatarImage src={viewMember.photo} />}
                <AvatarFallback className="bg-gradient-to-br from-secondary to-accent text-white text-xl">
                  {viewMember.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-lg font-semibold">{viewMember.fullName}</p>
                <Badge variant={ROLE_COLORS[viewMember.role] as "secondary" | "default" | "outline" | "destructive"} className="mt-1">
                  {viewMember.role}
                </Badge>
              </div>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />{viewMember.email}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />{viewMember.contact}
              </div>
              {viewMember.address && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {[viewMember.address, viewMember.city, viewMember.district, viewMember.state, viewMember.pincode]
                      .filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={viewMember.status === "active" ? "default" : "secondary"} className="mt-1">
                  {viewMember.status}
                </Badge>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="text-sm font-medium mt-0.5">{viewMember.createdAt}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setViewMember(null)}>Close</Button>
              <Button className="flex-1" onClick={() => { setViewMember(null); openEdit(viewMember); }}>
                <Edit className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

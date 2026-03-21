import { useParams, Link } from "react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Wallet,
  Plus,
  Download,
  Upload,
  FileText,
  MessageSquare,
  Edit,
  TrendingUp,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";
import { loadClients, updateClient, addTransaction, loadTransactions, type Client } from "../../lib/clientStore";
import { loadProjects, addProject, type Project } from "../../lib/projectStore";
import { STATE_DISTRICTS } from "../../lib/districts";

const INDIAN_STATES = [
  "ANDAMAN & NICOBAR ISLANDS","ANDHRA PRADESH","ARUNACHAL PRADESH","ASSAM","BIHAR",
  "CHANDIGARH","CHHATTISGARH","DADRA & NAGAR HAVELI AND DAMAN & DIU","DELHI","GOA",
  "GUJARAT","HARYANA","HIMACHAL PRADESH","JAMMU & KASHMIR","JHARKHAND","KARNATAKA",
  "KERALA","LADAKH","LAKSHADWEEP","MADHYA PRADESH","MAHARASHTRA","MANIPUR","MEGHALAYA",
  "MIZORAM","NAGALAND","ODISHA","PUDUCHERRY","PUNJAB","RAJASTHAN","SIKKIM","TAMIL NADU",
  "TELANGANA","TRIPURA","UTTAR PRADESH","UTTARAKHAND","WEST BENGAL",
];

const communications: { id: number; type: string; subject: string; date: string; status: string }[] = [];

const emptyWalletForm = {
  amount: "",
  method: "",
  reference: "",
  notes: "",
};

const emptyProjectForm = {
  name: "",
  workflowType: "variable_data" as "variable_data" | "direct_print",
  stage: "draft",
  priority: "medium" as Project["priority"],
  dueDate: "",
  assignee: "",
  amount: "",
  description: "",
};

const stages = [
  { id: "draft", label: "Draft" },
  { id: "data-uploaded", label: "Data Uploaded" },
  { id: "designing", label: "Designing" },
  { id: "proof-sent", label: "Proof Sent" },
  { id: "approved", label: "Approved" },
  { id: "printing", label: "Printing" },
  { id: "dispatched", label: "Dispatched" },
  { id: "delivered", label: "Delivered" },
];

export function ClientProfile() {
  const { id } = useParams();
  const [isWalletDialogOpen, setIsWalletDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [walletForm, setWalletForm] = useState(emptyWalletForm);
  const [walletErrors, setWalletErrors] = useState<Partial<typeof emptyWalletForm>>({});
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [projectErrors, setProjectErrors] = useState<Partial<typeof emptyProjectForm>>({});
  const [clientVersion, setClientVersion] = useState(0); // used to force re-read after save
  const [districtSearch, setDistrictSearch] = useState("");

  const allClients = loadClients();
  const found = allClients.find((c) => c.id === id);
  const emptyClient: Client = {
    id: id ?? "",
    clientName: "",
    email: "",
    contact: "",
    gstNumber: "",
    gstName: "",
    gstStateCode: "",
    gstAddress: "",
    deliveryMode: "",
    type: "",
    address: "",
    pincode: "",
    city: "",
    state: "",
    district: "",
    schoollogUniqueId: "",
    status: "active",
    createdAt: "",
  };
  const clientData = found ?? emptyClient;
  const walletTransactions = id ? loadTransactions(id) : [];
  const clientProjects = id ? loadProjects().filter((p) => p.clientId === id) : [];
  // re-read after clientVersion bump so balance updates live
  void clientVersion;

  const [editForm, setEditForm] = useState<Omit<Client, "id" | "status" | "createdAt">>({
    clientName: clientData.clientName,
    email: clientData.email,
    contact: clientData.contact,
    gstNumber: clientData.gstNumber,
    gstName: clientData.gstName,
    gstStateCode: clientData.gstStateCode,
    gstAddress: clientData.gstAddress,
    deliveryMode: clientData.deliveryMode,
    type: clientData.type,
    address: clientData.address,
    pincode: clientData.pincode,
    city: clientData.city,
    state: clientData.state,
    district: clientData.district,
    schoollogUniqueId: clientData.schoollogUniqueId,
    busStop: clientData.busStop || "",
    route: clientData.route || "",
  });

  const setField = (field: keyof typeof editForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const handleEditSave = () => {
    if (id) {
      updateClient(id, editForm);
    }
    setIsEditDialogOpen(false);
    setClientVersion((v) => v + 1);
  };

  const validateWallet = () => {
    const e: Partial<typeof emptyWalletForm> = {};
    if (!walletForm.amount || Number(walletForm.amount) <= 0) e.amount = "Enter a valid amount";
    if (!walletForm.method) e.method = "Select a payment method";
    setWalletErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddFunds = () => {
    if (!validateWallet() || !id) return;
    const amount = Number(walletForm.amount);
    addTransaction({
      clientId: id,
      type: "credit",
      amount,
      method: walletForm.method,
      reference: walletForm.reference,
      notes: walletForm.notes,
    });
    updateClient(id, { balance: (clientData.balance ?? 0) + amount });
    setWalletForm(emptyWalletForm);
    setWalletErrors({});
    setIsWalletDialogOpen(false);
    setClientVersion((v) => v + 1);
  };

  const validateProject = () => {
    const e: Partial<typeof emptyProjectForm> = {};
    if (!projectForm.name.trim()) e.name = "Project name is required";
    if (!projectForm.dueDate) e.dueDate = "Due date is required";
    if (!projectForm.amount || Number(projectForm.amount) < 0) e.amount = "Enter a valid amount";
    setProjectErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNewProject = () => {
    if (!validateProject() || !id) return;
    addProject({
      name: projectForm.name,
      clientId: id,
      client: clientData.clientName,
      stage: projectForm.stage,
      priority: projectForm.priority,
      dueDate: projectForm.dueDate,
      assignee: projectForm.assignee,
      amount: Number(projectForm.amount),
      description: projectForm.description,
      workflowType: projectForm.workflowType,
    });
    setProjectForm(emptyProjectForm);
    setProjectErrors({});
    setIsNewProjectOpen(false);
    setClientVersion((v) => v + 1);
  };

  const openEdit = () => {
    setEditForm({
      clientName: clientData.clientName,
      email: clientData.email,
      contact: clientData.contact,
      gstNumber: clientData.gstNumber,
      gstName: clientData.gstName,
      gstStateCode: clientData.gstStateCode,
      gstAddress: clientData.gstAddress,
      deliveryMode: clientData.deliveryMode,
      type: clientData.type,
      address: clientData.address,
      pincode: clientData.pincode,
      city: clientData.city,
      state: clientData.state,
      district: clientData.district,
      schoollogUniqueId: clientData.schoollogUniqueId,
    });
    setIsEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-foreground">
              {clientData.clientName}
            </h1>
            <Badge className={clientData.status === "active" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
              {clientData.status.charAt(0).toUpperCase() + clientData.status.slice(1)}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Client ID: {clientData.id} • Joined {clientData.createdAt}
          </p>
        </div>
        <div className="flex gap-2">
          <Can permission={Permission.CLIENTS__MANAGE}>
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2" onClick={openEdit}>
                <Edit className="h-4 w-4" />
                Edit Details
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Client Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-2">
                {/* Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Client Name</Label>
                    <Input placeholder="Client Name" value={editForm.clientName} onChange={setField("clientName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="Email" value={editForm.email} onChange={setField("email")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact</Label>
                    <Input type="tel" placeholder="Contact Number" value={editForm.contact} onChange={setField("contact")} />
                  </div>
                </div>
                {/* Row 2 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>GST Number</Label>
                    <Input placeholder="GST Number" value={editForm.gstNumber} onChange={setField("gstNumber")} />
                  </div>
                  <div className="space-y-2">
                    <Label>GST Name</Label>
                    <Input placeholder="GST Name" value={editForm.gstName} onChange={setField("gstName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>GST State Code</Label>
                    <Input placeholder="GST State Code" value={editForm.gstStateCode} onChange={setField("gstStateCode")} />
                  </div>
                </div>
                {/* GST Address */}
                <div className="space-y-2">
                  <Label>GST Address</Label>
                  <Textarea placeholder="GST Address" rows={2} value={editForm.gstAddress} onChange={setField("gstAddress")} />
                </div>
                {/* Delivery Mode & Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label>Delivery Mode</Label>
                    <RadioGroup 
                      value={editForm.deliveryMode} 
                      onValueChange={(v) => setEditForm((f) => ({
                        ...f,
                        deliveryMode: v,
                        ...(v !== "Bus" && { busStop: "", route: "" })
                      }))} 
                      className="flex gap-6"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Bus" id="edit-bus" />
                        <Label htmlFor="edit-bus" className="font-normal cursor-pointer">Bus</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Courier" id="edit-courier" />
                        <Label htmlFor="edit-courier" className="font-normal cursor-pointer">Courier</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="space-y-3">
                    <Label>Type</Label>
                    <RadioGroup value={editForm.type} onValueChange={(v) => setEditForm((f) => ({ ...f, type: v }))} className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="School" id="edit-school" />
                        <Label htmlFor="edit-school" className="font-normal cursor-pointer">School</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Coaching" id="edit-coaching" />
                        <Label htmlFor="edit-coaching" className="font-normal cursor-pointer">Coaching</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="Other" id="edit-other" />
                        <Label htmlFor="edit-other" className="font-normal cursor-pointer">Other</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
                {/* Bus Delivery Conditional Fields */}
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    editForm.deliveryMode === "Bus"
                      ? "max-h-96 opacity-100 mb-4"
                      : "max-h-0 opacity-0 mb-0"
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div className="space-y-2">
                      <Label htmlFor="edit-busStop">Bus Stop</Label>
                      <Input
                        id="edit-busStop"
                        placeholder="Enter Bus Stop"
                        value={editForm.busStop}
                        onChange={setField("busStop")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-route">Route</Label>
                      <Input
                        id="edit-route"
                        placeholder="Enter Route"
                        value={editForm.route}
                        onChange={setField("route")}
                      />
                    </div>
                  </div>
                </div>
                {/* Address */}
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input placeholder="Address" value={editForm.address} onChange={setField("address")} />
                </div>
                {/* Pincode / City / State / District */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Pincode</Label>
                    <Input placeholder="Pincode" maxLength={6} value={editForm.pincode} onChange={setField("pincode")} />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input placeholder="City" value={editForm.city} onChange={setField("city")} />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select value={editForm.state} onValueChange={(v) => setEditForm((f) => ({ ...f, state: v, district: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Select State" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="district">Select District</Label>
                    <Select
                      value={editForm.district}
                      onValueChange={(v) => setEditForm((f) => ({ ...f, district: v }))}
                      disabled={!editForm.state}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose District" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        <div className="px-2 py-1">
                          <Input
                            placeholder="Search district..."
                            value={districtSearch}
                            onChange={e => setDistrictSearch(e.target.value)}
                            className="mb-2"
                            disabled={!editForm.state}
                          />
                        </div>
                        {editForm.state && (STATE_DISTRICTS[editForm.state]?.filter((d: string) => d.toLowerCase().includes(districtSearch.toLowerCase())) || []).map((d: string) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Schoollog ID */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Schoollog Unique Id</Label>
                    <Input placeholder="School Id" value={editForm.schoollogUniqueId} onChange={setField("schoollogUniqueId")} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEditSave}>Save Changes</Button>
              </div>
            </DialogContent>
          </Dialog>
          </Can>
          <Can permission={Permission.WALLET__RECORD_PAYMENT}>
          <Dialog open={isWalletDialogOpen} onOpenChange={(open) => { setIsWalletDialogOpen(open); if (!open) { setWalletForm(emptyWalletForm); setWalletErrors({}); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Funds
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Funds to Wallet</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Amount <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={walletForm.amount}
                    onChange={(e) => setWalletForm((f) => ({ ...f, amount: e.target.value }))}
                    min={1}
                  />
                  {walletErrors.amount && <p className="text-xs text-destructive">{walletErrors.amount}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Payment Method <span className="text-destructive">*</span></Label>
                  <Select value={walletForm.method} onValueChange={(v) => setWalletForm((f) => ({ ...f, method: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                  {walletErrors.method && <p className="text-xs text-destructive">{walletErrors.method}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Transaction Reference</Label>
                  <Input
                    placeholder="Reference number"
                    value={walletForm.reference}
                    onChange={(e) => setWalletForm((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Upload Receipt</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-secondary transition-colors cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes (optional)"
                    value={walletForm.notes}
                    onChange={(e) => setWalletForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsWalletDialogOpen(false); setWalletForm(emptyWalletForm); setWalletErrors({}); }}>
                  Cancel
                </Button>
                <Button onClick={handleAddFunds}>Add Funds</Button>
              </div>
            </DialogContent>
          </Dialog>
          </Can>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-secondary/10">
                <Wallet className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Wallet Balance</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹{(clientData.balance ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Limit</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹{(clientData.maxCredit ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success/10">
                <FileText className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-2xl font-bold text-foreground">
                  {clientProjects.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-info/10">
                <TrendingUp className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹0
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Info */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium">{clientData.contact}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{clientData.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 md:col-span-2">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p className="font-medium">{clientData.address}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="wallet">Wallet & Transactions</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="space-y-4">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Projects</CardTitle>
                <Dialog open={isNewProjectOpen} onOpenChange={(open) => { setIsNewProjectOpen(open); if (!open) { setProjectForm(emptyProjectForm); setProjectErrors({}); } }}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Plus className="h-4 w-4" />
                      New Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Project Name <span className="text-destructive">*</span></Label>
                        <Input placeholder="Project name" value={projectForm.name} onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))} />
                        {projectErrors.name && <p className="text-xs text-destructive">{projectErrors.name}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Workflow Type <span className="text-destructive">*</span></Label>
                        <Select value={projectForm.workflowType} onValueChange={(v) => setProjectForm((f) => ({ ...f, workflowType: v as "variable_data" | "direct_print" }))}>
                          <SelectTrigger><SelectValue placeholder="Select workflow type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="variable_data">Variable Data Printing</SelectItem>
                            <SelectItem value="direct_print">Direct Print Order</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Stage</Label>
                          <Select value={projectForm.stage} onValueChange={(v) => setProjectForm((f) => ({ ...f, stage: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <Select value={projectForm.priority} onValueChange={(v) => setProjectForm((f) => ({ ...f, priority: v as Project["priority"] }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Due Date <span className="text-destructive">*</span></Label>
                          <Input type="date" value={projectForm.dueDate} onChange={(e) => setProjectForm((f) => ({ ...f, dueDate: e.target.value }))} />
                          {projectErrors.dueDate && <p className="text-xs text-destructive">{projectErrors.dueDate}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label>Amount (₹) <span className="text-destructive">*</span></Label>
                          <Input type="number" placeholder="0" min={0} value={projectForm.amount} onChange={(e) => setProjectForm((f) => ({ ...f, amount: e.target.value }))} />
                          {projectErrors.amount && <p className="text-xs text-destructive">{projectErrors.amount}</p>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Assignee</Label>
                        <Input placeholder="Assignee name" value={projectForm.assignee} onChange={(e) => setProjectForm((f) => ({ ...f, assignee: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea placeholder="Project description" rows={3} value={projectForm.description} onChange={(e) => setProjectForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => { setIsNewProjectOpen(false); setProjectForm(emptyProjectForm); setProjectErrors({}); }}>Cancel</Button>
                      <Button onClick={handleNewProject}>Create Project</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientProjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No projects yet</TableCell>
                    </TableRow>
                  ) : (
                    clientProjects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.id}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{stages.find((s) => s.id === project.stage)?.label ?? project.stage}</Badge>
                        </TableCell>
                        <TableCell>₹{project.amount.toLocaleString()}</TableCell>
                        <TableCell>{project.dueDate}</TableCell>
                        <TableCell className="text-right">
                          <Link to={`/projects/${project.id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet" className="space-y-4">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Wallet Transactions</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletTransactions.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="font-medium">{txn.id}</TableCell>
                      <TableCell>
                        <Badge
                          variant={txn.type === "credit" ? "default" : "secondary"}
                        >
                          {txn.type === "credit" ? "Credit" : "Debit"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={
                          txn.type === "credit"
                            ? "text-success font-medium"
                            : "text-destructive font-medium"
                        }
                      >
                        {txn.type === "credit" ? "+" : "-"}₹
                        {txn.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {txn.method}
                        {txn.project && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({txn.project})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{txn.date}</TableCell>
                      <TableCell>
                        {txn.receipt && (
                          <Button variant="ghost" size="sm" className="gap-1">
                            <FileText className="h-4 w-4" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Button className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Document
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No documents uploaded yet</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications" className="space-y-4">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Communication Logs</CardTitle>
                <Button className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  New Message
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {communications.map((comm) => (
                  <div
                    key={comm.id}
                    className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-secondary/10">
                      {comm.type === "email" ? (
                        <Mail className="h-5 w-5 text-secondary" />
                      ) : (
                        <Phone className="h-5 w-5 text-accent" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{comm.subject}</p>
                        <Badge variant="outline" className="text-xs">
                          {comm.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{comm.date}</p>
                    </div>
                    <Button variant="ghost" size="sm">
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

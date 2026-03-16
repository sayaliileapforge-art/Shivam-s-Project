import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { addClient } from "../../lib/clientStore";
import { ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Card, CardContent } from "../components/ui/card";

const INDIAN_STATES = [
  "ANDAMAN & NICOBAR ISLANDS",
  "ANDHRA PRADESH",
  "ARUNACHAL PRADESH",
  "ASSAM",
  "BIHAR",
  "CHANDIGARH",
  "CHHATTISGARH",
  "DADRA & NAGAR HAVELI AND DAMAN & DIU",
  "DELHI",
  "GOA",
  "GUJARAT",
  "HARYANA",
  "HIMACHAL PRADESH",
  "JAMMU & KASHMIR",
  "JHARKHAND",
  "KARNATAKA",
  "KERALA",
  "LADAKH",
  "LAKSHADWEEP",
  "MADHYA PRADESH",
  "MAHARASHTRA",
  "MANIPUR",
  "MEGHALAYA",
  "MIZORAM",
  "NAGALAND",
  "ODISHA",
  "PUDUCHERRY",
  "PUNJAB",
  "RAJASTHAN",
  "SIKKIM",
  "TAMIL NADU",
  "TELANGANA",
  "TRIPURA",
  "UTTAR PRADESH",
  "UTTARAKHAND",
  "WEST BENGAL",
];

const emptyForm = {
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
};

export function AddClient() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});

  const set = (field: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.clientName.trim()) e.clientName = "Client name is required";
    if (!form.email.trim()) e.email = "Email is required";
    if (!form.contact.trim()) e.contact = "Contact is required";
    if (!form.deliveryMode) e.deliveryMode = "Select a delivery mode";
    if (!form.type) e.type = "Select a type";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    addClient(form);
    navigate("/clients");
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/clients" className="hover:text-foreground transition-colors">
          Clients
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium">Add New Client</span>
      </div>

      <h1 className="text-3xl font-semibold">Add New Client</h1>

      <Card className="shadow-md">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Row 1: Client Name | Email | Contact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name <span className="text-destructive">*</span></Label>
                <Input id="clientName" placeholder="Client Name" value={form.clientName} onChange={set("clientName")} />
                {errors.clientName && <p className="text-xs text-destructive">{errors.clientName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                <Input id="email" type="email" placeholder="Email" value={form.email} onChange={set("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact">Contact <span className="text-destructive">*</span></Label>
                <Input id="contact" type="tel" placeholder="Contact Number" value={form.contact} onChange={set("contact")} />
                {errors.contact && <p className="text-xs text-destructive">{errors.contact}</p>}
              </div>
            </div>

            {/* Row 2: GST Number | GST Name | GST State Code */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="gstNumber">GST Number</Label>
                <Input id="gstNumber" placeholder="GST Number" value={form.gstNumber} onChange={set("gstNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gstName">GST Name</Label>
                <Input id="gstName" placeholder="GST Name" value={form.gstName} onChange={set("gstName")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gstStateCode">GST State Code</Label>
                <Input id="gstStateCode" placeholder="GST State Code" value={form.gstStateCode} onChange={set("gstStateCode")} />
              </div>
            </div>

            {/* Row 3: GST Address (full width) */}
            <div className="space-y-2">
              <Label htmlFor="gstAddress">GST Address</Label>
              <Textarea id="gstAddress" placeholder="GST Address" rows={2} value={form.gstAddress} onChange={set("gstAddress")} />
            </div>

            {/* Row 4: Delivery Mode | Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <Label>Delivery Mode <span className="text-destructive">*</span></Label>
                <RadioGroup
                  value={form.deliveryMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, deliveryMode: v }))}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Bus" id="bus" />
                    <Label htmlFor="bus" className="font-normal cursor-pointer">Bus</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Courier" id="courier" />
                    <Label htmlFor="courier" className="font-normal cursor-pointer">Courier</Label>
                  </div>
                </RadioGroup>
                {errors.deliveryMode && <p className="text-xs text-destructive">{errors.deliveryMode}</p>}
              </div>
              <div className="space-y-3">
                <Label>Type <span className="text-destructive">*</span></Label>
                <RadioGroup
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="School" id="school" />
                    <Label htmlFor="school" className="font-normal cursor-pointer">School</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Coaching" id="coaching" />
                    <Label htmlFor="coaching" className="font-normal cursor-pointer">Coaching</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Other" id="other" />
                    <Label htmlFor="other" className="font-normal cursor-pointer">Other</Label>
                  </div>
                </RadioGroup>
                {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
              </div>
            </div>

            {/* Row 5: Address (full width) */}
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" placeholder="Address" value={form.address} onChange={set("address")} />
            </div>

            {/* Row 6: Pincode | City | State | District */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input id="pincode" placeholder="Pincode" maxLength={6} value={form.pincode} onChange={set("pincode")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="City" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v, district: "" }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select State" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">District</Label>
                <Input id="district" placeholder="District" value={form.district} onChange={set("district")} />
              </div>
            </div>

            {/* Row 7: Schoollog Unique Id */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="schoollogUniqueId">Schoollog Unique Id</Label>
                <Input id="schoollogUniqueId" placeholder="School Id" value={form.schoollogUniqueId} onChange={set("schoollogUniqueId")} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="px-10">
                Submit
              </Button>
              <Button type="button" variant="outline" className="px-10" onClick={() => navigate("/clients")}>
                Cancel
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}

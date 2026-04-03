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
import { STATE_DISTRICTS } from "../../lib/districts";

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
  busStop: "",
  route: "",
};

export function AddClient() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [districtSearch, setDistrictSearch] = useState("");
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (field: keyof typeof emptyForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.clientName.trim()) e.clientName = "School / Institute / Company Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    if (!form.contact.trim()) e.contact = "Contact is required";
    if (!form.deliveryMode) e.deliveryMode = "Select a delivery mode";
    if (!form.type) e.type = "Select a type";
    if (!form.state) e.state = "State is required";
    if (!form.district) e.district = "District is required";
    if (!form.schoollogUniqueId.trim()) e.schoollogUniqueId = "School Unique ID is required";
    if (form.deliveryMode === "Bus") {
      if (!form.busStop.trim()) e.busStop = "Bus stop is required";
      if (!form.route.trim()) e.route = "Route is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setIsLoading(true);
    setSubmitError("");
    
    try {
      await addClient(form);
      navigate("/clients");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create client";
      setSubmitError(errorMessage);
      console.error("Error creating client:", error);
    } finally {
      setIsLoading(false);
    }
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

            {/* Row 1: School / Institute / Company Name | Email | Contact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="clientName">School / Institute / Company Name <span className="text-destructive">*</span></Label>
                <Input id="clientName" placeholder="School / Institute / Company Name" value={form.clientName} onChange={set("clientName")} />
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
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    deliveryMode: v,
                    ...(v !== "Bus" && { busStop: "", route: "" })
                  }))}
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

            {/* Row 4.5: Bus Delivery Conditional Fields */}
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                form.deliveryMode === "Bus"
                  ? "max-h-96 opacity-100 mb-6"
                  : "max-h-0 opacity-0 mb-0"
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-border">
                <div className="space-y-2">
                  <Label htmlFor="busStop">Bus Stop <span className="text-destructive">*</span></Label>
                  <Input
                    id="busStop"
                    placeholder="Enter Bus Stop"
                    value={form.busStop}
                    onChange={set("busStop")}
                  />
                  {errors.busStop && <p className="text-xs text-destructive">{errors.busStop}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="route">Route <span className="text-destructive">*</span></Label>
                  <Input
                    id="route"
                    placeholder="Enter Route"
                    value={form.route}
                    onChange={set("route")}
                  />
                  {errors.route && <p className="text-xs text-destructive">{errors.route}</p>}
                </div>
              </div>
            </div>

            {/* Row 5: Address (full width) */}
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" placeholder="Address" value={form.address} onChange={set("address")} />
            </div>

            {/* Row 6: State | District | City | Pincode */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
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
                <Label htmlFor="district">Select District</Label>
                <Select
                  value={form.district}
                  onValueChange={(v) => setForm((f) => ({ ...f, district: v }))}
                  disabled={!form.state}
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
                        disabled={!form.state}
                      />
                    </div>
                    {form.state && (STATE_DISTRICTS[form.state]?.filter((d: string) => d.toLowerCase().includes(districtSearch.toLowerCase())) || []).map((d: string) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.district && <div className="text-red-500 text-xs mt-1">{errors.district}</div>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="City" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode</Label>
                <Input id="pincode" placeholder="Pincode" maxLength={6} value={form.pincode} onChange={set("pincode")} />
              </div>
            </div>

            {/* Row 7: Unique ID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label htmlFor="schoollogUniqueId" className="leading-snug">School / Institute / Company Unique ID <span className="text-destructive">*</span></Label>
                <Input id="schoollogUniqueId" placeholder="School / Institute / Company Unique ID" value={form.schoollogUniqueId} onChange={set("schoollogUniqueId")} />
                {errors.schoollogUniqueId && <p className="text-xs text-destructive">{errors.schoollogUniqueId}</p>}
              </div>
            </div>

            {/* Error Message */}
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {submitError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" className="px-10" disabled={isLoading}>
                {isLoading ? "Creating..." : "Submit"}
              </Button>
              <Button type="button" variant="outline" className="px-10" onClick={() => navigate("/clients")} disabled={isLoading}>
                Cancel
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Building2, Filter, Printer, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { loadClients, type Client } from "../../lib/clientStore";

const PX_PER_INCH = 96;
const SETTINGS_STORAGE_KEY = "printing_settings_dashboard";
const FILTER_ALL = "__all__";

type NumericField =
  | "pageWidthIn"
  | "pageHeightIn"
  | "pageWidthPx"
  | "pageHeightPx"
  | "cardWidthIn"
  | "cardHeightIn"
  | "cardWidthPx"
  | "cardHeightPx"
  | "marginTopIn"
  | "marginLeftIn"
  | "rowGapIn"
  | "columnGapIn";

interface PrintingSettingsForm {
  schoolId: string;
  classValue: string;
  gender: string;
  transport: string;
  boarding: string;
  house: string;
  pageWidthIn: string;
  pageHeightIn: string;
  pageWidthPx: string;
  pageHeightPx: string;
  cardWidthIn: string;
  cardHeightIn: string;
  cardWidthPx: string;
  cardHeightPx: string;
  marginTopIn: string;
  marginLeftIn: string;
  rowGapIn: string;
  columnGapIn: string;
}

const defaultForm: PrintingSettingsForm = {
  schoolId: "",
  classValue: FILTER_ALL,
  gender: FILTER_ALL,
  transport: FILTER_ALL,
  boarding: FILTER_ALL,
  house: FILTER_ALL,
  pageWidthIn: "8.27",
  pageHeightIn: "11.69",
  pageWidthPx: "794",
  pageHeightPx: "1122",
  cardWidthIn: "3.38",
  cardHeightIn: "2.13",
  cardWidthPx: "325",
  cardHeightPx: "204",
  marginTopIn: "0.32",
  marginLeftIn: "0.32",
  rowGapIn: "0.16",
  columnGapIn: "0.16",
};

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(2)).toString();
}

function inchToPx(value: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return "";
  return formatNumber(numericValue * PX_PER_INCH);
}

function pxToInch(value: string): string {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return "";
  return formatNumber(numericValue / PX_PER_INCH);
}

export function Settings() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [form, setForm] = useState<PrintingSettingsForm>(defaultForm);
  const [errors, setErrors] = useState<Partial<Record<NumericField | "schoolId", string>>>({});
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!savedSettings) return;
      const parsed = JSON.parse(savedSettings) as Partial<PrintingSettingsForm>;
      setForm((prev) => ({ ...prev, ...parsed }));
    } catch (error) {
      console.error("Failed to parse saved printing settings", error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchClients = async () => {
      setIsLoadingClients(true);
      try {
        const loadedClients = await loadClients();
        if (!isMounted) return;
        setClients(loadedClients);
      } catch (error) {
        if (isMounted) {
          setClients([]);
        }
        console.error("Failed to load schools for settings", error);
      } finally {
        if (isMounted) {
          setIsLoadingClients(false);
        }
      }
    };
    void fetchClients();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (form.schoolId || clients.length === 0) return;
    setForm((prev) => ({ ...prev, schoolId: clients[0].id }));
  }, [clients, form.schoolId]);

  const selectedSchool = useMemo(
    () => clients.find((client) => client.id === form.schoolId),
    [clients, form.schoolId]
  );

  const selectedDesignName = selectedSchool
    ? `${selectedSchool.clientName} - Standard Print Layout`
    : "No design selected";

  const updateField = (key: keyof PrintingSettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMessage("");
  };

  const updateInchPxPair = (
    inchField: Extract<NumericField, `${string}In`>,
    pxField: Extract<NumericField, `${string}Px`>,
    inchValue: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [inchField]: inchValue,
      [pxField]: inchToPx(inchValue),
    }));
    setSaveMessage("");
  };

  const updatePxInchPair = (
    pxField: Extract<NumericField, `${string}Px`>,
    inchField: Extract<NumericField, `${string}In`>,
    pxValue: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [pxField]: pxValue,
      [inchField]: pxToInch(pxValue),
    }));
    setSaveMessage("");
  };

  const validate = () => {
    const nextErrors: Partial<Record<NumericField | "schoolId", string>> = {};

    if (!form.schoolId) {
      nextErrors.schoolId = "Please select a school.";
    }

    const positiveFields: Array<[NumericField, string]> = [
      ["pageWidthIn", "Page width must be greater than 0."],
      ["pageHeightIn", "Page height must be greater than 0."],
      ["cardWidthIn", "Card width must be greater than 0."],
      ["cardHeightIn", "Card height must be greater than 0."],
    ];

    positiveFields.forEach(([field, message]) => {
      const numericValue = Number(form[field]);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        nextErrors[field] = message;
      }
    });

    const nonNegativeFields: Array<[NumericField, string]> = [
      ["marginTopIn", "Margin top cannot be negative."],
      ["marginLeftIn", "Margin left cannot be negative."],
      ["rowGapIn", "Row gap cannot be negative."],
      ["columnGapIn", "Column gap cannot be negative."],
    ];

    nonNegativeFields.forEach(([field, message]) => {
      const numericValue = Number(form[field]);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        nextErrors[field] = message;
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(form));
    setSaveMessage(`Saved at ${new Date().toLocaleTimeString()}`);
  };

  const renderSelectField = (
    label: string,
    value: string,
    onChange: (nextValue: string) => void,
    options: Array<{ label: string; value: string }>
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderUnitInput = (
    label: string,
    value: string,
    unitLabel: string,
    onChange: (nextValue: string) => void,
    error?: string
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={error ? "border-destructive" : ""}
        />
        <span className="w-10 rounded-md border bg-muted/50 px-2 py-1 text-center text-xs text-muted-foreground">
          {unitLabel}
        </span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Printing Settings</h1>
        <p className="text-muted-foreground mt-1">Configure school-wise print filters and page layout preferences.</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Settings Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Select School</Label>
                <Select value={form.schoolId} onValueChange={(value) => updateField("schoolId", value)}>
                  <SelectTrigger className={`h-9 ${errors.schoolId ? "border-destructive" : ""}`}>
                    <SelectValue placeholder={isLoadingClients ? "Loading schools..." : "Select school"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.schoolId && <p className="text-xs text-destructive">{errors.schoolId}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Selected Design</Label>
                <Input value={selectedDesignName} readOnly className="h-9 bg-muted/40" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {renderSelectField("Class", form.classValue, (value) => updateField("classValue", value), [
                { label: "All", value: FILTER_ALL },
                { label: "Pre-Primary", value: "pre-primary" },
                { label: "Class 1-5", value: "1-5" },
                { label: "Class 6-8", value: "6-8" },
                { label: "Class 9-12", value: "9-12" },
              ])}
              {renderSelectField("Gender", form.gender, (value) => updateField("gender", value), [
                { label: "All", value: FILTER_ALL },
                { label: "Male", value: "male" },
                { label: "Female", value: "female" },
                { label: "Other", value: "other" },
              ])}
              {renderSelectField("Transport", form.transport, (value) => updateField("transport", value), [
                { label: "All", value: FILTER_ALL },
                { label: "Bus", value: "bus" },
                { label: "Van", value: "van" },
                { label: "Self", value: "self" },
              ])}
              {renderSelectField("Boarding", form.boarding, (value) => updateField("boarding", value), [
                { label: "All", value: FILTER_ALL },
                { label: "Day Scholar", value: "day-scholar" },
                { label: "Hosteller", value: "hosteller" },
              ])}
              {renderSelectField("House", form.house, (value) => updateField("house", value), [
                { label: "All", value: FILTER_ALL },
                { label: "Red", value: "red" },
                { label: "Blue", value: "blue" },
                { label: "Green", value: "green" },
                { label: "Yellow", value: "yellow" },
              ])}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ruler className="h-4 w-4" />
                  Page Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderUnitInput("Page Width", form.pageWidthIn, "in", (value) => updateInchPxPair("pageWidthIn", "pageWidthPx", value), errors.pageWidthIn)}
                  {renderUnitInput("Page Width", form.pageWidthPx, "px", (value) => updatePxInchPair("pageWidthPx", "pageWidthIn", value), errors.pageWidthPx)}
                  {renderUnitInput("Page Height", form.pageHeightIn, "in", (value) => updateInchPxPair("pageHeightIn", "pageHeightPx", value), errors.pageHeightIn)}
                  {renderUnitInput("Page Height", form.pageHeightPx, "px", (value) => updatePxInchPair("pageHeightPx", "pageHeightIn", value), errors.pageHeightPx)}
                  {renderUnitInput("Margin Top", form.marginTopIn, "in", (value) => updateField("marginTopIn", value), errors.marginTopIn)}
                  {renderUnitInput("Margin Left", form.marginLeftIn, "in", (value) => updateField("marginLeftIn", value), errors.marginLeftIn)}
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Card Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {renderUnitInput("Card Width", form.cardWidthIn, "in", (value) => updateInchPxPair("cardWidthIn", "cardWidthPx", value), errors.cardWidthIn)}
                  {renderUnitInput("Card Width", form.cardWidthPx, "px", (value) => updatePxInchPair("cardWidthPx", "cardWidthIn", value), errors.cardWidthPx)}
                  {renderUnitInput("Card Height", form.cardHeightIn, "in", (value) => updateInchPxPair("cardHeightIn", "cardHeightPx", value), errors.cardHeightIn)}
                  {renderUnitInput("Card Height", form.cardHeightPx, "px", (value) => updatePxInchPair("cardHeightPx", "cardHeightIn", value), errors.cardHeightPx)}
                  {renderUnitInput("Row Gap", form.rowGapIn, "in", (value) => updateField("rowGapIn", value), errors.rowGapIn)}
                  {renderUnitInput("Column Gap", form.columnGapIn, "in", (value) => updateField("columnGapIn", value), errors.columnGapIn)}
                </div>
              </CardContent>
            </Card>
          </div>

          {saveMessage && <p className="text-sm text-success">{saveMessage}</p>}

          <div className="flex justify-center pt-2">
            <Button onClick={handleSave} className="min-w-40">
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

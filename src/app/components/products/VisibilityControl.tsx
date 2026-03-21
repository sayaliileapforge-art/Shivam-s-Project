import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

export type VisibilityOption = "Vendor" | "Client" | "Public";

interface VisibilityControlProps {
  selected: VisibilityOption[];
  onChange: (selected: VisibilityOption[]) => void;
  disabled?: boolean;
}

const VISIBILITY_OPTIONS: { value: VisibilityOption; label: string; description: string }[] = [
  {
    value: "Vendor",
    label: "Vendor Only",
    description: "Visible to vendors/staff members",
  },
  {
    value: "Client",
    label: "Client Only",
    description: "Visible to registered clients",
  },
  {
    value: "Public",
    label: "Public",
    description: "Visible to everyone",
  },
];

export function VisibilityControl({
  selected,
  onChange,
  disabled = false,
}: VisibilityControlProps) {
  const toggleOption = (option: VisibilityOption) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Visibility Settings</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {VISIBILITY_OPTIONS.map((option) => (
          <div
            key={option.value}
            className="flex items-start space-x-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Checkbox
              id={`visibility-${option.value}`}
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggleOption(option.value)}
              disabled={disabled}
              className="mt-1"
            />
            <div className="flex-1">
              <Label
                htmlFor={`visibility-${option.value}`}
                className="text-sm font-medium cursor-pointer"
              >
                {option.label}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {option.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selected.length === 0 && (
        <p className="text-sm text-destructive">
          Please select at least one visibility option
        </p>
      )}
    </div>
  );
}

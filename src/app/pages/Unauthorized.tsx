import { useNavigate } from "react-router";
import { ShieldX } from "lucide-react";
import { Button } from "../components/ui/button";
import { useRbac } from "../../lib/rbac";

export function Unauthorized() {
  const navigate = useNavigate();
  const { roleLabel } = useRbac();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center px-4">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
        <ShieldX className="h-10 w-10 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          Your current role (<span className="font-medium text-foreground">{roleLabel}</span>)
          does not have permission to access this page.
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
        <Button onClick={() => navigate("/")}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

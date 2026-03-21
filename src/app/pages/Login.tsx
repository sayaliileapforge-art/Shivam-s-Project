import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { useRbac } from "../../lib/rbac/RbacContext";
import { MOCK_USERS } from "../../lib/rbac/mockUsers";
import { ROLE_DEFINITIONS } from "../../lib/rbac/roles";

export function Login() {
  const { user, setUser } = useRbac();
  const navigate = useNavigate();
  const [selectedEmail, setSelectedEmail] = useState<string>(MOCK_USERS[0].email);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    const selectedUser = MOCK_USERS.find((u) => u.email === selectedEmail);
    if (!selectedUser) return;
    setUser(selectedUser);
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Select a user profile to continue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user">User</Label>
            <Select value={selectedEmail} onValueChange={setSelectedEmail}>
              <SelectTrigger id="user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_USERS.map((mockUser) => (
                  <SelectItem key={mockUser.id} value={mockUser.email}>
                    {mockUser.name} ({mockUser.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-3 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">Selected role</p>
            <Badge>
              {ROLE_DEFINITIONS[MOCK_USERS.find((u) => u.email === selectedEmail)?.role || MOCK_USERS[0].role].label}
            </Badge>
          </div>

          <Button className="w-full" onClick={handleLogin}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

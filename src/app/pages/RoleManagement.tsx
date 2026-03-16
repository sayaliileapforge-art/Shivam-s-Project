import { Shield, Plus, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";

const roles = [
  { id: 1, name: "Super Admin", users: 0, permissions: 48 },
  { id: 2, name: "Master Vendor", users: 0, permissions: 42 },
  { id: 3, name: "Sub Vendor", users: 0, permissions: 35 },
  { id: 4, name: "Sales Person", users: 0, permissions: 28 },
  { id: 5, name: "Designer", users: 0, permissions: 22 },
  { id: 6, name: "Data Operator", users: 0, permissions: 18 },
  { id: 7, name: "Production Manager", users: 0, permissions: 30 },
  { id: 8, name: "Client (School)", users: 0, permissions: 12 },
];

const permissionMatrix = [
  { module: "Dashboard", view: true, create: false, edit: false, delete: false },
  { module: "Clients", view: true, create: true, edit: true, delete: false },
  { module: "Projects", view: true, create: true, edit: true, delete: true },
  { module: "Products", view: true, create: true, edit: true, delete: false },
  { module: "Finance", view: true, create: false, edit: false, delete: false },
  { module: "Staff", view: true, create: true, edit: true, delete: true },
];

export function RoleManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Role & Access Management</h1>
          <p className="text-muted-foreground mt-1">Configure roles and permissions</p>
        </div>
        <Can permission={Permission.PLATFORM__MANAGE_ROLES}>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Create Role
        </Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>System Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-secondary/10">
                      <Shield className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-medium">{role.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {role.users} users • {role.permissions} permissions
                      </p>
                    </div>
                  </div>
                  <Can permission={Permission.PLATFORM__MANAGE_ROLES}>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  </Can>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Permission Matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Viewing permissions for: <Badge variant="secondary">Super Admin</Badge>
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-center">View</TableHead>
                  <TableHead className="text-center">Create</TableHead>
                  <TableHead className="text-center">Edit</TableHead>
                  <TableHead className="text-center">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissionMatrix.map((perm, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{perm.module}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perm.view} disabled />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perm.create} disabled />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perm.edit} disabled />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={perm.delete} disabled />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

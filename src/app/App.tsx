import { RouterProvider } from "react-router";
import { router } from "./routes";
import { RbacProvider } from "../lib/rbac/RbacContext";
import type { RbacUser } from "../lib/rbac/RbacContext";
import { Role } from "../lib/rbac/roles";

const CURRENT_USER: RbacUser = {
  id: "00000003-0000-0000-0000-000000000002",
  name: "Vendor User",
  email: "vendor@printsaas.com",
  role: Role.MASTER_VENDOR,
  tenantId: "00000000-0000-0000-0000-000000000001",
  avatarInitials: "MV",
};

export default function App() {
  return (
    <RbacProvider initialUser={CURRENT_USER}>
      <RouterProvider router={router} />
    </RbacProvider>
  );
}

import type { RbacUser } from "./RbacContext";
import { Role } from "./roles";

export const MOCK_USERS: RbacUser[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Super Admin",
    email: "admin@printsaas.com",
    role: Role.SUPER_ADMIN,
    tenantId: "00000000-0000-0000-0000-000000000001",
    avatarInitials: "SA",
  },
  {
    id: "00000003-0000-0000-0000-000000000002",
    name: "Vendor User",
    email: "vendor@printsaas.com",
    role: Role.MASTER_VENDOR,
    tenantId: "00000000-0000-0000-0000-000000000001",
    avatarInitials: "MV",
  },
  {
    id: "00000003-0000-0000-0000-000000000003",
    name: "Accounts Manager",
    email: "accounts@printsaas.com",
    role: Role.ACCOUNTS_MANAGER,
    tenantId: "00000000-0000-0000-0000-000000000001",
    avatarInitials: "AM",
  },
  {
    id: "00000003-0000-0000-0000-000000000004",
    name: "Production Manager",
    email: "production@printsaas.com",
    role: Role.PRODUCTION_MANAGER,
    tenantId: "00000000-0000-0000-0000-000000000001",
    avatarInitials: "PM",
  },
  {
    id: "00000003-0000-0000-0000-000000000005",
    name: "Client User",
    email: "client@printsaas.com",
    role: Role.CLIENT,
    tenantId: "00000000-0000-0000-0000-000000000001",
    avatarInitials: "CL",
  },
];

const STORAGE_KEY = "vendor_staff_members";

export type StaffRole = "Staff" | "Salesperson" | "Credit_manager" | "Accounts" | "Admin";

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  contact: string;
  role: StaffRole;
  address: string;
  pincode: string;
  city: string;
  state: string;
  district: string;
  status: "active" | "inactive";
  createdAt: string;
  photo?: string;
}

export function loadStaff(): StaffMember[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StaffMember[]) : [];
  } catch {
    return [];
  }
}

export function saveStaff(members: StaffMember[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

export function addStaffMember(data: Omit<StaffMember, "id" | "createdAt">): StaffMember {
  const all = loadStaff();
  const member: StaffMember = {
    ...data,
    id: `STF-${Date.now()}`,
    createdAt: new Date().toLocaleDateString("en-IN"),
  };
  saveStaff([...all, member]);
  return member;
}

export function updateStaffMember(id: string, data: Partial<StaffMember>): void {
  const all = loadStaff().map((m) => (m.id === id ? { ...m, ...data } : m));
  saveStaff(all);
}

export function deleteStaffMember(id: string): void {
  saveStaff(loadStaff().filter((m) => m.id !== id));
}

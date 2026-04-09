import { createClient as apiCreateClient, fetchClients as apiFetchClients, updateClient as apiUpdateClient, deleteClient as apiDeleteClient } from './apiService';

const STORAGE_KEY = "vendor_clients";

export interface Client {
  _id?: string;
  id: string;
  clientName: string;
  email: string;
  contact: string;
  gstNumber: string;
  gstName: string;
  gstStateCode: string;
  gstAddress: string;
  deliveryMode: string;
  type: string;
  address: string;
  pincode: string;
  city: string;
  state: string;
  district: string;
  schoollogUniqueId: string;
  busStop: string;
  route: string;
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  salesPerson?: string;
  maxCredit?: number;
  balance?: number;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function pickNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function normalizeStatus(value: unknown): Client['status'] {
  if (value === 'inactive' || value === 'blocked') {
    return value;
  }
  return 'active';
}

function normalizeClientRecord(raw: any, index: number): Client {
  const id = pickString(
    raw._id,
    raw.id,
    raw.schoolCode,
    raw.schoollogUniqueId,
  ) || `legacy-${index}`;

  const createdAt = typeof raw.createdAt === 'string'
    ? raw.createdAt
    : raw.createdAt instanceof Date
      ? raw.createdAt.toISOString()
      : '';

  return {
    _id: pickString(raw._id) || undefined,
    id,
    clientName: pickString(raw.clientName, raw.schoolName, raw.name, raw.companyName, raw.contactName),
    email: pickString(raw.email),
    contact: pickString(raw.contact, raw.phone, raw.mobile, raw.contactNumber),
    gstNumber: pickString(raw.gstNumber, raw.gstNo),
    gstName: pickString(raw.gstName),
    gstStateCode: pickString(raw.gstStateCode),
    gstAddress: pickString(raw.gstAddress),
    deliveryMode: pickString(raw.deliveryMode, raw.deliveryMethod),
    type: pickString(raw.type, raw.clientType),
    address: pickString(raw.address),
    pincode: pickString(raw.pincode, raw.zipCode, raw.postalCode),
    city: pickString(raw.city),
    state: pickString(raw.state),
    district: pickString(raw.district),
    schoollogUniqueId: pickString(raw.schoollogUniqueId, raw.schoolCode, raw.schoolId, raw.uniqueId),
    busStop: pickString(raw.busStop),
    route: pickString(raw.route),
    status: normalizeStatus(raw.status),
    createdAt,
    salesPerson: pickString(raw.salesPerson, raw.salesperson, raw.assignedTo) || undefined,
    maxCredit: pickNumber(raw.maxCredit),
    balance: pickNumber(raw.balance),
  };
}

export async function loadClients(): Promise<Client[]> {
  const localFallback = (): Client[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Client[]) : [];
    } catch {
      return [];
    }
  };

  try {
    const data = await apiFetchClients();
    if (data && Array.isArray(data)) {
      return data.map((c: any, index: number) => normalizeClientRecord(c, index));
    }
    // API returned null — backend is offline, fall back to localStorage
    return localFallback();
  } catch (error) {
    console.error('Failed to load clients from API:', error);
    return localFallback();
  }
}

export async function addClient(data: Omit<Client, "id" | "status" | "createdAt" | "_id">): Promise<Client> {
  try {
    const clientData = {
      ...data,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    const result = await apiCreateClient(clientData);
    if (result) {
      return {
        ...result,
        id: result._id || result.id,
      };
    }
    throw new Error('Failed to create client');
  } catch (error) {
    console.error('Error creating client:', error);
    throw error;
  }
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  try {
    const result = await apiUpdateClient(id, data);
    if (result) {
      return {
        ...result,
        id: result._id || result.id,
      };
    }
    throw new Error('Failed to update client');
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
}

export async function deleteClient(id: string): Promise<boolean> {
  try {
    return await apiDeleteClient(id);
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
}

export interface WalletTransaction {
  id: string;
  clientId: string;
  type: "credit" | "debit";
  amount: number;
  method: string;
  reference: string;
  notes: string;
  date: string;
}

const TXN_STORAGE_KEY = "vendor_wallet_transactions";

export function loadTransactions(clientId: string): WalletTransaction[] {
  try {
    const raw = localStorage.getItem(TXN_STORAGE_KEY);
    const all: WalletTransaction[] = raw ? JSON.parse(raw) : [];
    return all.filter((t) => t.clientId === clientId);
  } catch {
    return [];
  }
}

export function addTransaction(txn: Omit<WalletTransaction, "id" | "date">): WalletTransaction {
  const raw = localStorage.getItem(TXN_STORAGE_KEY);
  const all: WalletTransaction[] = raw ? JSON.parse(raw) : [];
  const newTxn: WalletTransaction = {
    ...txn,
    id: `TXN-${Date.now()}`,
    date: new Date().toLocaleDateString("en-IN"),
  };
  localStorage.setItem(TXN_STORAGE_KEY, JSON.stringify([...all, newTxn]));
  return newTxn;
}

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
      return data.map((c: any) => ({
        ...c,
        id: c._id || c.id,
      }));
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

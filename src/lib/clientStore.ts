const STORAGE_KEY = "vendor_clients";

export interface Client {
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
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  salesPerson?: string;
  maxCredit?: number;
  balance?: number;
}

export function loadClients(): Client[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Client[]) : [];
  } catch {
    return [];
  }
}

export function saveClients(clients: Client[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function addClient(data: Omit<Client, "id" | "status" | "createdAt">): Client {
  const clients = loadClients();
  const newClient: Client = {
    ...data,
    id: `CLT-${Date.now()}`,
    status: "active",
    createdAt: new Date().toLocaleDateString("en-IN"),
  };
  saveClients([...clients, newClient]);
  return newClient;
}

export function deleteClient(id: string): void {
  const clients = loadClients().filter((c) => c.id !== id);
  saveClients(clients);
}

export function updateClient(id: string, data: Partial<Client>): void {
  const clients = loadClients().map((c) => (c.id === id ? { ...c, ...data } : c));
  saveClients(clients);
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

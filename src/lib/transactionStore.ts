const STORAGE_KEY = "vendor_transactions";

export type TxnType = "payment" | "invoice" | "refund" | "credit";
export type TxnStatus = "paid" | "pending" | "overdue" | "refunded";

export interface Transaction {
  id: string;
  client: string;
  clientId: string;
  projectId?: string;
  amount: number;
  type: TxnType;
  status: TxnStatus;
  date: string;       // YYYY-MM-DD
  dueDate?: string;   // YYYY-MM-DD, for invoices
  note?: string;
}

export function loadTransactions(): Transaction[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(data: Transaction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addTransaction(t: Omit<Transaction, "id">): Transaction {
  const tx: Transaction = { ...t, id: `TXN-${Date.now()}` };
  save([...loadTransactions(), tx]);
  return tx;
}

export function updateTransaction(id: string, patch: Partial<Omit<Transaction, "id">>) {
  save(loadTransactions().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function deleteTransaction(id: string) {
  save(loadTransactions().filter((t) => t.id !== id));
}

// ── Derived helpers ─────────────────────────────────────────────

export function getTotalRevenue(txns: Transaction[]) {
  return txns.filter((t) => t.status === "paid" && t.type !== "refund").reduce((s, t) => s + t.amount, 0);
}

export function getPending(txns: Transaction[]) {
  return txns.filter((t) => t.status === "pending").reduce((s, t) => s + t.amount, 0);
}

export function getOverdue(txns: Transaction[]) {
  return txns.filter((t) => t.status === "overdue").reduce((s, t) => s + t.amount, 0);
}

/** Returns monthly revenue totals for the last 12 months */
export function getMonthlyRevenue(txns: Transaction[]): { month: string; revenue: number }[] {
  const now = new Date();
  const results: { month: string; revenue: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const revenue = txns
      .filter((t) => {
        if (t.status !== "paid" || t.type === "refund") return false;
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      })
      .reduce((s, t) => s + t.amount, 0);
    results.push({ month: label, revenue });
  }
  return results;
}

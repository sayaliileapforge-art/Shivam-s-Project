const STORAGE_KEY = "vendor_tickets";

export type TicketCategory = "billing" | "technical" | "delivery" | "design" | "other";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "in-progress" | "resolved" | "closed";

export interface Ticket {
  id: string;
  client: string;
  clientId: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  createdAt: string;   // ISO date string
  resolvedAt?: string;
  assignedTo?: string;
}

export function loadTickets(): Ticket[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(data: Ticket[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addTicket(t: Omit<Ticket, "id" | "createdAt">): Ticket {
  const ticket: Ticket = {
    ...t,
    id: `TKT-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  save([...loadTickets(), ticket]);
  return ticket;
}

export function updateTicket(id: string, patch: Partial<Omit<Ticket, "id" | "createdAt">>) {
  save(
    loadTickets().map((t) => {
      if (t.id !== id) return t;
      const updated = { ...t, ...patch };
      if (patch.status === "resolved" && !t.resolvedAt) {
        updated.resolvedAt = new Date().toISOString();
      }
      return updated;
    })
  );
}

export function deleteTicket(id: string) {
  save(loadTickets().filter((t) => t.id !== id));
}

/** Average resolution time in hours for resolved tickets */
export function avgResolutionHours(tickets: Ticket[]): number {
  const resolved = tickets.filter((t) => t.resolvedAt);
  if (!resolved.length) return 0;
  const total = resolved.reduce((sum, t) => {
    const ms = new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime();
    return sum + ms / (1000 * 60 * 60);
  }, 0);
  return Math.round(total / resolved.length);
}

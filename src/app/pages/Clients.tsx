import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import {
  Plus,
  Search,
  Download,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Wallet,
  Users,
  X,
} from "lucide-react";
import { loadClients, deleteClient, updateClient, type Client } from "../../lib/clientStore";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";

const TYPE_COLORS: Record<string, string> = {
  School: "bg-blue-100 text-blue-700 border-blue-200",
  Business: "bg-purple-100 text-purple-700 border-purple-200",
  Individual: "bg-orange-100 text-orange-700 border-orange-200",
};

export function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [salesPersonFilter, setSalesPersonFilter] = useState("all");

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setIsLoading(true);
        const data = await loadClients();
        setClients(data || []);
      } catch (error) {
        console.error("Failed to load clients:", error);
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchClients();
  }, []);

  const reload = async () => {
    try {
      const data = await loadClients();
      setClients(data || []);
    } catch (error) {
      console.error("Failed to reload clients:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteClient(id);
      await reload();
    } catch (error) {
      console.error("Failed to delete client:", error);
    }
  };

  const handleAssignSalesPerson = async (clientId: string, person: string) => {
    try {
      await updateClient(clientId, { salesPerson: person === "__none__" ? "" : person });
      await reload();
    } catch (error) {
      console.error("Failed to assign sales person:", error);
    }
  };

  const filteredClients = clients.filter((client) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      client.clientName.toLowerCase().includes(q) ||
      client.contact.toLowerCase().includes(q);

    const matchesSalesPerson =
      salesPersonFilter === "all" ||
      (salesPersonFilter === "__unassigned__"
        ? !client.salesPerson
        : client.salesPerson === salesPersonFilter);

    return matchesSearch && matchesSalesPerson;
  });

  const salesPersonOptions = useMemo(() => {
    const names = clients
      .map((c) => c.salesPerson)
      .filter((s): s is string => Boolean(s));
    return Array.from(new Set(names)).sort();
  }, [clients]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">
            Manage your clients and their accounts
          </p>
        </div>
        <Can permission={Permission.CLIENTS__CREATE}>
          <Button className="gap-2" onClick={() => navigate("/clients/add")}>
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        </Can>
      </div>

      {/* Filters */}
      <Card className="shadow-sm border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by client name or contact number..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Sales Person Filter */}
            <Select value={salesPersonFilter} onValueChange={setSalesPersonFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Sales Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sales Persons</SelectItem>
                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                {salesPersonOptions.map((sp) => (
                  <SelectItem key={sp} value={sp}>
                    {sp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset */}
            {(searchQuery || salesPersonFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => { setSearchQuery(""); setSalesPersonFilter("all"); }}
              >
                <X className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}

            <Button variant="outline" className="gap-2 sm:ml-auto">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            All Clients ({filteredClients.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Loading clients...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Sales Person</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="font-semibold text-right">Max Credit</TableHead>
                  <TableHead className="font-semibold text-right">Balance</TableHead>
                  <TableHead className="font-semibold">Created At</TableHead>
                  <TableHead className="font-semibold">Address</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Users className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No clients found. Add your first client.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => {
                    const address = [client.address, client.city, client.state]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <TableRow key={client.id} className="hover:bg-muted/40">
                        {/* Client Name */}
                        <TableCell>
                          <Link
                            to={`/clients/${client.id}`}
                            className="font-medium text-primary hover:underline underline-offset-2"
                          >
                            {client.clientName}
                          </Link>
                        </TableCell>

                        {/* Contact */}
                        <TableCell className="text-sm tabular-nums">
                          {client.contact || "—"}
                        </TableCell>

                        {/* Sales Person — inline assignable dropdown */}
                        <TableCell>
                          <Select
                            value={client.salesPerson || "__none__"}
                            onValueChange={(val) =>
                              handleAssignSalesPerson(client.id, val)
                            }
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs border-dashed">
                              <SelectValue placeholder="Select Sales Person" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Unassigned</SelectItem>
                              {salesPersonOptions.map((sp) => (
                                <SelectItem key={sp} value={sp}>
                                  {sp}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Type */}
                        <TableCell>
                          {client.type ? (
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                                TYPE_COLORS[client.type] ?? "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {client.type}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>

                        {/* Max Credit */}
                        <TableCell className="text-right tabular-nums text-sm">
                          {client.maxCredit != null
                            ? `₹${client.maxCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                            : "0.00"}
                        </TableCell>

                        {/* Balance */}
                        <TableCell className="text-right tabular-nums text-sm">
                          {client.balance != null
                            ? `₹${client.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                            : "0.00"}
                        </TableCell>

                        {/* Created At */}
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {client.createdAt || "—"}
                        </TableCell>

                        {/* Address */}
                        <TableCell
                          className="text-sm text-muted-foreground max-w-[200px] truncate"
                          title={address || undefined}
                        >
                          {address || "—"}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link to={`/clients/${client.id}`} className="cursor-pointer">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Profile
                                </Link>
                              </DropdownMenuItem>
                              <Can permission={Permission.CLIENTS__MANAGE}>
                                <DropdownMenuItem asChild>
                                  <Link to={`/clients/${client.id}`} className="cursor-pointer">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Details
                                  </Link>
                                </DropdownMenuItem>
                              </Can>
                              <Can permission={Permission.WALLET__MANAGE}>
                                <DropdownMenuItem>
                                  <Wallet className="h-4 w-4 mr-2" />
                                  Manage Wallet
                                </DropdownMenuItem>
                              </Can>
                              <Can permission={Permission.CLIENTS__MANAGE}>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDelete(client.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Client
                                </DropdownMenuItem>
                              </Can>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

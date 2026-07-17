import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { Building2, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import { institutionsService } from "../services/organization";
import type { Institution } from "../types";

const columns: ColumnDef<Institution>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {row.getValue("code")}
      </code>
    ),
  },
  {
    accessorKey: "contactEmail",
    header: "Email",
    cell: ({ row }) => row.getValue("contactEmail") || "—",
  },
  {
    accessorKey: "contactPhone",
    header: "Phone",
    cell: ({ row }) => row.getValue("contactPhone") || "—",
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.getValue("isActive") ? "default" : "secondary"}>
        {row.getValue("isActive") ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

export default function InstitutionsPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["institutions", debouncedSearch],
    queryFn: () =>
      institutionsService.list({
        page: 1,
        pageSize: 100,
        search: debouncedSearch || undefined,
      }),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const f = createForm;
      return institutionsService.create({
        name: f.name,
        code: f.code,
        address: f.address || undefined,
        contactEmail: f.contactEmail || undefined,
        contactPhone: f.contactPhone || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      toast.success("Institution created successfully");
      setCreateOpen(false);
      setCreateForm({
        name: "",
        code: "",
        address: "",
        contactEmail: "",
        contactPhone: "",
      });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create institution");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Institutions</h1>
          <p className="text-sm text-muted-foreground">
            Manage educational institutions
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Institution
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search institutions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground/50" />
                    No institutions found
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <p className="text-sm text-muted-foreground">
          {data.total} total institutions
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Institution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Name</Label>
              <Input
                id="inst-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                placeholder="e.g. National Institute of Technology"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-code">Code</Label>
              <Input
                id="inst-code"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm({ ...createForm, code: e.target.value })
                }
                placeholder="e.g. NIT-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-address">Address</Label>
              <Input
                id="inst-address"
                value={createForm.address}
                onChange={(e) =>
                  setCreateForm({ ...createForm, address: e.target.value })
                }
                placeholder="Street, City, State"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inst-email">Contact Email</Label>
                <Input
                  id="inst-email"
                  type="email"
                  value={createForm.contactEmail}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      contactEmail: e.target.value,
                    })
                  }
                  placeholder="admin@institute.edu"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inst-phone">Contact Phone</Label>
                <Input
                  id="inst-phone"
                  value={createForm.contactPhone}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      contactPhone: e.target.value,
                    })
                  }
                  placeholder="+1234567890"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending || !createForm.name || !createForm.code
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

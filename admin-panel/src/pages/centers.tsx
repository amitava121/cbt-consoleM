import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { Loader2, MapPin, Plus, Search } from "lucide-react";
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
import { centersService, institutionsService } from "../services/organization";
import type { Center } from "../types";

const columns: ColumnDef<Center>[] = [
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
    accessorKey: "institutionName",
    header: "Institution",
    cell: ({ row }) => row.getValue("institutionName") || "—",
  },
  {
    accessorKey: "capacity",
    header: "Capacity",
    cell: ({ row }) => `${row.getValue("capacity")} seats`,
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => row.getValue("address") || "—",
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

export default function CentersPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterInstitution, setFilterInstitution] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    institutionId: "",
    name: "",
    code: "",
    address: "",
    capacity: "100",
  });

  const { data: institutionsData } = useQuery({
    queryKey: ["institutions", "all"],
    queryFn: () => institutionsService.list({ page: 1, pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["centers", debouncedSearch, filterInstitution],
    queryFn: () =>
      centersService.list({
        page: 1,
        pageSize: 100,
        search: debouncedSearch || undefined,
        institutionId: filterInstitution || undefined,
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
      return centersService.create({
        institutionId: f.institutionId,
        name: f.name,
        code: f.code,
        address: f.address || undefined,
        capacity: parseInt(f.capacity) || 100,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      toast.success("Center created successfully");
      setCreateOpen(false);
      setCreateForm({
        institutionId: "",
        name: "",
        code: "",
        address: "",
        capacity: "100",
      });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create center");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centers</h1>
          <p className="text-sm text-muted-foreground">
            Manage exam centers within institutions
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Center
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search centers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterInstitution}
          onChange={(e) => setFilterInstitution(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Institutions</option>
          {institutionsData?.data.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
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
                    <MapPin className="h-8 w-8 text-muted-foreground/50" />
                    No centers found
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
          {data.total} total centers
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Center</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="center-institution">Institution</Label>
              <select
                id="center-institution"
                value={createForm.institutionId}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    institutionId: e.target.value,
                  })
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select institution...</option>
                {institutionsData?.data.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} ({inst.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="center-name">Name</Label>
              <Input
                id="center-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                placeholder="e.g. Main Campus Block A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="center-code">Code</Label>
              <Input
                id="center-code"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm({ ...createForm, code: e.target.value })
                }
                placeholder="e.g. CTR-A01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="center-address">Address</Label>
              <Input
                id="center-address"
                value={createForm.address}
                onChange={(e) =>
                  setCreateForm({ ...createForm, address: e.target.value })
                }
                placeholder="Street, City, State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="center-capacity">Capacity (seats)</Label>
              <Input
                id="center-capacity"
                type="number"
                value={createForm.capacity}
                onChange={(e) =>
                  setCreateForm({ ...createForm, capacity: e.target.value })
                }
                placeholder="100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !createForm.name ||
                !createForm.code ||
                !createForm.institutionId
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

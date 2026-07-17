import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { Loader2, Plus, Search, Users } from "lucide-react";
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
import { batchesService, centersService } from "../services/organization";
import type { Batch } from "../types";

const columns: ColumnDef<Batch>[] = [
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
    accessorKey: "centerName",
    header: "Center",
    cell: ({ row }) => row.getValue("centerName") || "—",
  },
  {
    accessorKey: "institutionName",
    header: "Institution",
    cell: ({ row }) => row.getValue("institutionName") || "—",
  },
  {
    accessorKey: "startDate",
    header: "Start Date",
    cell: ({ row }) => {
      const val = row.getValue("startDate") as string;
      return val ? new Date(val).toLocaleDateString() : "—";
    },
  },
  {
    accessorKey: "endDate",
    header: "End Date",
    cell: ({ row }) => {
      const val = row.getValue("endDate") as string | null;
      return val ? new Date(val).toLocaleDateString() : "—";
    },
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

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCenter, setFilterCenter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    centerId: "",
    name: "",
    code: "",
    startDate: "",
    endDate: "",
  });

  const { data: centersData } = useQuery({
    queryKey: ["centers", "all"],
    queryFn: () => centersService.list({ page: 1, pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["batches", debouncedSearch, filterCenter],
    queryFn: () =>
      batchesService.list({
        page: 1,
        pageSize: 100,
        search: debouncedSearch || undefined,
        centerId: filterCenter || undefined,
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
      return batchesService.create({
        centerId: f.centerId,
        name: f.name,
        code: f.code,
        startDate: f.startDate,
        endDate: f.endDate || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success("Batch created successfully");
      setCreateOpen(false);
      setCreateForm({
        centerId: "",
        name: "",
        code: "",
        startDate: "",
        endDate: "",
      });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create batch");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Batches</h1>
          <p className="text-sm text-muted-foreground">
            Manage candidate batches within exam centers
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Batch
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search batches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterCenter}
          onChange={(e) => setFilterCenter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All Centers</option>
          {centersData?.data.map((ctr) => (
            <option key={ctr.id} value={ctr.id}>
              {ctr.name}
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
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                    No batches found
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
          {data.total} total batches
        </p>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batch-center">Center</Label>
              <select
                id="batch-center"
                value={createForm.centerId}
                onChange={(e) =>
                  setCreateForm({ ...createForm, centerId: e.target.value })
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select center...</option>
                {centersData?.data.map((ctr) => (
                  <option key={ctr.id} value={ctr.id}>
                    {ctr.name} ({ctr.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-name">Name</Label>
              <Input
                id="batch-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                placeholder="e.g. JEE 2026 Batch A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batch-code">Code</Label>
              <Input
                id="batch-code"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm({ ...createForm, code: e.target.value })
                }
                placeholder="e.g. JEE26-A"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batch-start">Start Date</Label>
                <Input
                  id="batch-start"
                  type="date"
                  value={createForm.startDate}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-end">End Date</Label>
                <Input
                  id="batch-end"
                  type="date"
                  value={createForm.endDate}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, endDate: e.target.value })
                  }
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
                createMutation.isPending ||
                !createForm.name ||
                !createForm.code ||
                !createForm.centerId ||
                !createForm.startDate
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

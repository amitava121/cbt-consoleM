import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Plus,
    Search,
    Upload,
    UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { candidateService } from "../services/candidates";
import { batchesService } from "../services/organization";
import type { BulkImportCandidateRow, CandidateListItem } from "../types";

interface CreateFormState {
  email: string;
  fullName: string;
  password: string;
  rollNumber: string;
  admitCardNumber: string;
  phone: string;
  batchId: string;
}

const emptyCreateForm: CreateFormState = {
  email: "",
  fullName: "",
  password: "",
  rollNumber: "",
  admitCardNumber: "",
  phone: "",
  batchId: "",
};

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateFormState>(emptyCreateForm);
  const [bulkText, setBulkText] = useState("");
  const [bulkBatchId, setBulkBatchId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["candidates", { page, pageSize, search }],
    queryFn: () =>
      candidateService.list({ page, pageSize, search: search || undefined }),
  });

  const { data: batchesData } = useQuery({
    queryKey: ["batches-list"],
    queryFn: () => batchesService.list({ pageSize: 100 }),
  });

  const batches = batchesData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: CreateFormState) =>
      candidateService.create({
        email: data.email,
        fullName: data.fullName,
        password: data.password,
        rollNumber: data.rollNumber || undefined,
        admitCardNumber: data.admitCardNumber || undefined,
        phone: data.phone || undefined,
        batchId: data.batchId || null,
      }),
    onSuccess: () => {
      toast.success("Candidate created successfully");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create candidate");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (vars: { rows: BulkImportCandidateRow[]; batchId: string }) =>
      candidateService.bulkImport({
        batchId: vars.batchId || null,
        candidates: vars.rows,
      }),
    onSuccess: (res) => {
      toast.success(`${res.imported} imported, ${res.skipped} skipped`);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      setBulkOpen(false);
      setBulkText("");
      setBulkBatchId("");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Bulk import failed");
    },
  });

  const columns = useMemo<ColumnDef<CandidateListItem>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.fullName}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.email}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "rollNumber",
        header: "Roll No.",
        cell: ({ row }) => row.original.rollNumber ?? "—",
      },
      {
        accessorKey: "admitCardNumber",
        header: "Admit Card",
        cell: ({ row }) => row.original.admitCardNumber ?? "—",
      },
      {
        accessorKey: "batchName",
        header: "Batch",
        cell: ({ row }) => row.original.batchName ?? "—",
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => row.original.phone ?? "—",
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            className={
              row.original.isActive
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  const handleBulkImport = () => {
    const lines = bulkText.trim().split("\n").filter(Boolean);
    const rows: BulkImportCandidateRow[] = [];
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 2) continue;
      rows.push({
        email: parts[0],
        fullName: parts[1],
        rollNumber: parts[2] || undefined,
        admitCardNumber: parts[3] || undefined,
        phone: parts[4] || undefined,
      });
    }
    if (rows.length === 0) {
      toast.error(
        "No valid rows found. Format: email,fullName,rollNo,admitCard,phone",
      );
      return;
    }
    bulkMutation.mutate({ rows, batchId: bulkBatchId });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-sm text-muted-foreground">
            Manage candidates and bulk import
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Candidate
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, roll no..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
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
                  No candidates found.
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

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cand-email">Email *</Label>
              <Input
                id="cand-email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-name">Full Name *</Label>
              <Input
                id="cand-name"
                value={createForm.fullName}
                onChange={(e) =>
                  setCreateForm({ ...createForm, fullName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cand-password">Password *</Label>
              <Input
                id="cand-password"
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cand-roll">Roll Number</Label>
                <Input
                  id="cand-roll"
                  value={createForm.rollNumber}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, rollNumber: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cand-admit">Admit Card No.</Label>
                <Input
                  id="cand-admit"
                  value={createForm.admitCardNumber}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      admitCardNumber: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cand-phone">Phone</Label>
                <Input
                  id="cand-phone"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cand-batch">Batch</Label>
                <select
                  id="cand-batch"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={createForm.batchId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, batchId: e.target.value })
                  }
                >
                  <option value="">No batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                createMutation.isPending ||
                !createForm.email ||
                !createForm.fullName ||
                !createForm.password
              }
              onClick={() => createMutation.mutate(createForm)}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Candidates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-batch">Assign to Batch (optional)</Label>
              <select
                id="bulk-batch"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={bulkBatchId}
                onChange={(e) => setBulkBatchId(e.target.value)}
              >
                <option value="">No batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-text">Paste CSV data (one per line)</Label>
              <p className="text-xs text-muted-foreground">
                Format: email, fullName, rollNumber, admitCardNumber, phone
              </p>
              <textarea
                id="bulk-text"
                className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm font-mono"
                placeholder="john@example.com,John Doe,ROLL001,ADM001,9876543210&#10;jane@example.com,Jane Smith,ROLL002,ADM002,9876543211"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={bulkMutation.isPending || !bulkText.trim()}
              onClick={handleBulkImport}
            >
              {bulkMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

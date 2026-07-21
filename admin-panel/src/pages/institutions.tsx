import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { Building2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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

const emptyForm = {
  name: "",
  code: "",
  address: "",
  contactEmail: "",
  contactPhone: "",
};

export default function InstitutionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Institution | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Institution | null>(null);
  const [createForm, setCreateForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // Bulk Delete States
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);


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
    staleTime: 30 * 1000,
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
      queryClient.invalidateQueries({ queryKey: ["institutions-list"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success("Institution created successfully");
      setCreateOpen(false);
      setCreateForm({ ...emptyForm });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create institution");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      const f = editForm;
      return institutionsService.update(editTarget.id, {
        name: f.name,
        code: f.code,
        address: f.address || undefined,
        contactEmail: f.contactEmail || undefined,
        contactPhone: f.contactPhone || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      queryClient.invalidateQueries({ queryKey: ["institutions-list"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success("Institution updated successfully");
      setEditOpen(false);
      setEditTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to update institution");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No target");
      return institutionsService.delete(deleteTarget.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      queryClient.invalidateQueries({ queryKey: ["institutions-list"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      toast.success("Institution deleted successfully");
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to delete institution");
    },
  });

  const openEdit = (inst: Institution) => {
    setEditTarget(inst);
    setEditForm({
      name: inst.name,
      code: inst.code,
      address: inst.address ?? "",
      contactEmail: inst.contactEmail ?? "",
      contactPhone: inst.contactPhone ?? "",
    });
    setEditOpen(true);
  };

  const columns: ColumnDef<Institution>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
          aria-label="Select all"
          className="h-4 w-4 rounded border-border bg-background accent-primary text-primary focus:ring-primary cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(!!e.target.checked)}
          aria-label="Select row"
          className="h-4 w-4 rounded border-border bg-background accent-primary text-primary focus:ring-primary cursor-pointer"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setDeleteTarget(row.original);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });


  const handleBulkDelete = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) return;

    setBulkDeleting(true);
    try {
      const deletePromises = selectedRows.map((row) =>
        institutionsService.delete(row.original.id)
      );
      await Promise.all(deletePromises);
      toast.success(`Successfully deleted ${selectedRows.length} institutions`);
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      queryClient.invalidateQueries({ queryKey: ["institutions-list"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      setRowSelection({});
      setBulkDeleteConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete some institutions");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search institutions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          {table.getSelectedRowModel().rows.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteConfirmOpen(true)}
              className="shadow-sm transition-all animate-in fade-in zoom-in-95 duration-200"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete Selected ({table.getSelectedRowModel().rows.length})
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Institution
          </Button>
        </div>
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
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => navigate(`/institutions/${row.original.id}`)}
                >
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Institution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-inst-name">Name</Label>
              <Input
                id="edit-inst-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inst-code">Code</Label>
              <Input
                id="edit-inst-code"
                value={editForm.code}
                onChange={(e) =>
                  setEditForm({ ...editForm, code: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inst-address">Address</Label>
              <Input
                id="edit-inst-address"
                value={editForm.address}
                onChange={(e) =>
                  setEditForm({ ...editForm, address: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-inst-email">Contact Email</Label>
                <Input
                  id="edit-inst-email"
                  type="email"
                  value={editForm.contactEmail}
                  onChange={(e) =>
                    setEditForm({ ...editForm, contactEmail: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-inst-phone">Contact Phone</Label>
                <Input
                  id="edit-inst-phone"
                  value={editForm.contactPhone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, contactPhone: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={
                updateMutation.isPending || !editForm.name || !editForm.code
              }
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Institution</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.name}
            </span>
            ? This will permanently delete all related batches, candidates,
            users, exams, attempts, and results. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">Confirm Bulk Deletion</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete the{" "}
              <span className="font-bold text-foreground">
                {table.getSelectedRowModel().rows.length}
              </span>{" "}
              selected institution(s)? This will permanently delete all related batches,
              candidates, users, exams, attempts, and results. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteConfirmOpen(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

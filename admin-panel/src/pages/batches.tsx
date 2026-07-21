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
    ArrowLeft,
    BookOpen,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
    Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { FolderCard } from "../components/ui/folder-card";

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
import { batchesService, institutionsService } from "../services/organization";
import { subjectsService } from "../services/subjects";
import type { Batch, Subject, UpdateBatchInput } from "../types";
import CandidatesPage from "./candidates";

const emptyCreateForm = {
  institutionId: "",
  name: "",
  code: "",
};

const emptyEditForm = {
  institutionId: "",
  name: "",
  code: "",
};

export default function BatchesPage({
  institutionId,
  hideHeader: _hideHeader,
  onBack,
  batchFolder,

  setBatchFolder,
  selectedBatch,
  setSelectedBatch,
  selectedSubject,
  setSelectedSubject,
}: {
  institutionId?: string;
  hideHeader?: boolean;
  onBack?: () => void;
  batchFolder: "subjects" | "candidates" | null;
  setBatchFolder: (folder: "subjects" | "candidates" | null) => void;
  selectedBatch: Batch | null;
  setSelectedBatch: (batch: Batch | null) => void;
  selectedSubject: Subject | null;
  setSelectedSubject: (subject: Subject | null) => void;
}) {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Batch | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Batch | null>(null);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm });
  const [editForm, setEditForm] = useState({ ...emptyEditForm });

  // Bulk Delete States
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["batches", debouncedSearch, institutionId],
    queryFn: () =>
      batchesService.list({
        page: 1,
        pageSize: 100,
        search: debouncedSearch || undefined,
        institutionId,
      }),
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
  });

  const { data: institutionsData } = useQuery({
    queryKey: ["institutions-list"],
    queryFn: () => institutionsService.list({ pageSize: 100 }),
    staleTime: 30 * 1000,
  });

  const institutions = institutionsData?.data ?? [];

  const columns: ColumnDef<Batch>[] = [
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
    ...(institutionId
      ? []
      : [
          {
            accessorKey: "institutionName",
            header: "Institution",
            cell: ({ row }: { row: any }) =>
              row.getValue("institutionName") ?? "—",
          } as ColumnDef<Batch>,
        ]),
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

  const createMutation = useMutation({
    mutationFn: () => {
      const f = createForm;
      return batchesService.create({
        institutionId: f.institutionId,
        name: f.name,
        code: f.code,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      toast.success("Batch created successfully");
      setCreateOpen(false);
      setCreateForm({ ...emptyCreateForm });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to create batch");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      const f = editForm;
      const data: UpdateBatchInput = {
        institutionId: f.institutionId,
        name: f.name,
        code: f.code,
      };
      return batchesService.update(editTarget.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      toast.success("Batch updated successfully");
      setEditOpen(false);
      setEditTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to update batch");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No target");
      return batchesService.delete(deleteTarget.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      toast.success("Batch deleted successfully");
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error ?? "Failed to delete batch");
    },
  });

  const openEdit = (batch: Batch) => {
    setEditTarget(batch);
    setEditForm({
      institutionId: institutionId || batch.institutionId,
      name: batch.name,
      code: batch.code,
    });
    setEditOpen(true);
  };

  const handleBulkDelete = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) return;

    setBulkDeleting(true);
    try {
      const deletePromises = selectedRows.map((row) =>
        batchesService.delete(row.original.id),
      );
      await Promise.all(deletePromises);
      toast.success(`Successfully deleted ${selectedRows.length} batches`);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batches-list"] });
      setRowSelection({});
      setBulkDeleteConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete some batches");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!selectedBatch && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              {onBack && (
                <Button variant="outline" size="sm" onClick={onBack}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search batches..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>
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
              <Button
                size="sm"
                onClick={() => {
                  setCreateForm({
                    ...emptyCreateForm,
                    institutionId: institutionId || "",
                  });
                  setCreateOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Batch
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
                        <Users className="h-8 w-8 text-muted-foreground/50" />
                        No batches found
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // Don't navigate when clicking checkbox or actions
                        const target = e.target as HTMLElement;
                        if (
                          target.tagName === "INPUT" ||
                          target.closest("button")
                        ) {
                          return;
                        }
                        setSelectedBatch(row.original);
                        setBatchFolder(null);
                      }}
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
              {data.total} total batches
            </p>
          )}
        </>
      )}

      {/* Batch detail view with folders */}
      {selectedBatch && (
        <div className="space-y-6">
          {onBack && !batchFolder && (
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={onBack}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
            </div>
          )}
          {/* Folder cards */}
          {!batchFolder && (
            <div className="grid gap-6 sm:grid-cols-2 max-w-2xl mx-auto pt-4">
              <FolderCard
                label="Subjects"
                description="Assigned batch subjects & question papers"
                icon={BookOpen}
                variant="emerald"
                onClick={() => setBatchFolder("subjects")}
              />
              <FolderCard
                label="Candidates"
                description="Enrolled batch candidates & students"
                icon={Users}
                variant="purple"
                onClick={() => setBatchFolder("candidates")}
              />
            </div>
          )}

          {/* Subjects folder content */}
          {batchFolder === "subjects" && !selectedSubject && (
            <BatchSubjectsView
              batch={selectedBatch}
              setSelectedSubject={setSelectedSubject}
              onBack={onBack}
            />
          )}

          {/* Candidates folder content */}
          {batchFolder === "candidates" && (
            <CandidatesPage
              institutionId={selectedBatch.institutionId}
              batchId={selectedBatch.id}
              hideHeader
              onBack={onBack}
            />
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!institutionId && (
              <div className="space-y-2">
                <Label htmlFor="batch-institution">Institution</Label>
                <select
                  id="batch-institution"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={createForm.institutionId}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      institutionId: e.target.value,
                    })
                  }
                >
                  <option value="">Select institution...</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !createForm.institutionId ||
                !createForm.name ||
                !createForm.code
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
            <DialogTitle>Edit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!institutionId && (
              <div className="space-y-2">
                <Label htmlFor="edit-batch-institution">Institution</Label>
                <select
                  id="edit-batch-institution"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={editForm.institutionId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, institutionId: e.target.value })
                  }
                >
                  <option value="">Select institution...</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-batch-name">Name</Label>
              <Input
                id="edit-batch-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-batch-code">Code</Label>
              <Input
                id="edit-batch-code"
                value={editForm.code}
                onChange={(e) =>
                  setEditForm({ ...editForm, code: e.target.value })
                }
              />
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
            <DialogTitle>Delete Batch</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.name}
            </span>
            ? This will permanently delete all related candidates, users, exams,
            attempts, and results. This action cannot be undone.
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
      <Dialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">
              Confirm Bulk Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete the{" "}
              <span className="font-bold text-foreground">
                {table.getSelectedRowModel().rows.length}
              </span>{" "}
              selected batch(es)? This will permanently delete all related
              candidates, users, exams, attempts, and results. This action
              cannot be undone.
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

/* ----- BatchSubjectsView: inline subjects management ----- */
function BatchSubjectsView({
  batch,
  setSelectedSubject,
  onBack,
}: {
  batch: Batch;
  setSelectedSubject: (subject: Subject | null) => void;
  onBack?: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: batchSubjectsData, isLoading: batchSubjectsLoading } = useQuery(
    {
      queryKey: ["batch-subjects", batch.id],
      queryFn: () => subjectsService.getBatchSubjects(batch.id),
      staleTime: 30 * 1000,
    },
  );

  const { data: availableSubjectsData } = useQuery({
    queryKey: ["subjects", "institution", batch.institutionId],
    queryFn: () =>
      subjectsService.list({
        page: 1,
        pageSize: 100,
        institutionId: batch.institutionId,
      }),
    staleTime: 30 * 1000,
  });

  const addSubjectMutation = useMutation({
    mutationFn: (subjectId: string) =>
      subjectsService.addBatchSubjects(batch.id, [subjectId]),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batch-subjects", batch.id],
      });
      toast.success("Subject added to batch");
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? "Failed to add subject"),
  });

  const removeSubjectMutation = useMutation({
    mutationFn: (subjectId: string) =>
      subjectsService.removeBatchSubject(batch.id, subjectId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["batch-subjects", batch.id],
      });
      toast.success("Subject removed from batch");
    },
    onError: () => toast.error("Failed to remove subject"),
  });

  const batchSubjectsList = batchSubjectsData?.data ?? [];
  const availableSubjects = (availableSubjectsData?.data ?? []).filter(
    (s: Subject) => !batchSubjectsList.some((bs: Subject) => bs.id === s.id),
  );

  return (
    <div className="space-y-4">
      {onBack && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back
          </Button>
        </div>
      )}

      {/* Assigned subjects */}
      <div>
        <h3 className="mb-2 text-sm font-medium">
          Assigned Subjects ({batchSubjectsList.length})
        </h3>
        {batchSubjectsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : batchSubjectsList.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No subjects assigned to this batch yet.
          </p>
        ) : (
          <div className="space-y-2">
            {batchSubjectsList.map((s: Subject) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => setSelectedSubject(s)}
                >
                  <p className="font-medium hover:text-primary">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {s.code}
                    </code>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSubjectMutation.mutate(s.id)}
                  disabled={removeSubjectMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available subjects to add */}
      {availableSubjects.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Available Subjects ({availableSubjects.length})
          </h3>
          <div className="space-y-2">
            {availableSubjects.map((s: Subject) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {s.code}
                    </code>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addSubjectMutation.mutate(s.id)}
                  disabled={addSubjectMutation.isPending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableSubjects.length === 0 && batchSubjectsList.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          All subjects from this institution are already assigned.
        </p>
      )}
    </div>
  );
}

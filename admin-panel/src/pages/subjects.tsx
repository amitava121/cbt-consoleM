import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { institutionsService } from "../services/organization";
import { subjectsService } from "../services/subjects";
import type { Subject } from "../types";

export default function SubjectsPage({
  institutionId,
  hideHeader: _hideHeader,
  onBack,
  onSelectSubject,
}: {
  institutionId?: string;
  hideHeader?: boolean;
  onBack?: () => void;
  onSelectSubject?: (subject: Subject) => void;
}) {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [editTarget, setEditTarget] = useState<Subject | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    code: "",
    description: "",
  });
  const [createForm, setCreateForm] = useState({
    institutionId: "",
    name: "",
    code: "",
    description: "",
  });
  const { data: institutionsData } = useQuery({
    queryKey: ["institutions-list"],
    queryFn: () => institutionsService.list({ pageSize: 100 }),
    staleTime: 30 * 1000,
  });
  const institutions = institutionsData?.data ?? [];

  const columns: ColumnDef<Subject>[] = [
    ...(institutionId
      ? []
      : [
          {
            accessorKey: "institutionId",
            header: "Institution",
            cell: ({ row }: { row: any }) => {
              const inst = institutions.find(
                (i) => i.id === row.getValue("institutionId"),
              );
              return inst ? inst.name : "—";
            },
          } as ColumnDef<Subject>,
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
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        const val = row.getValue("description") as string | null;
        return val ? <span className="text-muted-foreground">{val}</span> : "—";
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("isActive") ? "default" : "destructive"}>
          {row.getValue("isActive") ? "Active" : "Disabled"}
        </Badge>
      ),
    },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["subjects", search, institutionId],
    queryFn: () =>
      subjectsService.list({
        page: 1,
        pageSize: 100,
        search: search || undefined,
        institutionId,
      }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: () => subjectsService.create(createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject created successfully");
      setCreateOpen(false);
      setCreateForm({ institutionId: "", name: "", code: "", description: "" });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? "Failed to create subject"),
  });

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No target");
      return subjectsService.update(editTarget.id, editForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject updated successfully");
      setEditTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? "Failed to update subject"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deleteTarget) throw new Error("No target");
      return subjectsService.permanentDelete(deleteTarget.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject deleted permanently");
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      toast.error(err.response?.data?.error ?? "Failed to delete subject"),
  });

  const tableData = useMemo(() => data?.data ?? [], [data]);

  const table = useReactTable({
    data: tableData,
    columns: [
      ...columns,
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {onSelectSubject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectSubject(row.original)}
              >
                Questions
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditTarget(row.original);
                setEditForm({
                  name: row.original.name,
                  code: row.original.code,
                  description: row.original.description ?? "",
                });
              }}
              title="Edit subject"
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
              title="Delete subject permanently"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
      },
    ],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
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
              placeholder="Search subjects by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setCreateForm({
              institutionId: institutionId || "",
              name: "",
              code: "",
              description: "",
            });
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Subject
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
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
                  colSpan={columns.length + 1}
                  className="h-24 text-center"
                >
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : tableData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="h-24 text-center text-muted-foreground"
                >
                  No subjects found
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

      <p className="text-sm text-muted-foreground">
        {data ? `${data.total} total subjects` : "Loading..."}
      </p>

      {/* Create Subject Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!institutionId && (
              <div className="space-y-2">
                <Label>Institution</Label>
                <select
                  value={createForm.institutionId}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      institutionId: e.target.value,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Select institution...</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="subj-name">Name</Label>
              <Input
                id="subj-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subj-code">Code</Label>
              <Input
                id="subj-code"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="e.g. PHY, CHEM, MATH"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subj-desc">Description (optional)</Label>
              <Input
                id="subj-desc"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
                }
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
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subject Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-subj-name">Name</Label>
              <Input
                id="edit-subj-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subj-code">Code</Label>
              <Input
                id="edit-subj-code"
                value={editForm.code}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subj-desc">Description (optional)</Label>
              <Input
                id="edit-subj-desc"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={
                editMutation.isPending || !editForm.name || !editForm.code
              }
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subject Permanently</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.name}
            </span>
            ? This will permanently delete all related questions, question
            versions, options, tags, and batch associations. This action cannot
            be undone.
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
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
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
import { usersService } from "../services/users";
import type { User, UserRole } from "../types";

const roleVariants: Record<UserRole, "destructive" | "info" | "success" | "warning" | "secondary"> = {
  super_admin: "destructive",
  exam_admin: "info",
  proctor: "success",
  question_author: "warning",
  candidate: "secondary",
};

const columns: ColumnDef<User>[] = [
  {
    accessorKey: "fullName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-semibold text-foreground">{row.getValue("fullName")}</span>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.getValue("email")}</span>
    ),
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const role = row.getValue("role") as UserRole;
      return (
        <Badge variant={roleVariants[role] ?? "secondary"} className="capitalize">
          {role.replace("_", " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.getValue("isActive") ? "success" : "destructive"}>
        {row.getValue("isActive") ? "Active" : "Disabled"}
      </Badge>
    ),
  },

  {
    accessorKey: "lastLoginAt",
    header: "Last Login",
    cell: ({ row }) => {
      const val = row.getValue("lastLoginAt") as string | null;
      return val ? new Date(val).toLocaleDateString() : "Never";
    },
  },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "exam_admin" as UserRole,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["users", pagination.pageIndex, pagination.pageSize, search],
    queryFn: () =>
      usersService.list({
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: search || undefined,
        excludeRole: "candidate",
      }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: () => usersService.create(createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created successfully");
      setCreateOpen(false);
      setCreateForm({
        email: "",
        password: "",
        fullName: "",
        role: "exam_admin",
      });
    },
    onError: () => toast.error("Failed to create user"),
  });

  const tableData = useMemo(() => data?.data ?? [], [data]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: data ? Math.ceil(data.total / data.pageSize) : -1,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users by name, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add User
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
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : tableData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No users found
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} total users` : "Loading..."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {pagination.pageIndex + 1}
            {data ? ` of ${Math.ceil(data.total / data.pageSize)}` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Full Name</Label>
              <Input
                id="create-name"
                value={createForm.fullName}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, fullName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role">Role</Label>
              <select
                id="create-role"
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    role: e.target.value as UserRole,
                  }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="super_admin">Super Admin</option>
                <option value="exam_admin">Exam Admin</option>
                <option value="proctor">Proctor</option>
                <option value="question_author">Question Author</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

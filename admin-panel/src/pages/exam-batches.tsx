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
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    Pause,
    Play,
    Plus,
    Search,
    Square,
    Upload,
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
import { examBatchService } from "../services/exam-batches";
import { examsService } from "../services/exams";
import type { ExamBatchListItem, ExamBatchStatus } from "../types";

const STATUS_COLORS: Record<ExamBatchStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-indigo-100 text-indigo-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  submission_window: "bg-orange-100 text-orange-700",
  finished: "bg-purple-100 text-purple-700",
  results_published: "bg-teal-100 text-teal-700",
  archived: "bg-gray-200 text-gray-500",
};

const LIFECYCLE_ACTIONS: Record<
  ExamBatchStatus,
  { label: string; action: string; icon: typeof Play }[]
> = {
  draft: [{ label: "Schedule", action: "schedule", icon: CalendarClock }],
  scheduled: [{ label: "Publish", action: "publish", icon: Upload }],
  published: [{ label: "Activate", action: "activate", icon: Play }],
  active: [
    { label: "Pause", action: "pause", icon: Pause },
    { label: "Finish", action: "finish", icon: Square },
  ],
  paused: [
    { label: "Resume", action: "resume", icon: Play },
    { label: "Finish", action: "finish", icon: Square },
  ],
  submission_window: [{ label: "Finish", action: "finish", icon: Square }],
  finished: [
    { label: "Publish Results", action: "publish-results", icon: FileText },
  ],
  results_published: [],
  archived: [],
};

interface BatchFormState {
  examId: string;
  name: string;
  shiftNumber: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  gracePeriodMinutes: number;
}

const emptyForm: BatchFormState = {
  examId: "",
  name: "",
  shiftNumber: 1,
  scheduledStartAt: "",
  scheduledEndAt: "",
  gracePeriodMinutes: 5,
};

const columns: ColumnDef<ExamBatchListItem>[] = [
  {
    accessorKey: "name",
    header: "Batch Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as ExamBatchStatus;
      return (
        <Badge className={STATUS_COLORS[status]} variant="secondary">
          {status.replace(/_/g, " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "shiftNumber",
    header: "Shift",
    cell: ({ row }) => `Shift ${row.getValue("shiftNumber")}`,
  },
  {
    accessorKey: "scheduledStartAt",
    header: "Scheduled Start",
    cell: ({ row }) =>
      new Date(row.getValue("scheduledStartAt")).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
  },
  {
    accessorKey: "scheduledEndAt",
    header: "Scheduled End",
    cell: ({ row }) =>
      new Date(row.getValue("scheduledEndAt")).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
  },
  {
    accessorKey: "actualStartAt",
    header: "Actual Start",
    cell: ({ row }) => {
      const val = row.getValue("actualStartAt") as string | null;
      return val
        ? new Date(val).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <BatchActions batch={row.original} />,
  },
];

function BatchActions({ batch }: { batch: ExamBatchListItem }) {
  const queryClient = useQueryClient();
  const actions = LIFECYCLE_ACTIONS[batch.status] ?? [];

  const lifecycleMutation = useMutation({
    mutationFn: ({ batchId, action }: { batchId: string; action: string }) => {
      switch (action) {
        case "publish":
          return examBatchService.publish(batchId);
        case "activate":
          return examBatchService.activate(batchId);
        case "pause":
          return examBatchService.pause(batchId);
        case "resume":
          return examBatchService.resume(batchId);
        case "finish":
          return examBatchService.finish(batchId);
        case "publish-results":
          return examBatchService.publishResults(batchId);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-batches"] });
      toast.success("Status updated");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : "Failed to update status";
      toast.error(msg);
    },
  });

  if (actions.length === 0)
    return <span className="text-xs text-muted-foreground">No actions</span>;

  return (
    <div className="flex gap-1">
      {actions.map(({ label, action, icon: Icon }) => (
        <Button
          key={action}
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={lifecycleMutation.isPending}
          onClick={() =>
            lifecycleMutation.mutate({ batchId: batch.id, action })
          }
        >
          <Icon className="mr-1 h-3 w-3" />
          {label}
        </Button>
      ))}
    </div>
  );
}

export default function ExamBatchesPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<BatchFormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["exam-batches", search, page],
    queryFn: () =>
      examBatchService.list({
        page,
        pageSize: 20,
        search: search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: examsData } = useQuery({
    queryKey: ["exams-for-batch"],
    queryFn: () => examsService.list({ page: 1, pageSize: 100 }),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const toISO = (dt: string) => {
        if (!dt) throw new Error("Date is required");
        return new Date(dt).toISOString();
      };
      return examBatchService.create({
        examId: form.examId,
        name: form.name,
        shiftNumber: form.shiftNumber,
        scheduledStartAt: toISO(form.scheduledStartAt),
        scheduledEndAt: toISO(form.scheduledEndAt),
        gracePeriodMinutes: form.gracePeriodMinutes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-batches"] });
      toast.success("Exam batch created");
      setCreateOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast.error("Failed to create exam batch"),
  });

  const tableData = useMemo(() => data?.data ?? [], [data]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exam Batches</h1>
          <p className="text-sm text-muted-foreground">
            Manage exam sessions and lifecycle
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Batch
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search batches..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
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
            ) : tableData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No exam batches found
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Total: {data?.total ?? 0} batches
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Exam Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="examId">Exam</Label>
              <select
                id="examId"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.examId}
                onChange={(e) => setForm({ ...form, examId: e.target.value })}
              >
                <option value="">Select an exam...</option>
                {examsData?.data
                  ?.filter((e) => e.isActive)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.code})
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Batch Name</Label>
              <Input
                id="name"
                placeholder="e.g., JEE Mock Test 1 — Morning Shift"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shiftNumber">Shift Number</Label>
                <Input
                  id="shiftNumber"
                  type="number"
                  min={1}
                  value={form.shiftNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      shiftNumber: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gracePeriodMinutes">Grace Period (mins)</Label>
                <Input
                  id="gracePeriodMinutes"
                  type="number"
                  min={0}
                  max={120}
                  value={form.gracePeriodMinutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      gracePeriodMinutes: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledStartAt">Scheduled Start</Label>
                <Input
                  id="scheduledStartAt"
                  type="datetime-local"
                  value={form.scheduledStartAt}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scheduledStartAt: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledEndAt">Scheduled End</Label>
                <Input
                  id="scheduledEndAt"
                  type="datetime-local"
                  value={form.scheduledEndAt}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scheduledEndAt: e.target.value,
                    })
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
              disabled={
                createMutation.isPending ||
                !form.examId ||
                !form.name ||
                !form.scheduledStartAt ||
                !form.scheduledEndAt
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

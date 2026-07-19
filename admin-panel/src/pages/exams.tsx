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
    ClipboardList,
    Loader2,
    Plus,
    Search,
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
import { examsService } from "../services/exams";
import type { Exam, NavigationMode, SelectionStrategy } from "../types";

const columns: ColumnDef<Exam>[] = [
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
      <Badge variant="secondary">{row.getValue("code")}</Badge>
    ),
  },
  {
    accessorKey: "durationMinutes",
    header: "Duration",
    cell: ({ row }) => {
      const mins = row.getValue("durationMinutes") as number;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    },
  },
  {
    accessorKey: "totalMarks",
    header: "Total Marks",
    cell: ({ row }) => row.getValue("totalMarks"),
  },
  {
    accessorKey: "selectionStrategy",
    header: "Strategy",
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.getValue("selectionStrategy")}
      </Badge>
    ),
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
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) =>
      new Date(row.getValue("createdAt") as string).toLocaleDateString(),
  },
];

interface ExamFormState {
  name: string;
  code: string;
  description: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  hasNegativeMarking: boolean;
  selectionStrategy: SelectionStrategy;
  navigationMode: NavigationMode;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultVisibility: string;
  instructionsTitle: string;
  instructionsBody: string;
  instructionsRules: string;
}

const emptyForm: ExamFormState = {
  name: "",
  code: "",
  description: "",
  durationMinutes: 180,
  totalMarks: 300,
  passingMarks: 100,
  hasNegativeMarking: true,
  selectionStrategy: "static" as const,
  navigationMode: "free" as const,
  shuffleQuestions: false,
  shuffleOptions: true,
  resultVisibility: "delayed",
  instructionsTitle: "",
  instructionsBody: "",
  instructionsRules: "",
};

export default function ExamsPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["exams", search, page],
    queryFn: () =>
      examsService.list({
        page,
        pageSize: 20,
        search: search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const {
        instructionsTitle,
        instructionsBody,
        instructionsRules,
        ...examFields
      } = form;
      const instructions =
        instructionsTitle || instructionsBody || instructionsRules
          ? {
              title: instructionsTitle || undefined,
              body: instructionsBody || undefined,
              rules: instructionsRules
                ? instructionsRules.split("\n").filter(Boolean)
                : undefined,
            }
          : undefined;
      return examsService.create({
        ...examFields,
        description: examFields.description || undefined,
        passingMarks: examFields.passingMarks || undefined,
        instructions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      toast.success("Exam created successfully");
      setCreateOpen(false);
      setForm(emptyForm);
      setWizardStep(0);
    },
    onError: () => toast.error("Failed to create exam"),
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

  const steps = ["Details", "Configuration", "Instructions"];
  const canNext = () => {
    if (wizardStep === 0) return form.name && form.code;
    return true;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exams</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage exam blueprints
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(emptyForm);
            setWizardStep(0);
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Exam
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exams..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
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
                  No exams found
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
        {data ? `${data.total} total exams` : "Loading..."}
      </p>

      {data && data.total > 20 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
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
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(data.total / 20)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Exam Wizard */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Create Exam — Step {wizardStep + 1} of {steps.length}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 pb-2">
            {steps.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    i === wizardStep
                      ? "bg-primary text-primary-foreground"
                      : i < wizardStep
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-sm ${i === wizardStep ? "font-medium" : "text-muted-foreground"}`}
                >
                  {step}
                </span>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          {/* Step 0: Details */}
          {wizardStep === 0 && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exam-name">Exam Name *</Label>
                  <Input
                    id="exam-name"
                    placeholder="JEE Mock Test 1"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-code">Code *</Label>
                  <Input
                    id="exam-code"
                    placeholder="JEE-MOCK-001"
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-desc">Description</Label>
                <Input
                  id="exam-desc"
                  placeholder="Full-length JEE mock test"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exam-duration">Duration (min)</Label>
                  <Input
                    id="exam-duration"
                    type="number"
                    min={1}
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        durationMinutes: parseInt(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-marks">Total Marks</Label>
                  <Input
                    id="exam-marks"
                    type="number"
                    min={0}
                    value={form.totalMarks}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        totalMarks: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-passing">Passing Marks</Label>
                  <Input
                    id="exam-passing"
                    type="number"
                    min={0}
                    value={form.passingMarks}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        passingMarks: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Configuration */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exam-strategy">
                    Question Selection Strategy
                  </Label>
                  <select
                    id="exam-strategy"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.selectionStrategy}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        selectionStrategy: e.target.value as
                          | "static"
                          | "random"
                          | "hybrid",
                      }))
                    }
                  >
                    <option value="static">Static (fixed questions)</option>
                    <option value="random">Random (from pool)</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exam-nav">Navigation Mode</Label>
                  <select
                    id="exam-nav"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.navigationMode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        navigationMode: e.target.value as
                          | "free"
                          | "linear"
                          | "section_free",
                      }))
                    }
                  >
                    <option value="free">Free (jump anywhere)</option>
                    <option value="linear">Linear (sequential only)</option>
                    <option value="section_free">Section Free</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exam-result-vis">Result Visibility</Label>
                  <select
                    id="exam-result-vis"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.resultVisibility}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        resultVisibility: e.target.value,
                      }))
                    }
                  >
                    <option value="instant">Instant</option>
                    <option value="delayed">Delayed</option>
                    <option value="score_only">Score Only</option>
                  </select>
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.hasNegativeMarking}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          hasNegativeMarking: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                    />
                    Negative Marking
                  </label>
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.shuffleQuestions}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shuffleQuestions: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  Shuffle Questions
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.shuffleOptions}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        shuffleOptions: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  Shuffle Options
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Instructions */}
          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="instr-title">Instructions Title</Label>
                <Input
                  id="instr-title"
                  placeholder="JEE Mock Test 1"
                  value={form.instructionsTitle}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      instructionsTitle: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instr-body">Instructions Body</Label>
                <textarea
                  id="instr-body"
                  placeholder="Read all instructions carefully before starting."
                  value={form.instructionsBody}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, instructionsBody: e.target.value }))
                  }
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instr-rules">Rules (one per line)</Label>
                <textarea
                  id="instr-rules"
                  placeholder={"No calculators\nNo electronic devices"}
                  value={form.instructionsRules}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      instructionsRules: e.target.value,
                    }))
                  }
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (wizardStep > 0) setWizardStep(wizardStep - 1);
                else setCreateOpen(false);
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              {wizardStep === 0 ? "Cancel" : "Back"}
            </Button>
            {wizardStep < steps.length - 1 ? (
              <Button
                onClick={() => setWizardStep(wizardStep + 1)}
                disabled={!canNext()}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.name || !form.code}
              >
                {createMutation.isPending ? "Creating..." : "Create Exam"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

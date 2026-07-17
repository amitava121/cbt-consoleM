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
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    Loader2,
    Plus,
    Search,
    Trash2,
    Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { questionBanksService } from "../services/question-banks";
import { questionsService } from "../services/questions";
import { subjectsService } from "../services/subjects";
import type {
    CreateQuestionInput,
    DifficultyLevel,
    Question,
    QuestionType,
} from "../types";

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq_single", label: "MCQ (Single Correct)" },
  { value: "mcq_multiple", label: "MCQ (Multiple Correct)" },
  { value: "fill_in_blank", label: "Fill in the Blank" },
  { value: "essay", label: "Essay / Subjective" },
  { value: "true_false", label: "True / False" },
  { value: "matching", label: "Matching" },
  { value: "assertion_reason", label: "Assertion-Reason" },
  { value: "comprehension", label: "Comprehension" },
  { value: "drag_drop", label: "Drag and Drop" },
  { value: "image_based", label: "Image Based" },
  { value: "audio_video", label: "Audio / Video" },
  { value: "numerical", label: "Numerical" },
  { value: "matrix_match", label: "Matrix Match" },
];

const DIFFICULTIES: { value: DifficultyLevel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "very_hard", label: "Very Hard" },
];

const difficultyColors: Record<DifficultyLevel, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  hard: "bg-orange-100 text-orange-800",
  very_hard: "bg-red-100 text-red-800",
};

const typeLabels: Record<QuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.label]),
) as Record<QuestionType, string>;

export default function QuestionsPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);
  const [filters, setFilters] = useState({
    questionBankId: "",
    subjectId: "",
    type: "",
    difficulty: "",
    isApproved: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBankId, setImportBankId] = useState("");
  const [importSubjectId, setImportSubjectId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    questionBankId: "",
    subjectId: "",
    topicId: "",
    type: "mcq_single" as QuestionType,
    difficulty: "medium" as DifficultyLevel,
    marks: "4",
    negativeMarks: "1",
    estimatedTimeSecs: "120",
    contentText: "",
    option1: "",
    option2: "",
    option3: "",
    option4: "",
    correctOption: "1",
    solutionText: "",
    tags: "",
  });

  const { data: banksData } = useQuery({
    queryKey: ["question-banks", "all"],
    queryFn: () => questionBanksService.list({ page: 1, pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects", "all"],
    queryFn: () => subjectsService.list({ page: 1, pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "questions",
      pagination.pageIndex,
      pagination.pageSize,
      debouncedSearch,
      filters,
    ],
    queryFn: () =>
      questionsService.list({
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: debouncedSearch || undefined,
        questionBankId: filters.questionBankId || undefined,
        subjectId: filters.subjectId || undefined,
        type: filters.type || undefined,
        difficulty: filters.difficulty || undefined,
        isApproved:
          filters.isApproved === "" ? undefined : filters.isApproved === "true",
      }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const f = createForm;
      const input: CreateQuestionInput = {
        questionBankId: f.questionBankId,
        subjectId: f.subjectId,
        topicId: f.topicId || undefined,
        type: f.type,
        difficulty: f.difficulty,
        marks: parseFloat(f.marks) || 0,
        negativeMarks: parseFloat(f.negativeMarks) || 0,
        estimatedTimeSecs: f.estimatedTimeSecs
          ? parseInt(f.estimatedTimeSecs)
          : undefined,
        content: { text: f.contentText },
        tags: f.tags
          ? f.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      };
      if (
        f.type === "mcq_single" ||
        f.type === "mcq_multiple" ||
        f.type === "true_false"
      ) {
        const correctIdx = parseInt(f.correctOption);
        input.options = [
          { text: f.option1, isCorrect: correctIdx === 1, displayOrder: 1 },
          { text: f.option2, isCorrect: correctIdx === 2, displayOrder: 2 },
          { text: f.option3, isCorrect: correctIdx === 3, displayOrder: 3 },
          { text: f.option4, isCorrect: correctIdx === 4, displayOrder: 4 },
        ].filter((o) => o.text);
      }
      if (f.solutionText) {
        input.solution = { text: f.solutionText };
      }
      return questionsService.create(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Question created successfully");
      setCreateOpen(false);
    },
    onError: () => toast.error("Failed to create question"),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => questionsService.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Question approved");
    },
    onError: () => toast.error("Failed to approve question"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => questionsService.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Question deactivated");
    },
    onError: () => toast.error("Failed to deactivate question"),
  });

  const exportMutation = useMutation({
    mutationFn: (format: "json" | "excel" | "pdf") =>
      questionsService.export({
        format,
        questionBankId: filters.questionBankId || undefined,
        subjectId: filters.subjectId || undefined,
        type: filters.type || undefined,
        difficulty: filters.difficulty || undefined,
        search: debouncedSearch || undefined,
      }),
    onSuccess: (blob) => {
      const ext =
        exportMutation.variables === "json"
          ? "json"
          : exportMutation.variables === "excel"
            ? "xlsx"
            : "pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `questions-export-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast.success(`Exported as ${ext.toUpperCase()}`);
    },
    onError: () => toast.error("Export failed"),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!importFile || !importBankId || !importSubjectId)
        throw new Error("Missing file, bank, or subject");
      return questionsService.import(importFile, importBankId, importSubjectId);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success(
        `Imported ${res.imported}/${res.total} questions${res.failed > 0 ? `, ${res.failed} failed` : ""}`,
      );
      if (res.errors && res.errors.length > 0) {
        console.warn("Import errors:", res.errors);
      }
      setImportOpen(false);
      setImportFile(null);
    },
    onError: () => toast.error("Import failed"),
  });

  const tableData = useMemo(() => data?.data ?? [], [data]);

  const columns: ColumnDef<Question>[] = [
    {
      accessorKey: "contentJson",
      header: "Question",
      cell: ({ row }) => {
        const content = row.getValue("contentJson") as Record<string, unknown>;
        const text = (content?.text as string) ?? "";
        return (
          <span className="max-w-md truncate font-medium">
            {text.length > 80 ? text.slice(0, 80) + "…" : text}
          </span>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.getValue("type") as QuestionType;
        return <Badge variant="outline">{typeLabels[type]}</Badge>;
      },
    },
    {
      accessorKey: "difficulty",
      header: "Difficulty",
      cell: ({ row }) => {
        const diff = row.getValue("difficulty") as DifficultyLevel;
        return (
          <Badge variant="secondary" className={difficultyColors[diff]}>
            {diff.replace("_", " ")}
          </Badge>
        );
      },
    },
    {
      accessorKey: "marks",
      header: "Marks",
      cell: ({ row }) => (
        <span className="font-mono">{row.getValue("marks")}</span>
      ),
    },
    {
      id: "approved",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.approvedBy ? "default" : "secondary"}>
          {row.original.approvedBy ? "Approved" : "Pending"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          {!row.original.approvedBy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => approveMutation.mutate(row.original.id)}
              title="Approve"
            >
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </Button>
          )}
          {row.original.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deactivateMutation.mutate(row.original.id)}
              title="Deactivate"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

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

  const showOptions = ["mcq_single", "mcq_multiple", "true_false"].includes(
    createForm.type,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
          <p className="text-sm text-muted-foreground">
            Manage and approve questions across all banks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setExportOpen((v) => !v)}
              disabled={exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 rounded-md border border-border bg-popover shadow-md w-36">
                <button
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => exportMutation.mutate("json")}
                >
                  JSON
                </button>
                <button
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => exportMutation.mutate("excel")}
                >
                  Excel (.xlsx)
                </button>
                <button
                  className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => exportMutation.mutate("pdf")}
                >
                  PDF
                </button>
              </div>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search questions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="pl-8"
          />
        </div>
        <select
          value={filters.questionBankId}
          onChange={(e) => {
            setFilters((f) => ({ ...f, questionBankId: e.target.value }));
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All Banks</option>
          {(banksData?.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={filters.subjectId}
          onChange={(e) => {
            setFilters((f) => ({ ...f, subjectId: e.target.value }));
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All Subjects</option>
          {(subjectsData?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(e) => {
            setFilters((f) => ({ ...f, type: e.target.value }));
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All Types</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={filters.difficulty}
          onChange={(e) => {
            setFilters((f) => ({ ...f, difficulty: e.target.value }));
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All Difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={filters.isApproved}
          onChange={(e) => {
            setFilters((f) => ({ ...f, isApproved: e.target.value }));
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Approved</option>
          <option value="false">Pending</option>
        </select>
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
                  No questions found
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
          {data ? `${data.total} total questions` : "Loading..."}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Bank</Label>
                <select
                  value={createForm.questionBankId}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      questionBankId: e.target.value,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Select bank...</option>
                  {(banksData?.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <select
                  value={createForm.subjectId}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, subjectId: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Select subject...</option>
                  {(subjectsData?.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={createForm.type}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      type: e.target.value as QuestionType,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <select
                  value={createForm.difficulty}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      difficulty: e.target.value as DifficultyLevel,
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Estimated Time (secs)</Label>
                <Input
                  type="number"
                  value={createForm.estimatedTimeSecs}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      estimatedTimeSecs: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marks</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={createForm.marks}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, marks: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Negative Marks</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={createForm.negativeMarks}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      negativeMarks: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Question Text</Label>
              <textarea
                value={createForm.contentText}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, contentText: e.target.value }))
                }
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Enter the question..."
              />
            </div>
            {showOptions && (
              <div className="space-y-2">
                <Label>Options (select correct answer)</Label>
                {[1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctOption"
                      checked={createForm.correctOption === String(idx)}
                      onChange={() =>
                        setCreateForm((f) => ({
                          ...f,
                          correctOption: String(idx),
                        }))
                      }
                      className="h-4 w-4"
                    />
                    <Input
                      value={
                        createForm[
                          `option${idx}` as keyof typeof createForm
                        ] as string
                      }
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          [`option${idx}`]: e.target.value,
                        }))
                      }
                      placeholder={`Option ${idx}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>Solution / Explanation (optional)</Label>
              <textarea
                value={createForm.solutionText}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, solutionText: e.target.value }))
                }
                rows={2}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Enter solution or explanation..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={createForm.tags}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, tags: e.target.value }))
                }
                placeholder="e.g. algebra, calculus, derivatives"
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
                !createForm.questionBankId ||
                !createForm.subjectId ||
                !createForm.contentText
              }
            >
              {createMutation.isPending ? "Creating..." : "Create Question"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Questions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question Bank</Label>
              <select
                value={importBankId}
                onChange={(e) => setImportBankId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select bank...</option>
                {(banksData?.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <select
                value={importSubjectId}
                onChange={(e) => setImportSubjectId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select subject...</option>
                {(subjectsData?.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>File (JSON or Excel .xlsx)</Label>
              <input
                type="file"
                accept=".json,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground hover:file:bg-primary/90"
              />
              {importFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {importFile.name} (
                  {(importFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Supported formats:</p>
              <ul className="mt-1 space-y-0.5">
                <li>
                  <b>JSON</b>: Array of questions or {"{ questions: [...] }"}
                </li>
                <li>
                  <b>Excel</b>: Columns: Question Text, Type, Difficulty, Marks,
                  Neg. Marks, Option 1-6, Correct Options, Solution,
                  Explanation, Tags
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={
                importMutation.isPending ||
                !importFile ||
                !importBankId ||
                !importSubjectId
              }
            >
              {importMutation.isPending ? "Importing..." : "Import Questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

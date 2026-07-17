import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import { FolderTree, Loader2, Plus, Search } from "lucide-react";
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
import { subjectsService, topicsService } from "../services/subjects";
import type { Subject, Topic } from "../types";

const columns: ColumnDef<Subject>[] = [
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

export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    description: "",
  });
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [topicForm, setTopicForm] = useState({ name: "", description: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["subjects", search],
    queryFn: () =>
      subjectsService.list({
        page: 1,
        pageSize: 100,
        search: search || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: topicsData, isLoading: topicsLoading } = useQuery({
    queryKey: ["subjects", selectedSubject?.id, "topics"],
    queryFn: () => subjectsService.getTopics(selectedSubject!.id),
    enabled: !!selectedSubject,
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () => subjectsService.create(createForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject created successfully");
      setCreateOpen(false);
      setCreateForm({ name: "", code: "", description: "" });
    },
    onError: () => toast.error("Failed to create subject"),
  });

  const createTopicMutation = useMutation({
    mutationFn: () =>
      topicsService.create({ subjectId: selectedSubject!.id, ...topicForm }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["subjects", selectedSubject?.id, "topics"],
      });
      toast.success("Topic created successfully");
      setTopicCreateOpen(false);
      setTopicForm({ name: "", description: "" });
    },
    onError: () => toast.error("Failed to create topic"),
  });

  const tableData = useMemo(() => data?.data ?? [], [data]);

  const table = useReactTable({
    data: tableData,
    columns: [
      ...columns,
      {
        id: "actions",
        header: "Topics",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSubject(row.original)}
          >
            <FolderTree className="mr-1 h-4 w-4" />
            View
          </Button>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Subjects & Topics
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage academic subjects and their topics
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Subject
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

      {/* Topics Dialog */}
      <Dialog
        open={!!selectedSubject}
        onOpenChange={(open) => !open && setSelectedSubject(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Topics — {selectedSubject?.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({selectedSubject?.code})
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setTopicCreateOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Topic
              </Button>
            </div>
            {topicsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (topicsData?.data ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No topics yet. Create one to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {(topicsData?.data ?? []).map((topic: Topic) => (
                  <div
                    key={topic.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="font-medium">{topic.name}</p>
                      {topic.description && (
                        <p className="text-sm text-muted-foreground">
                          {topic.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={topic.isActive ? "default" : "destructive"}>
                      {topic.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inline topic create */}
          {topicCreateOpen && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="topic-name">Topic Name</Label>
                <Input
                  id="topic-name"
                  value={topicForm.name}
                  onChange={(e) =>
                    setTopicForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-desc">Description (optional)</Label>
                <Input
                  id="topic-desc"
                  value={topicForm.description}
                  onChange={(e) =>
                    setTopicForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setTopicCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createTopicMutation.mutate()}
                  disabled={createTopicMutation.isPending || !topicForm.name}
                >
                  {createTopicMutation.isPending
                    ? "Creating..."
                    : "Create Topic"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Subject Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Subject</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                createMutation.isPending || !createForm.name || !createForm.code
              }
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

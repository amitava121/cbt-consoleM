import { Eye, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { examBatchService } from "../services/exam-batches";
import api from "../services/api";

interface AnswerSheetRow {
  attemptId: string;
  candidateName: string;
  admitCardNumber: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
}

export default function ResultsPage({ institutionId }: { institutionId?: string }) {
  const navigate = useNavigate();
  const [examBatchId, setExamBatchId] = useState("");
  const [batches, setBatches] = useState<{ id: string; name: string; examName?: string | null }[]>([]);
  const [rows, setRows] = useState<AnswerSheetRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadBatches = async () => {
      try {
        const res = await examBatchService.list({
          pageSize: 100,
          ...(institutionId ? { institutionId } : {}),
        });
        setBatches(
          (res.data ?? []).map((b) => ({
            id: b.id,
            name: b.examName ?? b.name,
          })),
        );
      } catch {
        // ignore
      }
    };
    loadBatches();
  }, [institutionId]);

  const loadAnswerSheets = async (batchId: string) => {
    setExamBatchId(batchId);
    if (!batchId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<unknown, { data: AnswerSheetRow[] }>(
        `/results/batch/${batchId}/answer-sheets`,
      );
      setRows(res.data ?? []);
    } catch {
      toast.error("Failed to load answer sheets");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Batch Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Exam</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={examBatchId}
            onChange={(e) => loadAnswerSheets(e.target.value)}
            className="w-[320px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select an exam...</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Results Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Answer Sheets ({rows.length} candidates)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Admit Number</TableHead>
                  <TableHead className="text-center">Total Questions</TableHead>
                  <TableHead className="text-center">Correct</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.attemptId}>
                    <TableCell className="font-medium">
                      {r.candidateName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.admitCardNumber}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.answeredCount} / {r.totalQuestions}
                    </TableCell>
                    <TableCell className="text-center font-semibold text-green-600">
                      {r.correctCount}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => navigate(`/results/${r.attemptId}`)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : examBatchId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No submitted attempts found for this exam.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

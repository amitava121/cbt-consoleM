import { BarChart3, FileText, Loader2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
    type BatchResultRow,
    type BatchStats,
    resultsService,
} from "../services/results";

export default function ResultsPage() {
  const [examBatchId, setExamBatchId] = useState("");
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [results, setResults] = useState<BatchResultRow[]>([]);
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);

  const loadBatches = async () => {
    try {
      const res = await examBatchService.list({
        status: "finished",
        pageSize: 100,
      });
      setBatches(
        (res.data ?? []).map((b) => ({
          id: b.id,
          name: b.name,
        })),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const loadResults = async (batchId: string) => {
    setExamBatchId(batchId);
    setLoading(true);
    try {
      const [resultsRes, statsRes] = await Promise.all([
        resultsService.getBatchResults(batchId),
        resultsService.getBatchStats(batchId),
      ]);
      setResults(resultsRes.results ?? []);
      setStats(statsRes.stats ?? null);
    } catch {
      toast.error("Failed to load results");
      setResults([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGradeBatch = async () => {
    if (!examBatchId) return;
    setGrading(true);
    try {
      const res = await resultsService.gradeBatch(examBatchId);
      toast.success(
        `Graded ${res.graded} attempts, ranked ${res.ranked} candidates`,
      );
      await loadResults(examBatchId);
    } catch {
      toast.error("Grading failed");
    } finally {
      setGrading(false);
    }
  };

  const handlePublish = async () => {
    if (!examBatchId) return;
    try {
      await resultsService.publishResults(examBatchId);
      toast.success("Results published successfully");
    } catch {
      toast.error("Failed to publish results");
    }
  };

  const sortedResults = useMemo(
    () =>
      [...results].sort(
        (a, b) => parseFloat(b.netScore) - parseFloat(a.netScore),
      ),
    [results],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Exam Batch</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <select
            value={examBatchId}
            onChange={(e) => loadResults(e.target.value)}
            className="w-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a finished batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {examBatchId && (
            <div className="flex gap-2">
              <button
                onClick={handleGradeBatch}
                disabled={grading}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {grading && <Loader2 className="h-4 w-4 animate-spin" />}
                Grade All & Calculate Ranks
              </button>
              <button
                onClick={handlePublish}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Publish Results
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Candidates
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCandidates}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Average Score
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageScore}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Highest Score
              </CardTitle>
              <Trophy className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.highestScore}</div>
              <p className="text-xs text-muted-foreground">
                Median: {stats.medianScore} | Lowest: {stats.lowestScore}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sortedResults.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Candidate Results (Rank List)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Roll No</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead className="text-right">Percentile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.map((r, idx) => (
                  <TableRow key={r.attemptId}>
                    <TableCell className="font-bold">
                      {r.rank ?? idx + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.candidateName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.candidateRollNo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {parseFloat(r.netScore).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(r.marksObtained).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.percentile ? parseFloat(r.percentile).toFixed(1) : "—"}
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
            No graded results found. Click "Grade All & Calculate Ranks" to
            grade this batch.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

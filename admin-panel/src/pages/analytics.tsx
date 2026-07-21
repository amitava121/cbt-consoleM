import { BarChart3, Loader2, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
    type ItemAnalysisRow,
    type SectionAnalysisRow,
    analyticsService,
} from "../services/analytics";
import { examBatchService } from "../services/exam-batches";

function getDifficultyLabel(di: number): string {
  if (di >= 0.7) return "Easy";
  if (di >= 0.3) return "Medium";
  return "Hard";
}

function getDifficultyColor(di: number): string {
  if (di >= 0.7) return "text-green-600";
  if (di >= 0.3) return "text-yellow-600";
  return "text-red-600";
}

export default function AnalyticsPage() {
  const [examBatchId, setExamBatchId] = useState("");
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<ItemAnalysisRow[]>([]);
  const [sections, setSections] = useState<SectionAnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadBatches = async () => {
    try {
      const res = await examBatchService.list({ pageSize: 100 });
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

  const loadAnalytics = async (batchId: string) => {
    setExamBatchId(batchId);
    setLoading(true);
    try {
      const [itemRes, sectionRes] = await Promise.all([
        analyticsService.getItemAnalysis(batchId),
        analyticsService.getSectionAnalysis(batchId),
      ]);
      setItems(itemRes.items ?? []);
      setSections(sectionRes.sections ?? []);
    } catch {
      toast.error("Failed to load analytics. Grade the batch first.");
      setItems([]);
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Exam Batch</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={examBatchId}
            onChange={(e) => loadAnalytics(e.target.value)}
            className="w-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : examBatchId ? (
        <>
          {sections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Section-wise Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead className="text-right">Total Marks</TableHead>
                      <TableHead className="text-right">Avg Score</TableHead>
                      <TableHead className="text-right">Avg Correct</TableHead>
                      <TableHead className="text-right">
                        Avg Incorrect
                      </TableHead>
                      <TableHead className="text-right">Candidates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sections.map((s) => (
                      <TableRow key={s.sectionId}>
                        <TableCell className="font-medium">
                          {s.sectionName}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.totalMarks.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {s.avgMarksObtained.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {s.avgCorrectCount.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {s.avgIncorrectCount.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.candidateCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Item Analysis (Question-wise)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No item analysis data. Grade the batch first.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question ID</TableHead>
                      <TableHead className="text-right">Attempted</TableHead>
                      <TableHead className="text-right">Correct</TableHead>
                      <TableHead className="text-right">Incorrect</TableHead>
                      <TableHead className="text-right">Attempt Rate</TableHead>
                      <TableHead className="text-right">Correct Rate</TableHead>
                      <TableHead className="text-right">Difficulty</TableHead>
                      <TableHead className="text-center">Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.questionId}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.questionId.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="text-right">
                          {item.attempted}/{item.totalAttempts}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {item.correct}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {item.incorrect}
                        </TableCell>
                        <TableCell className="text-right">
                          {(item.attemptRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {(item.correctRate * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${getDifficultyColor(item.difficultyIndex)}`}
                        >
                          {item.difficultyIndex.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${getDifficultyColor(item.difficultyIndex)}`}
                          >
                            {item.difficultyIndex >= 0.7 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <BarChart3 className="h-3 w-3" />
                            )}
                            {getDifficultyLabel(item.difficultyIndex)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

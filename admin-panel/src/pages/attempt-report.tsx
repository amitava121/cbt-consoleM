import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import api from "../services/api";

interface QuestionOption {
  id: string;
  text: string;
  displayOrder: number;
  isCorrect: boolean;
}

interface ExamQuestion {
  examQuestionId: string;
  examSectionId: string;
  questionId: string;
  displayOrder: number;
  isOptional: boolean;
  type: string;
  content: { text?: string } | null;
  options: QuestionOption[];
}

interface AnswerData {
  answerData: unknown;
  status: string;
  timeSpentSecs: number;
}

interface AnswerSheetResponse {
  exam: { name: string; code: string; durationMinutes: number; totalMarks: string };
  sections: { id: string; name: string; sectionOrder: number }[];
  questions: ExamQuestion[];
  answers: Record<string, AnswerData>;
}

function getSelectedOptionIds(answerData: unknown): string[] {
  if (!answerData) return [];
  if (Array.isArray(answerData)) return answerData.map(String);
  if (typeof answerData === "object" && answerData !== null) {
    const obj = answerData as Record<string, unknown>;
    if (Array.isArray(obj.selectedOptionIds)) return obj.selectedOptionIds.map(String);
    if (Array.isArray(obj.selected)) return obj.selected.map(String);
    if (typeof obj.optionId === "string") return [obj.optionId];
  }
  if (typeof answerData === "string") return [answerData];
  return [];
}

export default function AttemptReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnswerSheetResponse | null>(null);

  useEffect(() => {
    if (!attemptId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const res = await api.get<unknown, AnswerSheetResponse>(
          `/results/attempt/${attemptId}/answer-sheet`
        );
        setData(res);
      } catch {
        toast.error("Failed to load answer sheet");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No data found for this attempt. Ensure it has been graded first.
      </div>
    );
  }

  const { exam, sections, questions, answers } = data;

  // Group questions by section
  const sectionMap = new Map<string, ExamQuestion[]>();
  for (const q of questions) {
    const list = sectionMap.get(q.examSectionId) ?? [];
    list.push(q);
    sectionMap.set(q.examSectionId, list);
  }

  // Calculate stats
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;
  for (const q of questions) {
    const answer = answers[q.questionId];
    if (!answer || answer.status === "not_visited" || answer.status === "visited") {
      unattempted++;
      continue;
    }
    const selectedIds = getSelectedOptionIds(answer.answerData);
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const isCorrect =
      selectedIds.length === correctIds.length &&
      selectedIds.every((id) => correctIds.includes(id));
    if (isCorrect) correct++;
    else incorrect++;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{exam.name}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.code} • {exam.durationMinutes} mins • Total: {exam.totalMarks} marks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1 text-green-600 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> {correct} Correct
          </span>
          <span className="flex items-center gap-1 text-red-600 font-semibold">
            <XCircle className="h-4 w-4" /> {incorrect} Wrong
          </span>
          <span className="text-muted-foreground font-medium">
            {unattempted} Skipped
          </span>
        </div>
      </div>

      {/* Questions by Section */}
      {sections
        .sort((a, b) => a.sectionOrder - b.sectionOrder)
        .map((section) => {
          const sectionQuestions = sectionMap.get(section.id) ?? [];
          return (
            <div key={section.id} className="space-y-4">
              <h2 className="text-lg font-semibold border-b border-border pb-2">
                {section.name}
              </h2>
              {sectionQuestions
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((q, qIdx) => {
                  const answer = answers[q.questionId];
                  const selectedIds = getSelectedOptionIds(answer?.answerData);
                  const wasAnswered = answer?.status === "answered" || answer?.status === "answered_and_marked";
                  const questionText = (q.content as { text?: string })?.text ?? "No content";
                  const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);

                  // Determine if the overall answer is correct
                  const isQuestionCorrect = wasAnswered &&
                    selectedIds.length === correctOptionIds.length &&
                    selectedIds.every((id) => correctOptionIds.includes(id));

                  return (
                    <Card key={q.questionId} className="!py-4">
                      <CardHeader className="!pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold text-white ${
                            !wasAnswered ? "bg-gray-400" : isQuestionCorrect ? "bg-green-500" : "bg-red-500"
                          }`}>
                            {qIdx + 1}
                          </span>
                          <span className="flex-1">{questionText}</span>
                          {!wasAnswered && (
                            <Badge variant="secondary" className="text-[10px]">
                              Not Attempted
                            </Badge>
                          )}
                          {wasAnswered && isQuestionCorrect && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {wasAnswered && !isQuestionCorrect && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="!pt-0">
                        {q.options.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {q.options
                              .sort((a, b) => a.displayOrder - b.displayOrder)
                              .map((opt) => {
                                const isSelected = selectedIds.includes(opt.id);
                                const isCorrect = opt.isCorrect;

                                // Color logic:
                                // - Green: correct answer (always shown)
                                // - Red: selected but wrong
                                // - Default: not selected, not correct
                                let bgClass = "bg-muted/30 border-border";
                                let textClass = "";

                                if (isCorrect) {
                                  bgClass = "bg-green-50 border-green-400 dark:bg-green-950/40 dark:border-green-700";
                                  textClass = "text-green-700 dark:text-green-300";
                                }
                                if (isSelected && !isCorrect) {
                                  bgClass = "bg-red-50 border-red-400 dark:bg-red-950/40 dark:border-red-700";
                                  textClass = "text-red-700 dark:text-red-300";
                                }

                                return (
                                  <div
                                    key={opt.id}
                                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${bgClass}`}
                                  >
                                    <div className={`flex items-center justify-center h-5 w-5 rounded-full border text-[10px] font-bold shrink-0 ${
                                      isCorrect ? "border-green-500 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                      isSelected ? "border-red-500 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                      "border-border"
                                    }`}>
                                      {String.fromCharCode(64 + opt.displayOrder)}
                                    </div>
                                    <span className={`flex-1 ${textClass}`}>{opt.text}</span>
                                    {isCorrect && (
                                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                    )}
                                    {isSelected && !isCorrect && (
                                      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                        {/* Show correct answer text below options */}
                        <div className="mt-3 pt-2 border-t border-border/50">
                          <p className="text-xs font-medium text-green-600 dark:text-green-400">
                            ✓ Correct Answer: Option{" "}
                            {correctOptionIds
                              .map((id) => {
                                const opt = q.options.find((o) => o.id === id);
                                return opt ? String.fromCharCode(64 + opt.displayOrder) : "?";
                              })
                              .join(", ")}
                            {" — "}
                            {correctOptionIds
                              .map((id) => q.options.find((o) => o.id === id)?.text ?? "")
                              .join(", ")}
                          </p>
                          {wasAnswered && !isQuestionCorrect && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              ✗ Candidate's Answer: Option{" "}
                              {selectedIds
                                .map((id) => {
                                  const opt = q.options.find((o) => o.id === id);
                                  return opt ? String.fromCharCode(64 + opt.displayOrder) : "?";
                                })
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          );
        })}
    </div>
  );
}

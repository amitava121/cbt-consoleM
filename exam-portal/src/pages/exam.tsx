import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { candidateService, type CandidateQuestion } from "@/services/candidate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Clock,
    Loader2,
    Pause,
    Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

function getQuestionText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const obj = content as Record<string, unknown>;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.questionText === "string") return obj.questionText;
  if (typeof obj.question === "string") return obj.question;
  if (typeof obj.statement === "string") return obj.statement;
  return JSON.stringify(obj).slice(0, 200);
}

function getOptions(
  q: CandidateQuestion | undefined,
): Array<{ id: string; label: string }> {
  if (!q || !q.options) return [];
  return q.options.map((opt) => ({
    id: opt.id,
    label: opt.text,
  }));
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CandidateExamPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainingSecs, setRemainingSecs] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [forceLogout, setForceLogout] = useState(false);
  const [serverPaused, setServerPaused] = useState(false);

  // Persist attemptId to localStorage so it survives page refresh / reconnect
  const storageKey = batchId ? `exam_attempt_${batchId}` : null;

  // On mount: check for existing attempt in localStorage and resume it
  useEffect(() => {
    if (!storageKey) return;
    const savedAttemptId = localStorage.getItem(storageKey);
    if (savedAttemptId) {
      setResuming(true);
      candidateService
        .getAttemptState(savedAttemptId)
        .then((state) => {
          if (state.status === "in_progress" || state.status === "paused") {
            // Restore answers from server
            const restoredAnswers: Record<string, string> = {};
            for (const [qId, ans] of Object.entries(state.answers)) {
              const answerData = ans.answerData as Record<
                string,
                unknown
              > | null;
              if (answerData && typeof answerData === "object") {
                // Extract selected option ID or value for display
                const selected =
                  (answerData as Record<string, unknown>).selectedOptionId ??
                  (answerData as Record<string, unknown>).value ??
                  "";
                if (typeof selected === "string" && selected) {
                  restoredAnswers[qId] = selected;
                }
              }
            }
            setAnswers(restoredAnswers);
            setAttemptId(savedAttemptId);
            setRemainingSecs(state.remainingTimeSecs);
            setExamStarted(true);
            toast.info("Exam resumed from previous session.");
          } else {
            // Attempt is finished/terminated — clear localStorage
            localStorage.removeItem(storageKey);
          }
        })
        .catch(() => {
          // Attempt state fetch failed — clear stale data
          localStorage.removeItem(storageKey);
        })
        .finally(() => setResuming(false));
    }
  }, [storageKey]);

  const { data: examMeta } = useQuery({
    queryKey: ["candidate-exam-meta", batchId],
    queryFn: () => candidateService.getExamMeta(batchId!),
    enabled: !!batchId,
  });

  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ["candidate-questions", batchId],
    queryFn: () => candidateService.getQuestions(batchId!),
    enabled: !!batchId,
  });

  const startExamMutation = useMutation({
    mutationFn: () => candidateService.startExam(batchId!),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      setRemainingSecs(data.remainingTimeSeconds);
      setExamStarted(true);
      // Persist attemptId for reconnection recovery
      if (storageKey) {
        localStorage.setItem(storageKey, data.attemptId);
      }
      // If this is a resume (status in_progress), fetch saved answers
      if (data.status === "in_progress" || data.status === "paused") {
        candidateService
          .getAttemptState(data.attemptId)
          .then((state) => {
            const restoredAnswers: Record<string, string> = {};
            for (const [qId, ans] of Object.entries(state.answers)) {
              const answerData = ans.answerData as Record<
                string,
                unknown
              > | null;
              if (answerData && typeof answerData === "object") {
                const selected =
                  (answerData as Record<string, unknown>).selectedOptionId ??
                  (answerData as Record<string, unknown>).value ??
                  "";
                if (typeof selected === "string" && selected) {
                  restoredAnswers[qId] = selected;
                }
              }
            }
            setAnswers(restoredAnswers);
            setRemainingSecs(state.remainingTimeSecs);
            toast.info("Exam resumed — answers restored.");
          })
          .catch(() => {
            toast.success("Exam started. Good luck!");
          });
      } else {
        toast.success("Exam started. Good luck!");
      }
    },
    onError: (err: any) => {
      const errData = err.response?.data?.error;
      const msg =
        typeof errData === "string"
          ? errData
          : (errData?.message ?? "Failed to start exam");
      toast.error(msg);
    },
  });

  const saveAnswerMutation = useMutation({
    mutationFn: ({
      questionId,
      answerData,
    }: {
      questionId: string;
      answerData: Record<string, unknown>;
    }) => candidateService.saveAnswer(attemptId!, questionId, answerData),
    onError: () => {
      // Silent — answers are auto-saved
    },
  });

  const handleAnswerSelect = (
    questionId: string,
    answerData: Record<string, unknown>,
    displayValue: string,
  ) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: displayValue };
      saveAnswerMutation.mutate({ questionId, answerData });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    setSubmitting(true);
    try {
      await candidateService.submitExam(attemptId);
      // Clear persisted attempt on successful submit
      if (storageKey) localStorage.removeItem(storageKey);
      toast.success("Exam submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["candidate-exams"] });
      navigate("/exams");
    } catch (err: any) {
      const errData = err.response?.data?.error;
      const msg =
        typeof errData === "string"
          ? errData
          : (errData?.message ?? "Submit failed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (!examStarted || remainingSecs <= 0) return;
    const timer = setInterval(() => {
      setRemainingSecs((s) => {
        if (s <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examStarted, remainingSecs <= 0]);

  // Violation detection: tab switch and window blur
  useEffect(() => {
    if (!examStarted || !attemptId) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        candidateService
          .reportViolation(attemptId, {
            violationType: "tab_switch",
            severity: "high",
            description: "Candidate switched away from the exam tab",
          })
          .catch(() => {});
        toast.warning("Tab switch detected! This has been reported.");
      }
    };

    const handleBlur = () => {
      candidateService
        .reportViolation(attemptId, {
          violationType: "window_blur",
          severity: "medium",
          description: "Exam window lost focus",
        })
        .catch(() => {});
      toast.warning("Window focus lost! This has been reported.");
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      candidateService
        .reportViolation(attemptId, {
          violationType: "process_violation",
          severity: "low",
          description: "Right-click context menu blocked",
        })
        .catch(() => {});
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [examStarted, attemptId]);

  // Heartbeat: send every 30s to refresh Redis session lock and active key
  useEffect(() => {
    if (!examStarted || !attemptId || forceLogout) return;

    const sendHeartbeat = async () => {
      try {
        const fp = localStorage.getItem("candidateDeviceFp") ?? undefined;
        const res: any = await candidateService.heartbeat(fp);
        if (res?.terminated) {
          setForceLogout(true);
          toast.error("Exam has been stopped by the administrator.");
          return;
        }
        if (res?.autoResumed) {
          setServerPaused(false);
          toast.success("Connection restored. Exam resumed.");
          if (res.remainingTimeSecs != null) {
            setRemainingSecs(res.remainingTimeSecs);
          }
        } else if (res?.paused) {
          setServerPaused(true);
        } else {
          setServerPaused(false);
        }
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 401) {
          const msg = err.response?.data?.error ?? "";
          if (msg.includes("another login") || msg.includes("taken over")) {
            setForceLogout(true);
            toast.error("Your session was taken over by another login.");
          } else if (msg.includes("Device changed")) {
            setForceLogout(true);
            toast.error("Device change detected. Session terminated.");
          } else {
            setForceLogout(true);
            toast.error("Session expired. Please login again.");
          }
        } else {
          // Network error — server may be temporarily unreachable
          setServerPaused(true);
        }
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10_000);
    return () => clearInterval(interval);
  }, [examStarted, attemptId, forceLogout]);

  // Force logout handler
  useEffect(() => {
    if (!forceLogout) return;
    localStorage.removeItem("candidateAccessToken");
    localStorage.removeItem("candidateRefreshToken");
    localStorage.removeItem("candidateDeviceFp");
    if (storageKey) localStorage.removeItem(storageKey);
    const timer = setTimeout(() => navigate("/login"), 2000);
    return () => clearTimeout(timer);
  }, [forceLogout, navigate, storageKey]);

  // Group questions by section
  const sections = useMemo(() => {
    if (!questions || !examMeta?.sections) return [];
    return examMeta.sections.map((s) => ({
      ...s,
      questions: questions.filter((q) => q.sectionId === s.id),
    }));
  }, [questions, examMeta]);

  // Set active section to first section when questions load
  useEffect(() => {
    if (!activeSectionId && sections.length > 0) {
      setActiveSectionId(sections[0].id);
      setCurrentIndex(0);
    }
  }, [sections, activeSectionId]);

  // Questions in the active section
  const activeSectionQuestions = useMemo(() => {
    if (!activeSectionId || !questions) return [];
    return questions.filter((q) => q.sectionId === activeSectionId);
  }, [activeSectionId, questions]);

  const activeSection = sections.find((s) => s.id === activeSectionId);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const totalQuestions = questions?.length ?? 0;
  const currentQuestion = activeSectionQuestions[currentIndex];
  const isLastQuestion =
    currentIndex === activeSectionQuestions.length - 1 &&
    sections.findIndex((s) => s.id === activeSectionId) === sections.length - 1;

  // Navigate to next section
  const goToNextSection = () => {
    const currentIdx = sections.findIndex((s) => s.id === activeSectionId);
    if (currentIdx < sections.length - 1) {
      setActiveSectionId(sections[currentIdx + 1].id);
      setCurrentIndex(0);
    }
  };

  // Navigate to previous section
  const goToPrevSection = () => {
    const currentIdx = sections.findIndex((s) => s.id === activeSectionId);
    if (currentIdx > 0) {
      setActiveSectionId(sections[currentIdx - 1].id);
      setCurrentIndex(sections[currentIdx - 1].questions.length - 1);
    }
  };

  // Force logout overlay
  if (forceLogout) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <AlertCircle className="h-12 w-12 text-red-600" />
            <p className="text-lg font-bold text-red-700">Session Terminated</p>
            <p className="text-sm text-muted-foreground">
              You are being redirected to the login page...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Server paused overlay (network issue or auto-pause detected)
  if (serverPaused && examStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-amber-100 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <Pause className="h-12 w-12 text-amber-600" />
            <p className="text-lg font-bold text-amber-700">Exam Paused</p>
            <p className="text-sm text-muted-foreground">
              Connection to server lost. Your timer is paused. Reconnecting...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pre-exam instructions screen
  if (!examStarted) {
    if (resuming) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardContent className="flex flex-col items-center gap-4 p-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-lg font-medium">
                Restoring your exam session...
              </p>
              <p className="text-sm text-muted-foreground">
                Reconnecting to server and restoring your answers.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardContent className="p-8">
            <h1 className="mb-2 text-2xl font-bold">
              {examMeta?.examName ?? "Exam"}
            </h1>

            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <Clock className="mb-1 h-5 w-5 text-blue-600" />
                <p className="text-2xl font-bold">
                  {examMeta?.durationMinutes ?? "—"} min
                </p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
              <div className="rounded-lg bg-indigo-50 p-4">
                <CheckCircle2 className="mb-1 h-5 w-5 text-indigo-600" />
                <p className="text-2xl font-bold">{totalQuestions || "—"}</p>
                <p className="text-xs text-muted-foreground">Questions</p>
              </div>
            </div>

            {/* Section summary */}
            {sections.length > 0 && (
              <div className="mb-6 rounded-lg border p-4">
                <h3 className="mb-2 font-semibold">Sections</h3>
                <div className="space-y-1">
                  {sections.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {i + 1}. {s.name}
                      </span>
                      <span className="text-muted-foreground">
                        {s.questions.length} questions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {examMeta?.instructions && (
              <div className="mb-6 rounded-lg border p-4">
                <h3 className="mb-2 font-semibold">Instructions</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {examMeta.instructions}
                </p>
              </div>
            )}

            <div className="mb-6 flex items-start gap-2 rounded-lg bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800">
                Once you start, the timer cannot be paused. Your answers are
                auto-saved. Do not close or refresh the browser.
              </p>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => startExamMutation.mutate()}
              disabled={startExamMutation.isPending || questionsLoading}
            >
              {startExamMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {startExamMutation.isPending ? "Starting..." : "Start Exam"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (questionsLoading || !questions) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-semibold">{examMeta?.examName}</h1>
            <p className="text-xs text-muted-foreground">
              {answeredCount} / {totalQuestions} answered
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono font-bold ${
                remainingSecs < 60
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              <Clock className="h-4 w-4" />
              {formatTime(remainingSecs)}
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              Submit
            </Button>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      {sections.length > 1 && (
        <div className="sticky top-[57px] z-[5] border-b bg-white">
          <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2">
            {sections.map((s) => {
              const sectionAnswered = s.questions.filter((q) =>
                answers[q.id] ? true : false,
              ).length;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSectionId(s.id);
                    setCurrentIndex(0);
                  }}
                  className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeSectionId === s.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {s.name} ({sectionAnswered}/{s.questions.length})
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-6">
          {/* Main question area */}
          <Card className="shadow-md">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="info">
                    Q{currentIndex + 1} of {activeSectionQuestions.length}
                  </Badge>
                  {activeSection && (
                    <span className="text-sm text-muted-foreground">
                      {activeSection.name}
                    </span>
                  )}
                </div>
                <Badge variant="secondary">
                  {answeredCount} / {totalQuestions} answered
                </Badge>
              </div>

              <p className="mb-6 text-lg leading-relaxed">
                {getQuestionText(currentQuestion?.content)}
              </p>

              {/* Answer options */}
              {currentQuestion && (
                <div className="space-y-3">
                  {getOptions(currentQuestion).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
                        answers[currentQuestion.id] === opt.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQuestion.id}`}
                        checked={answers[currentQuestion.id] === opt.id}
                        onChange={() =>
                          handleAnswerSelect(
                            currentQuestion.id,
                            { selectedOptionId: opt.id },
                            opt.id,
                          )
                        }
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}

                  {/* Free text for non-MCQ */}
                  {getOptions(currentQuestion).length === 0 && (
                    <textarea
                      className="w-full rounded-lg border-2 border-gray-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
                      rows={6}
                      placeholder="Type your answer here..."
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(e) =>
                        handleAnswerSelect(
                          currentQuestion.id,
                          { textInput: e.target.value },
                          e.target.value,
                        )
                      }
                    />
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (currentIndex === 0) {
                      goToPrevSection();
                    } else {
                      setCurrentIndex((i) => Math.max(0, i - 1));
                    }
                  }}
                  disabled={
                    currentIndex === 0 &&
                    sections.findIndex((s) => s.id === activeSectionId) === 0
                  }
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                {isLastQuestion ? (
                  <Button
                    variant="destructive"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-1 h-4 w-4" />
                    )}
                    Submit Exam
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (currentIndex === activeSectionQuestions.length - 1) {
                        goToNextSection();
                      } else {
                        setCurrentIndex((i) =>
                          Math.min(activeSectionQuestions.length - 1, i + 1),
                        );
                      }
                    }}
                  >
                    Next
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Question palette */}
          <Card className="h-fit shadow-md">
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {activeSection ? activeSection.name : "Questions"}
              </h3>
              <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
                {activeSectionQuestions.map(
                  (q: CandidateQuestion, i: number) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(i)}
                      className={`flex h-8 w-8 items-center justify-center rounded text-xs font-medium transition-colors ${
                        i === currentIndex
                          ? "bg-blue-600 text-white"
                          : answers[q.id]
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ),
                )}
              </div>
              {sections.length > 1 && (
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    All Sections
                  </p>
                  {sections.map((s) => {
                    const sectionAnswered = s.questions.filter((q) =>
                      answers[q.id] ? true : false,
                    ).length;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActiveSectionId(s.id);
                          setCurrentIndex(0);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors ${
                          activeSectionId === s.id
                            ? "bg-blue-50 text-blue-700"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <span>{s.name}</span>
                        <span className="text-muted-foreground">
                          {sectionAnswered}/{s.questions.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-green-100" /> Answered
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-gray-100" /> Not answered
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-blue-600" /> Current
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

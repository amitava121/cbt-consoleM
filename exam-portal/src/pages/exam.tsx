import { candidateService, type CandidateQuestion } from "@/services/candidate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

// ─── Utility Functions ───────────────────────────────────────────────────────

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

// ─── Calculator Logic ────────────────────────────────────────────────────────

function useCalculator() {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<string | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const press = (btn: string) => {
    if (btn === "C") {
      setDisplay("0"); setPrev(null); setOp(null); setResetNext(false);
      return;
    }
    if (btn === "=") {
      if (prev !== null && op) {
        const a = parseFloat(prev);
        const b = parseFloat(display);
        let result = 0;
        if (op === "+") result = a + b;
        else if (op === "-") result = a - b;
        else if (op === "×") result = a * b;
        else if (op === "÷") result = b !== 0 ? a / b : 0;
        setDisplay(String(parseFloat(result.toFixed(8))));
        setPrev(null); setOp(null); setResetNext(true);
      }
      return;
    }
    if (["+", "-", "×", "÷"].includes(btn)) {
      setPrev(display); setOp(btn); setResetNext(true);
      return;
    }
    if (btn === ".") {
      if (resetNext) { setDisplay("0."); setResetNext(false); return; }
      if (!display.includes(".")) setDisplay(display + ".");
      return;
    }
    // digit
    if (resetNext) { setDisplay(btn); setResetNext(false); }
    else { setDisplay(display === "0" ? btn : display + btn); }
  };

  return { display, press };
}

// ─── Main Exam Page Component ────────────────────────────────────────────────

export default function CandidateExamPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [remainingSecs, setRemainingSecs] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [forceLogout, setForceLogout] = useState(false);
  const [serverPaused, setServerPaused] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const storageKey = batchId ? `exam_attempt_${batchId}` : null;
  const calculator = useCalculator();

  // On mount: check for existing attempt in localStorage and resume
  useEffect(() => {
    if (!storageKey) return;
    const savedAttemptId = localStorage.getItem(storageKey);
    if (savedAttemptId) {
      setResuming(true);
      candidateService
        .getAttemptState(savedAttemptId)
        .then((state) => {
          if (state.status === "in_progress" || state.status === "paused") {
            const restoredAnswers: Record<string, string> = {};
            for (const [qId, ans] of Object.entries(state.answers)) {
              const ansObj = ans as any;
              const answerData = ansObj.answerData as Record<string, unknown> | null;
              if (answerData && typeof answerData === "object") {
                const selected =
                  (answerData as Record<string, unknown>).selectedOptionId ??
                  (answerData as Record<string, unknown>).value ?? "";
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
            localStorage.removeItem(storageKey);
          }
        })
        .catch(() => {
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
      if (storageKey) localStorage.setItem(storageKey, data.attemptId);
      if (data.status === "in_progress" || data.status === "paused") {
        candidateService
          .getAttemptState(data.attemptId)
          .then((state) => {
            const restoredAnswers: Record<string, string> = {};
            for (const [qId, ans] of Object.entries(state.answers)) {
              const ansObj = ans as any;
              const answerData = ansObj.answerData as Record<string, unknown> | null;
              if (answerData && typeof answerData === "object") {
                const selected =
                  (answerData as Record<string, unknown>).selectedOptionId ??
                  (answerData as Record<string, unknown>).value ?? "";
                if (typeof selected === "string" && selected) {
                  restoredAnswers[qId] = selected;
                }
              }
            }
            setAnswers(restoredAnswers);
            setRemainingSecs(state.remainingTimeSecs);
            toast.info("Exam resumed — answers restored.");
          })
          .catch(() => { toast.success("Exam started. Good luck!"); });
      } else {
        toast.success("Exam started. Good luck!");
      }
    },
    onError: (err: any) => {
      const errData = err.response?.data?.error;
      const msg = typeof errData === "string" ? errData : (errData?.message ?? "Failed to start exam");
      toast.error(msg);
    },
  });

  const saveAnswerMutation = useMutation({
    mutationFn: ({ questionId, answerData }: { questionId: string; answerData: Record<string, unknown> }) =>
      candidateService.saveAnswer(attemptId!, questionId, answerData),
    onError: () => {},
  });

  const handleAnswerSelect = (questionId: string, answerData: Record<string, unknown>, displayValue: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: displayValue };
      saveAnswerMutation.mutate({ questionId, answerData });
      return next;
    });
  };

  const handleClearAnswer = () => {
    if (!currentQuestion) return;
    setAnswers((prev) => { const next = { ...prev }; delete next[currentQuestion.id]; return next; });
  };

  const handleMarkForReview = () => {
    if (!currentQuestion) return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
      else next.add(currentQuestion.id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    setSubmitting(true);
    try {
      await candidateService.submitExam(attemptId);
      if (storageKey) localStorage.removeItem(storageKey);
      toast.success("Exam submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["candidate-exams"] });
      navigate("/exams");
    } catch (err: any) {
      const errData = err.response?.data?.error;
      const msg = typeof errData === "string" ? errData : (errData?.message ?? "Submit failed");
      toast.error(msg);
    } finally {
      setSubmitting(false);
      setShowSubmitDialog(false);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (!examStarted || remainingSecs <= 0) return;
    const timer = setInterval(() => {
      setRemainingSecs((s) => {
        if (s <= 1) { clearInterval(timer); handleSubmit(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [examStarted, remainingSecs <= 0]);

  // Violation detection
  useEffect(() => {
    if (!examStarted || !attemptId) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        candidateService.reportViolation(attemptId, { violationType: "tab_switch", severity: "high", description: "Candidate switched away from the exam tab" }).catch(() => {});
        toast.warning("Tab switch detected! This has been reported.");
      }
    };
    const handleBlur = () => {
      candidateService.reportViolation(attemptId, { violationType: "window_blur", severity: "medium", description: "Exam window lost focus" }).catch(() => {});
      toast.warning("Window focus lost! This has been reported.");
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      candidateService.reportViolation(attemptId, { violationType: "process_violation", severity: "low", description: "Right-click context menu blocked" }).catch(() => {});
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

  // Heartbeat
  useEffect(() => {
    if (!examStarted || !attemptId || forceLogout) return;
    const sendHeartbeat = async () => {
      try {
        const fp = localStorage.getItem("candidateDeviceFp") ?? undefined;
        const res: any = await candidateService.heartbeat(fp);
        if (res?.terminated) { setForceLogout(true); toast.error("Exam has been stopped by the administrator."); return; }
        if (res?.autoResumed) { setServerPaused(false); toast.success("Connection restored."); if (res.remainingTimeSecs != null) setRemainingSecs(res.remainingTimeSecs); }
        else if (res?.paused) { setServerPaused(true); }
        else { setServerPaused(false); }
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 401) { setForceLogout(true); toast.error("Session expired. Please login again."); }
        else { setServerPaused(true); }
      }
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10_000);
    return () => clearInterval(interval);
  }, [examStarted, attemptId, forceLogout]);

  // Force logout
  useEffect(() => {
    if (!forceLogout) return;
    localStorage.removeItem("candidateAccessToken");
    localStorage.removeItem("candidateRefreshToken");
    localStorage.removeItem("candidateDeviceFp");
    if (storageKey) localStorage.removeItem(storageKey);
    const timer = setTimeout(() => navigate("/login"), 2000);
    return () => clearTimeout(timer);
  }, [forceLogout, navigate, storageKey]);

  // Section management
  const sections = useMemo(() => {
    if (!questions || !examMeta?.sections) return [];
    return examMeta.sections.map((s: any) => ({ ...s, questions: questions.filter((q: any) => q.sectionId === s.id) }));
  }, [questions, examMeta]);

  useEffect(() => {
    if (!activeSectionId && sections.length > 0) { setActiveSectionId(sections[0].id); setCurrentIndex(0); }
  }, [sections, activeSectionId]);

  const activeSectionQuestions = useMemo(() => {
    if (!activeSectionId || !questions) return [];
    return questions.filter((q: any) => q.sectionId === activeSectionId);
  }, [activeSectionId, questions]);

  const activeSection = sections.find((s: any) => s.id === activeSectionId);
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const unansweredCount = (questions?.length ?? 0) - answeredCount;
  const totalQuestions = questions?.length ?? 0;
  const currentQuestion = activeSectionQuestions[currentIndex];
  const markedCount = markedForReview.size;

  const isFirstQuestion = currentIndex === 0 && sections.findIndex((s: any) => s.id === activeSectionId) === 0;
  const isLastQuestion = currentIndex === activeSectionQuestions.length - 1 && sections.findIndex((s: any) => s.id === activeSectionId) === sections.length - 1;

  const handleNext = () => {
    if (currentIndex < activeSectionQuestions.length - 1) setCurrentIndex((i) => i + 1);
    else {
      const idx = sections.findIndex((s: any) => s.id === activeSectionId);
      if (idx < sections.length - 1) { setActiveSectionId(sections[idx + 1].id); setCurrentIndex(0); }
    }
  };
  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
    else {
      const idx = sections.findIndex((s: any) => s.id === activeSectionId);
      if (idx > 0) { setActiveSectionId(sections[idx - 1].id); setCurrentIndex(sections[idx - 1].questions.length - 1); }
    }
  };

  // ═══ OVERLAYS ═══

  if (forceLogout) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#F5F5F5" }}>
        <div style={{ width: 400, textAlign: "center" }}>
          <span style={{ fontSize: 64, color: "#E53935" }}>⚠</span>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#212121", marginTop: 20 }}>
            Session Terminated
          </h2>
          <p style={{ fontSize: 14, color: "#757575", marginTop: 15 }}>
            You are being redirected to the login page...
          </p>
        </div>
      </div>
    );
  }

  if (serverPaused && examStarted) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#F5F5F5" }}>
        <div style={{ width: 400, textAlign: "center" }}>
          <span style={{ fontSize: 48, color: "#FFA726" }}>⚠</span>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#212121", marginTop: 20 }}>
            Exam Paused
          </h2>
          <p style={{ fontSize: 14, color: "#757575", marginTop: 10 }}>
            Connection to server lost. Your timer is paused. Reconnecting...
          </p>
          <Loader2 className="mx-auto mt-4 h-6 w-6 animate-spin" style={{ color: "#1565C0" }} />
        </div>
      </div>
    );
  }

  if (!examStarted && resuming) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#F5F5F5" }}>
        <div style={{ width: 400, textAlign: "center" }}>
          <Loader2 className="mx-auto h-8 w-8 animate-spin" style={{ color: "#1565C0" }} />
          <h2 style={{ fontSize: 18, fontWeight: 500, color: "#212121", marginTop: 16 }}>
            Restoring your exam session...
          </h2>
          <p style={{ fontSize: 14, color: "#757575", marginTop: 8 }}>
            Reconnecting to server and restoring your answers.
          </p>
        </div>
      </div>
    );
  }

  // ═══ PRE-EXAM INSTRUCTIONS ═══
  if (!examStarted) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#F5F5F5", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 600, background: "#FFFFFF", borderRadius: 8, border: "1px solid #E0E0E0", padding: 32, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#212121", marginBottom: 20 }}>
            {examMeta?.examName ?? "Exam"}
          </h1>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ background: "#E3F2FD", borderRadius: 6, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: "#212121" }}>{examMeta?.durationMinutes ?? "—"} min</p>
              <p style={{ fontSize: 12, color: "#757575" }}>Duration</p>
            </div>
            <div style={{ background: "#E8F5E9", borderRadius: 6, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: "#212121" }}>{totalQuestions || "—"}</p>
              <p style={{ fontSize: 12, color: "#757575" }}>Questions</p>
            </div>
          </div>

          {/* Sections */}
          {sections.length > 0 && (
            <div style={{ border: "1px solid #E0E0E0", borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Sections</h3>
              {sections.map((s: any, i: number) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span style={{ color: "#212121" }}>{i + 1}. {s.name}</span>
                  <span style={{ color: "#757575" }}>{s.questions.length} questions</span>
                </div>
              ))}
            </div>
          )}

          {examMeta?.instructions && (
            <div style={{ border: "1px solid #E0E0E0", borderRadius: 6, padding: 16, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Instructions</h3>
              <p style={{ fontSize: 13, color: "#757575", whiteSpace: "pre-wrap" }}>{typeof examMeta.instructions === "string" ? examMeta.instructions : (examMeta.instructions as any)?.text ?? ""}</p>
            </div>
          )}

          {/* Warning */}
          <div style={{ background: "#FFF8E1", borderRadius: 6, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: "#E65100" }}>
              ⚠ Once you start, the timer cannot be paused. Your answers are auto-saved. Do not close or refresh the browser.
            </p>
          </div>

          <button
            onClick={() => startExamMutation.mutate()}
            disabled={startExamMutation.isPending || questionsLoading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 44, background: "#1565C0", color: "#FFFFFF", border: "none", borderRadius: 6, fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: startExamMutation.isPending ? 0.7 : 1 }}
          >
            {startExamMutation.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            {startExamMutation.isPending ? "Starting..." : "Start Exam"}
          </button>
        </div>
      </div>
    );
  }

  // ═══ LOADING ═══
  if (questionsLoading || !questions) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#F5F5F5" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#1565C0" }} />
      </div>
    );
  }

  // ═══ MAIN EXAM INTERFACE ═══
  // Layout: Row 0 = Header (spans both cols), Row 1 = Question + Sidebar, Row 2 = Footer (left col only)
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gridTemplateColumns: "1fr 290px", height: "100vh", overflow: "hidden", background: "#F5F5F5" }}>

      {/* ═══ ROW 0: HEADER - Blue bar spanning both columns ═══ */}
      <div style={{ gridColumn: "1 / -1", background: "#1565C0", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left: Logo + Exam Title + Candidate/Section info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Logo placeholder 28x28 */}
          <div style={{ width: 28, height: 28, borderRadius: 4, background: "#0D47A1", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#FFFFFF", fontSize: 14, fontWeight: 700 }}>E</span>
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF" }}>
              {examMeta?.examName ?? "Exam"}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginLeft: 12 }}>
              {examMeta?.candidateName ?? ""}{activeSection ? ` | ${activeSection.name}` : ""}
            </span>
          </div>
        </div>

        {/* Right: Connection dot + Timer */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Connection status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4CAF50" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Online</span>
          </div>
          {/* Timer box */}
          <div style={{ background: "#FFF8E1", borderRadius: 6, padding: "6px 12px" }}>
            <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "Consolas, monospace", color: "#E65100" }}>
              {formatTime(remainingSecs)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ ROW 1, COL 1: QUESTION CONTENT (left area, scrollable) ═══ */}
      <div style={{ overflow: "auto", padding: "24px 20px 20px 12px", paddingLeft: 24 }}>
        {/* Question number badge + Marks badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ background: "#E3F2FD", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "#1565C0" }}>
            Question {currentIndex + 1} of {activeSectionQuestions.length}
          </span>
          <span style={{ background: "#F5F5F5", borderRadius: 4, padding: "5px 10px", fontSize: 12, color: "#757575" }}>
            Marks: +1 / -0
          </span>
        </div>

        {/* Question text */}
        <p style={{ fontSize: 16, lineHeight: "26px", color: "#212121", marginBottom: 24, whiteSpace: "pre-wrap" }}>
          {getQuestionText(currentQuestion?.content)}
        </p>

        {/* MCQ Options */}
        {currentQuestion && getOptions(currentQuestion).length > 0 && (
          <div>
            {getOptions(currentQuestion).map((opt) => {
              const isSelected = answers[currentQuestion.id] === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => handleAnswerSelect(currentQuestion.id, { selectedOptionId: opt.id }, opt.id)}
                  style={{
                    margin: "4px 0",
                    borderRadius: 6,
                    border: isSelected ? "1.5px solid #1565C0" : "1px solid #E0E0E0",
                    background: isSelected ? "#E3F2FD" : "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 12px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name={`q-${currentQuestion.id}`}
                      checked={isSelected}
                      onChange={() => handleAnswerSelect(currentQuestion.id, { selectedOptionId: opt.id }, opt.id)}
                      style={{ width: 16, height: 16, accentColor: "#1565C0" }}
                    />
                    <span style={{ fontSize: 15, color: "#212121" }}>{opt.label}</span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {/* Free text input */}
        {currentQuestion && getOptions(currentQuestion).length === 0 && (
          <div>
            <p style={{ fontSize: 14, color: "#757575", marginBottom: 8 }}>Your Answer:</p>
            <textarea
              rows={6}
              placeholder="Type your answer here..."
              value={answers[currentQuestion.id] ?? ""}
              onChange={(e) => handleAnswerSelect(currentQuestion.id, { textInput: e.target.value }, e.target.value)}
              style={{ width: "100%", fontSize: 15, padding: 12, border: "1px solid #E0E0E0", borderRadius: 6, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
        )}
      </div>

      {/* ═══ ROW 1, COL 2: RIGHT SIDEBAR (290px) ═══ */}
      <div style={{ background: "#FAFAFA", borderLeft: "1px solid #E0E0E0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Scrollable content area */}
        <div style={{ flex: 1, overflow: "auto", margin: 16 }}>

          {/* 1. Question Palette */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Question Palette</h4>
            <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: 10, maxHeight: 160, overflow: "auto" }}>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {activeSectionQuestions.map((q: CandidateQuestion, i: number) => {
                  const isActive = i === currentIndex;
                  const isAnswered = !!answers[q.id];
                  const isMarked = markedForReview.has(q.id);

                  let bg = "#EF5350"; // Not answered (red)
                  if (isActive) bg = "#1976D2"; // Current (blue)
                  else if (isMarked) bg = "#FFA726"; // Marked (orange)
                  else if (isAnswered) bg = "#66BB6A"; // Answered (green)

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(i)}
                      style={{
                        width: 36, height: 36, margin: 2,
                        border: "none", borderRadius: 6,
                        fontSize: 12, fontWeight: 700,
                        background: bg, color: "#FFFFFF",
                        cursor: "pointer",
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. Exam Summary */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Exam Summary</h4>
            <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#66BB6A" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Answered: {answeredCount}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#EF5350" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Not Answered: {unansweredCount}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FFA726" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Marked: {markedCount}</span>
              </div>
              <div style={{ borderTop: "1px solid #E0E0E0", margin: "8px 0" }} />
              <div style={{ fontSize: 12, color: "#212121", marginBottom: 4 }}>
                Current Question: {currentIndex + 1}/{activeSectionQuestions.length}
              </div>
              <div style={{ fontSize: 12, color: "#E65100", marginBottom: 4 }}>
                Time Remaining: {formatTime(remainingSecs)}
              </div>
              <div style={{ fontSize: 12, color: "#4CAF50" }}>
                Connection: Online
              </div>
            </div>
          </div>

          {/* 3. Calculator */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Calculator</h4>
            <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: 10 }}>
              {/* Display */}
              <div style={{ background: "#F5F5F5", borderRadius: 4, padding: "8px 10px", marginBottom: 8, textAlign: "right" }}>
                <span style={{ fontFamily: "Consolas, monospace", fontSize: 18, fontWeight: 700, color: "#212121" }}>
                  {calculator.display}
                </span>
              </div>
              {/* Buttons: 4 columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 2 }}>
                {["7","8","9","÷","4","5","6","×","1","2","3","-","0",".","=","+","C"].map((btn) => {
                  const isOperator = ["+","-","×","÷"].includes(btn);
                  const isClear = btn === "C";
                  const isEquals = btn === "=";
                  let btnBg = "#FFFFFF";
                  let btnColor = "#212121";
                  let btnBorder = "1px solid #E0E0E0";
                  if (isOperator) { btnColor = "#1565C0"; }
                  if (isClear) { btnColor = "#D32F2F"; }
                  if (isEquals) { btnBg = "#1565C0"; btnColor = "#FFFFFF"; btnBorder = "none"; }
                  const gridCol = isClear ? "span 4" : undefined;
                  return (
                    <button
                      key={btn}
                      onClick={() => calculator.press(btn)}
                      style={{
                        gridColumn: gridCol,
                        height: 30, margin: 2,
                        background: btnBg, color: btnColor,
                        border: btnBorder, borderRadius: 4,
                        fontSize: 13, fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {btn}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Rules & Regulations */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Rules & Regulations</h4>
            <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 11, color: "#757575", margin: "4px 0" }}>• Do not switch tabs or windows</p>
              <p style={{ fontSize: 11, color: "#757575", margin: "4px 0" }}>• Do not use external resources</p>
              <p style={{ fontSize: 11, color: "#757575", margin: "4px 0" }}>• Right-click is disabled</p>
              <p style={{ fontSize: 11, color: "#757575", margin: "4px 0" }}>• Violations are monitored and reported</p>
              <p style={{ fontSize: 11, color: "#757575", margin: "4px 0" }}>• Exam auto-submits when time expires</p>
            </div>
          </div>

          {/* 5. Legend */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "#212121", marginBottom: 8 }}>Legend</h4>
            <div style={{ background: "#FFFFFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#1976D2" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Current</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#66BB6A" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Answered</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#EF5350" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Not Answered</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: "#FFA726" }} />
                <span style={{ fontSize: 12, color: "#212121" }}>Marked for Review</span>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Exam button - docked at bottom */}
        <div style={{ padding: 16, borderTop: "1px solid #E0E0E0" }}>
          <button
            onClick={() => setShowSubmitDialog(true)}
            style={{
              width: "100%", padding: "12px 16px",
              background: "#E53935", color: "#FFFFFF",
              border: "none", borderRadius: 6,
              fontSize: 14, fontWeight: 600,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#C62828"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#E53935"; }}
          >
            ⚠ Submit Exam
          </button>
        </div>
      </div>

      {/* ═══ ROW 2: FOOTER (left column only) - White bg, border-top ═══ */}
      <div style={{ gridColumn: "1 / 2", background: "#FFFFFF", borderTop: "1px solid #E0E0E0", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        {/* Previous button - SecondaryButton style */}
        {!isFirstQuestion && (
          <button
            onClick={handlePrev}
            style={{
              padding: "10px 18px",
              background: "#FFFFFF", color: "#212121",
              border: "1px solid #E0E0E0", borderRadius: 6,
              fontSize: 13, fontWeight: 500,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#F5F5F5"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#FFFFFF"; }}
          >
            ← Previous
          </button>
        )}

        {/* Clear Answer - SecondaryButton */}
        <button
          onClick={handleClearAnswer}
          style={{
            padding: "10px 18px",
            background: "#FFFFFF", color: "#757575",
            border: "1px solid #E0E0E0", borderRadius: 6,
            fontSize: 13, fontWeight: 500,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#F5F5F5"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#FFFFFF"; }}
        >
          Clear
        </button>

        {/* Mark for Review - SecondaryButton, orange when active */}
        <button
          onClick={handleMarkForReview}
          style={{
            padding: "10px 18px",
            background: currentQuestion && markedForReview.has(currentQuestion.id) ? "#FFF8E1" : "#FFFFFF",
            color: currentQuestion && markedForReview.has(currentQuestion.id) ? "#F57C00" : "#212121",
            border: currentQuestion && markedForReview.has(currentQuestion.id) ? "1px solid #F57C00" : "1px solid #E0E0E0",
            borderRadius: 6,
            fontSize: 13, fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {currentQuestion && markedForReview.has(currentQuestion.id) ? "✓ Marked" : "⚑ Mark for Review"}
        </button>

        {/* Next button - PrimaryButton style */}
        {!isLastQuestion && (
          <button
            onClick={handleNext}
            style={{
              padding: "10px 18px",
              background: "#1565C0", color: "#FFFFFF",
              border: "none", borderRadius: 6,
              fontSize: 13, fontWeight: 500,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#0D47A1"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#1565C0"; }}
          >
            Next →
          </button>
        )}
      </div>

      {/* ═══ SUBMIT DIALOG ═══ */}
      {showSubmitDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
          <div style={{ width: 500, background: "#FFFFFF", borderRadius: 8, border: "1px solid #E0E0E0", padding: 0 }}>
            <div style={{ padding: 40 }}>
              {/* Title */}
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#212121", textAlign: "center", marginBottom: 30 }}>
                Submit Exam
              </h2>

              {/* Summary Card */}
              <div style={{ background: "#F5F5F5", borderRadius: 8, padding: 24, marginBottom: 30 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12 }}>
                  <span style={{ color: "#212121" }}>Total Questions</span>
                  <span style={{ fontWeight: 600, color: "#212121" }}>{totalQuestions}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12 }}>
                  <span style={{ color: "#66BB6A" }}>Answered</span>
                  <span style={{ fontWeight: 600, color: "#66BB6A" }}>{answeredCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12 }}>
                  <span style={{ color: "#EF5350" }}>Not Answered</span>
                  <span style={{ fontWeight: 600, color: "#EF5350" }}>{unansweredCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "#FFA726" }}>Marked for Review</span>
                  <span style={{ fontWeight: 600, color: "#FFA726" }}>{markedCount}</span>
                </div>
              </div>

              {/* Warning */}
              <p style={{ fontSize: 13, color: "#E53935", textAlign: "center", marginBottom: 20 }}>
                Are you sure you want to submit? This action cannot be undone.
              </p>

              {/* Buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 20px 1fr", marginTop: 10 }}>
                <button
                  onClick={() => setShowSubmitDialog(false)}
                  disabled={submitting}
                  style={{ height: 44, fontSize: 15, background: "#FFFFFF", color: "#212121", border: "1px solid #E0E0E0", borderRadius: 6, cursor: "pointer" }}
                >
                  Go Back
                </button>
                <div />
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ height: 44, fontSize: 15, fontWeight: 600, background: "#E53935", color: "#FFFFFF", border: "none", borderRadius: 6, cursor: "pointer", opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? "Submitting..." : "Confirm Submit"}
                </button>
              </div>

              {/* Loading bar */}
              {submitting && (
                <div style={{ height: 3, marginTop: 15, background: "#E3F2FD", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "40%", background: "#1565C0", animation: "loadingSlide 1.5s infinite" }} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { eq, inArray } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
    answers,
    attempts,
    examBatches,
    examQuestions,
    examSections,
    exams,
    questionOptions,
    questions,
} from "../../database/schemas/index.js";

export interface QuestionGradeResult {
  questionId: string;
  isCorrect: boolean;
  isPartial: boolean;
  marksAwarded: number;
  status: string;
}

export interface SectionGradeResult {
  sectionId: string;
  sectionName: string;
  totalMarks: number;
  marksObtained: number;
  netScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  questionResults: QuestionGradeResult[];
}

export interface AttemptGradeResult {
  attemptId: string;
  totalMarks: number;
  marksObtained: number;
  netScore: number;
  sectionResults: SectionGradeResult[];
  questionResults: QuestionGradeResult[];
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  totalQuestions: number;
}

interface CorrectOptionMap {
  [questionId: string]: string[];
}

interface ExamMetaMap {
  [questionId: string]: {
    sectionId: string;
    sectionName: string;
    type: string;
  };
}

export async function gradeAttempt(
  attemptId: string,
): Promise<AttemptGradeResult> {
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
  });

  if (!attempt) {
    throw new Error(`Attempt ${attemptId} not found`);
  }

  const submittedStatuses = ["submitted", "auto_submitted", "force_submitted"];
  if (!submittedStatuses.includes(attempt.status)) {
    throw new Error(
      `Attempt ${attemptId} cannot be graded — status is ${attempt.status}, must be submitted/auto_submitted/force_submitted`,
    );
  }

  const examBatch = await db
    .select()
    .from(examBatches)
    .where(eq(examBatches.id, attempt.examBatchId))
    .limit(1);

  if (!examBatch[0]) {
    throw new Error(`Exam batch not found for attempt ${attemptId}`);
  }

  const batch = examBatch[0];

  // Fetch exam to get totalMarks
  const [exam] = await db
    .select({ totalMarks: exams.totalMarks })
    .from(exams)
    .where(eq(exams.id, batch.examId))
    .limit(1);
  if (!exam) {
    throw new Error(`Exam not found for attempt ${attemptId}`);
  }

  const sections = await db
    .select()
    .from(examSections)
    .where(eq(examSections.examId, batch.examId));

  const sectionIds = sections.map((s) => s.id);

  const examQs = await db
    .select()
    .from(examQuestions)
    .where(inArray(examQuestions.examSectionId, sectionIds));

  const questionIds = examQs.map((eq_) => eq_.questionId);

  const allQuestions = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, questionIds));

  const allOptions = await db
    .select()
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, questionIds));

  const candidateAnswers = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  const correctOptionMap: CorrectOptionMap = {};
  for (const opt of allOptions) {
    if (opt.isCorrect) {
      if (!correctOptionMap[opt.questionId]) {
        correctOptionMap[opt.questionId] = [];
      }
      correctOptionMap[opt.questionId].push(opt.id);
    }
  }

  const examMetaMap: ExamMetaMap = {};
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  for (const eq_ of examQs) {
    const section = sectionMap.get(eq_.examSectionId);
    const question = allQuestions.find((q) => q.id === eq_.questionId);
    examMetaMap[eq_.questionId] = {
      sectionId: eq_.examSectionId,
      sectionName: section?.name ?? "Unknown",
      type: question?.type ?? "unknown",
    };
  }

  // Auto-calculate marks per question: totalMarks / questionCount
  const marksPerQuestion =
    examQs.length > 0 ? parseFloat(exam.totalMarks) / examQs.length : 0;

  const answerMap = new Map(candidateAnswers.map((a) => [a.questionId, a]));

  const questionResults: QuestionGradeResult[] = [];
  const sectionResultsMap = new Map<string, QuestionGradeResult[]>();

  for (const eq_ of examQs) {
    const questionId = eq_.questionId;
    const meta = examMetaMap[questionId];
    const candidateAnswer = answerMap.get(questionId);

    const result = gradeQuestion(
      questionId,
      meta.type,
      marksPerQuestion,
      candidateAnswer,
      correctOptionMap[questionId] ?? [],
    );

    questionResults.push(result);

    if (!sectionResultsMap.has(meta.sectionId)) {
      sectionResultsMap.set(meta.sectionId, []);
    }
    sectionResultsMap.get(meta.sectionId)!.push(result);
  }

  const sectionResults: SectionGradeResult[] = [];
  for (const section of sections) {
    const sResults = sectionResultsMap.get(section.id) ?? [];
    const marksObtained = sResults
      .filter((r) => r.isCorrect)
      .reduce((sum, r) => sum + r.marksAwarded, 0);

    sectionResults.push({
      sectionId: section.id,
      sectionName: section.name,
      totalMarks: parseFloat(section.totalMarks),
      marksObtained,
      netScore: marksObtained,
      correctCount: sResults.filter((r) => r.isCorrect).length,
      incorrectCount: sResults.filter(
        (r) => !r.isCorrect && r.status === "answered",
      ).length,
      unattemptedCount: sResults.filter(
        (r) => r.status === "not_visited" || r.status === "visited",
      ).length,
      questionResults: sResults,
    });
  }

  const totalMarks = sectionResults.reduce((sum, s) => sum + s.totalMarks, 0);
  const marksObtained = sectionResults.reduce(
    (sum, s) => sum + s.marksObtained,
    0,
  );
  const netScore = marksObtained;

  const correctCount = questionResults.filter((r) => r.isCorrect).length;
  const incorrectCount = questionResults.filter(
    (r) => !r.isCorrect && r.status === "answered",
  ).length;
  const unattemptedCount = questionResults.filter(
    (r) => r.status === "not_visited" || r.status === "visited",
  ).length;

  return {
    attemptId,
    totalMarks,
    marksObtained,
    netScore,
    sectionResults,
    questionResults,
    correctCount,
    incorrectCount,
    unattemptedCount,
    totalQuestions: questionResults.length,
  };
}

function gradeQuestion(
  questionId: string,
  type: string,
  marks: number,
  candidateAnswer: typeof answers.$inferSelect | undefined,
  correctOptionIds: string[],
): QuestionGradeResult {
  const status = candidateAnswer?.status ?? "not_visited";

  if (
    status === "not_visited" ||
    status === "visited" ||
    !candidateAnswer?.answerDataJson
  ) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const answerData = candidateAnswer.answerDataJson as Record<string, unknown>;

  switch (type) {
    case "mcq_single":
    case "true_false":
      return gradeMcqSingle(
        questionId,
        marks,
        status,
        answerData,
        correctOptionIds,
      );

    case "mcq_multiple":
      return gradeMcqMultiple(
        questionId,
        marks,
        status,
        answerData,
        correctOptionIds,
      );

    case "numerical":
      return gradeNumerical(
        questionId,
        marks,
        status,
        answerData,
        correctOptionIds,
      );

    case "fill_in_blank":
      return gradeFillInBlank(
        questionId,
        marks,
        status,
        answerData,
        correctOptionIds,
      );

    default:
      return {
        questionId,
        isCorrect: false,
        isPartial: false,
        marksAwarded: 0,
        status: "answered",
      };
  }
}

export function gradeMcqSingle(
  questionId: string,
  marks: number,
  status: string,
  answerData: Record<string, unknown>,
  correctOptionIds: string[],
): QuestionGradeResult {
  const selectedOptionId = answerData.selectedOptionId as string | undefined;

  if (!selectedOptionId) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const isCorrect = correctOptionIds.includes(selectedOptionId);

  return {
    questionId,
    isCorrect,
    isPartial: false,
    marksAwarded: isCorrect ? marks : 0,
    status,
  };
}

export function gradeMcqMultiple(
  questionId: string,
  marks: number,
  status: string,
  answerData: Record<string, unknown>,
  correctOptionIds: string[],
): QuestionGradeResult {
  const selectedOptionIds = (answerData.selectedOptionIds as string[]) ?? [];

  if (selectedOptionIds.length === 0) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const correctSelected = selectedOptionIds.filter((id) =>
    correctOptionIds.includes(id),
  );
  const incorrectSelected = selectedOptionIds.filter(
    (id) => !correctOptionIds.includes(id),
  );

  if (
    correctSelected.length === correctOptionIds.length &&
    incorrectSelected.length === 0
  ) {
    return {
      questionId,
      isCorrect: true,
      isPartial: false,
      marksAwarded: marks,
      status,
    };
  }

  if (correctSelected.length > 0 && incorrectSelected.length === 0) {
    const partialMarks =
      (marks * correctSelected.length) / correctOptionIds.length;
    return {
      questionId,
      isCorrect: false,
      isPartial: true,
      marksAwarded: partialMarks,
      status,
    };
  }

  return {
    questionId,
    isCorrect: false,
    isPartial: false,
    marksAwarded: 0,
    status,
  };
}

export function gradeNumerical(
  questionId: string,
  marks: number,
  status: string,
  answerData: Record<string, unknown>,
  correctOptionIds: string[],
): QuestionGradeResult {
  const candidateValue = answerData.numericalAnswer as
    | number
    | string
    | undefined;

  if (
    candidateValue === undefined ||
    candidateValue === null ||
    candidateValue === ""
  ) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const candidateNum = parseFloat(String(candidateValue));
  const correctNum =
    correctOptionIds.length > 0 ? parseFloat(correctOptionIds[0]) : NaN;

  if (isNaN(candidateNum) || isNaN(correctNum)) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const tolerance = 0.01;
  const isCorrect = Math.abs(candidateNum - correctNum) <= tolerance;

  return {
    questionId,
    isCorrect,
    isPartial: false,
    marksAwarded: isCorrect ? marks : 0,
    status,
  };
}

export function gradeFillInBlank(
  questionId: string,
  marks: number,
  status: string,
  answerData: Record<string, unknown>,
  correctOptionIds: string[],
): QuestionGradeResult {
  const candidateText = (answerData.textInput as string) ?? "";

  if (!candidateText.trim()) {
    return {
      questionId,
      isCorrect: false,
      isPartial: false,
      marksAwarded: 0,
      status,
    };
  }

  const correctText = correctOptionIds[0] ?? "";
  const isCorrect =
    candidateText.trim().toLowerCase() === correctText.trim().toLowerCase();

  return {
    questionId,
    isCorrect,
    isPartial: false,
    marksAwarded: isCorrect ? marks : 0,
    status,
  };
}

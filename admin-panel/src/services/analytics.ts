import api from "./api.js";

export interface ItemAnalysisRow {
  questionId: string;
  totalAttempts: number;
  attempted: number;
  correct: number;
  incorrect: number;
  notVisited: number;
  difficultyIndex: number;
  discriminationIndex: number;
  attemptRate: number;
  correctRate: number;
}

export interface SectionAnalysisRow {
  sectionId: string;
  sectionName: string;
  totalMarks: number;
  avgMarksObtained: number;
  avgCorrectCount: number;
  avgIncorrectCount: number;
  candidateCount: number;
}

export const analyticsService = {
  getItemAnalysis: (examBatchId: string) =>
    api.get<unknown, { success: boolean; items: ItemAnalysisRow[] }>(
      `/analytics/batch/${examBatchId}/item-analysis`,
    ),

  getSectionAnalysis: (examBatchId: string) =>
    api.get<unknown, { success: boolean; sections: SectionAnalysisRow[] }>(
      `/analytics/batch/${examBatchId}/section-analysis`,
    ),
};

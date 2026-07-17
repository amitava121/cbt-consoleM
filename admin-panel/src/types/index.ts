export type UserRole =
  | "super_admin"
  | "exam_admin"
  | "proctor"
  | "question_author"
  | "candidate";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  phone?: string;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: UserRole;
  phone?: string;
  isActive?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  description?: string | null;
  parentTopicId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type QuestionType =
  | "mcq_single"
  | "mcq_multiple"
  | "fill_in_blank"
  | "essay"
  | "true_false"
  | "matching"
  | "assertion_reason"
  | "comprehension"
  | "drag_drop"
  | "image_based"
  | "audio_video"
  | "numerical"
  | "matrix_match";

export type DifficultyLevel = "easy" | "medium" | "hard" | "very_hard";

export type CognitiveLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export interface QuestionOption {
  id?: string;
  questionId?: string;
  optionText: string;
  isCorrect: boolean;
  displayOrder: number;
}

export interface Question {
  id: string;
  questionBankId: string;
  subjectId: string;
  topicId?: string | null;
  type: QuestionType;
  difficulty: DifficultyLevel;
  cognitiveLevel?: CognitiveLevel | null;
  marks: string;
  negativeMarks: string;
  estimatedTimeSecs?: number | null;
  contentJson: Record<string, unknown>;
  mediaUrlsJson?: string[] | null;
  solutionJson?: Record<string, unknown> | null;
  isActive: boolean;
  version: number;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  usageCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  options?: QuestionOption[];
  tags?: string[];
}

export interface CreateQuestionInput {
  questionBankId: string;
  subjectId: string;
  topicId?: string | null;
  type: QuestionType;
  difficulty: DifficultyLevel;
  cognitiveLevel?: CognitiveLevel | null;
  marks: number;
  negativeMarks?: number;
  estimatedTimeSecs?: number | null;
  content: { text: string; latex?: string | null; passageId?: string | null };
  mediaUrls?: string[];
  options?: { text: string; isCorrect: boolean; displayOrder: number }[];
  solution?: { text?: string; explanation?: string } | null;
  tags?: string[];
}

export interface QuestionVersion {
  id: string;
  questionId: string;
  versionNumber: number;
  contentJson: Record<string, unknown>;
  changedBy: string;
  changeReason?: string | null;
  createdAt: string;
}

export interface Institution {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstitutionInput {
  name: string;
  code: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface UpdateInstitutionInput {
  name?: string;
  code?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  isActive?: boolean;
}

export interface Center {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  address?: string | null;
  capacity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  institutionName?: string;
}

export interface CreateCenterInput {
  institutionId: string;
  name: string;
  code: string;
  address?: string;
  capacity?: number;
}

export interface UpdateCenterInput {
  name?: string;
  code?: string;
  address?: string;
  capacity?: number;
  isActive?: boolean;
}

export interface Batch {
  id: string;
  centerId: string;
  name: string;
  code: string;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  centerName?: string;
  institutionName?: string;
}

export interface CreateBatchInput {
  centerId: string;
  name: string;
  code: string;
  startDate: string;
  endDate?: string;
}

export interface UpdateBatchInput {
  name?: string;
  code?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

/* ---------- Exam Types ---------- */

export type SelectionStrategy = "static" | "random" | "hybrid";
export type NavigationMode = "free" | "linear" | "section_free";

export interface ExamSection {
  id: string;
  examId: string;
  name: string;
  sectionOrder: number;
  durationMinutes?: number | null;
  totalMarks: string;
  negativeMarkingPercentage: string;
  questionCount: number;
  navigationMode?: NavigationMode | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  instructionsJson?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  questions?: ExamQuestionRef[];
}

export interface ExamQuestionRef {
  id?: string;
  examSectionId: string;
  questionId: string;
  displayOrder: number;
  marks: string;
  negativeMarks: string;
  isOptional: boolean;
}

export interface Exam {
  id: string;
  name: string;
  description?: string | null;
  code: string;
  durationMinutes: number;
  totalMarks: string;
  passingMarks?: string | null;
  hasNegativeMarking: boolean;
  selectionStrategy: SelectionStrategy;
  navigationMode: NavigationMode;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  instructionsJson?: Record<string, unknown> | null;
  resultVisibility: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sections?: ExamSection[];
}

export interface CreateExamInput {
  name: string;
  code: string;
  description?: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks?: number;
  hasNegativeMarking?: boolean;
  selectionStrategy?: SelectionStrategy;
  navigationMode?: NavigationMode;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  instructions?: { title?: string; body?: string; rules?: string[] };
  resultVisibility?: string;
}

export interface UpdateExamInput extends Partial<CreateExamInput> {}

export interface CreateSectionInput {
  name: string;
  sectionOrder: number;
  durationMinutes?: number;
  totalMarks: number;
  negativeMarkingPercentage?: number;
  questionCount: number;
  navigationMode?: NavigationMode;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  instructions?: Record<string, unknown>;
}

export interface AddExamQuestionsInput {
  questionIds: string[];
  marks: number;
  negativeMarks?: number;
  isOptional?: boolean;
}

/* ---------- Exam Batch Types ---------- */

export type ExamBatchStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "active"
  | "paused"
  | "submission_window"
  | "finished"
  | "results_published"
  | "archived";

export interface ExamBatch {
  id: string;
  examId: string;
  batchId: string | null;
  centerId: string | null;
  name: string;
  status: ExamBatchStatus;
  shiftNumber: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  gracePeriodMinutes: number;
  instructionsJson: Record<string, unknown> | null;
  settingsJson: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamBatchListItem {
  id: string;
  examId: string;
  batchId: string | null;
  centerId: string | null;
  name: string;
  status: ExamBatchStatus;
  shiftNumber: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  gracePeriodMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExamBatchDetail extends ExamBatch {
  schedules: ExamSchedule[];
  candidateCount: number;
}

export interface ExamSchedule {
  id: string;
  examBatchId: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateExamBatchInput {
  examId: string;
  batchId?: string | null;
  centerId?: string | null;
  name: string;
  shiftNumber?: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
  gracePeriodMinutes?: number;
  instructions?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface UpdateExamBatchInput extends Partial<CreateExamBatchInput> {}

export interface ExamBatchCandidate {
  id: string;
  candidateId: string;
  assignedAt: string;
  rollNumber: string | null;
  admitCardNumber: string | null;
  userId: string;
  isActive: boolean;
}

export interface ExamBatchAttempt {
  id: string;
  candidateId: string;
  deviceId: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  remainingTimeSecs: number | null;
  isReconnected: boolean;
  reconnectedCount: number;
}

export interface ExamBatchMonitor {
  id: string;
  name: string;
  status: ExamBatchStatus;
  examId: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  totalCandidates: number;
  attemptStatusBreakdown: Record<string, number>;
}

export interface AssignCandidatesInput {
  candidateIds: string[];
}

/* ---------- Candidate Types ---------- */

export interface CandidateListItem {
  id: string;
  userId: string;
  batchId: string | null;
  rollNumber: string | null;
  admitCardNumber: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  email: string;
  fullName: string;
  phone: string | null;
  batchName: string | null;
}

export interface CandidateDetail extends CandidateListItem {
  centerName: string | null;
}

export interface CreateCandidateInput {
  email: string;
  fullName: string;
  password: string;
  batchId?: string | null;
  rollNumber?: string;
  admitCardNumber?: string;
  photoUrl?: string;
  phone?: string;
}

export interface UpdateCandidateInput {
  fullName?: string;
  batchId?: string | null;
  rollNumber?: string;
  admitCardNumber?: string;
  photoUrl?: string;
  phone?: string;
  isActive?: boolean;
}

export interface BulkImportCandidateRow {
  email: string;
  fullName: string;
  rollNumber?: string;
  admitCardNumber?: string;
  phone?: string;
}

export interface BulkImportInput {
  batchId?: string | null;
  candidates: BulkImportCandidateRow[];
}

export interface BulkImportResult {
  message: string;
  imported: number;
  skipped: number;
}

/* ---------- Device Types ---------- */

export type DeviceStatus =
  | "registered"
  | "active"
  | "suspended"
  | "decommissioned";

export interface DeviceListItem {
  id: string;
  deviceId: string;
  deviceName: string | null;
  macAddress: string;
  hardwareHash: string;
  ipAddress: string | null;
  centerId: string | null;
  status: DeviceStatus;
  registeredBy: string;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  centerName: string | null;
}

export interface DeviceDetail extends DeviceListItem {}

export interface RegisterDeviceInput {
  deviceId: string;
  deviceName?: string;
  macAddress: string;
  hardwareHash: string;
  ipAddress?: string;
  centerId?: string | null;
}

export interface UpdateDeviceInput {
  deviceName?: string;
  ipAddress?: string;
  centerId?: string | null;
}

export interface ActiveAttempt {
  id: string;
  candidateId: string;
  status: string;
  startedAt: string | null;
  remainingTimeSecs: number;
  isReconnected: boolean;
  reconnectedCount: number;
}

export interface ActiveSessionsResponse {
  examBatchId: string;
  activeCount: number;
  attempts: ActiveAttempt[];
  serverTime: number;
}

export interface AttemptState {
  attemptId: string;
  status: string;
  remainingTimeSecs: number;
  answers: Record<
    string,
    {
      answerData: unknown;
      status: string;
      timeSpentSecs: number;
      isMarkedForReview: boolean;
    }
  >;
  serverTime: number;
}

import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "exam_admin",
  "proctor",
  "question_author",
  "candidate",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "mcq_single",
  "mcq_multiple",
  "fill_in_blank",
  "essay",
  "true_false",
  "matching",
  "assertion_reason",
  "comprehension",
  "drag_drop",
  "image_based",
  "audio_video",
  "numerical",
  "matrix_match",
]);

export const difficultyLevelEnum = pgEnum("difficulty_level", [
  "easy",
  "medium",
  "hard",
  "very_hard",
]);

export const cognitiveLevelEnum = pgEnum("cognitive_level", [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);

export const examStatusEnum = pgEnum("exam_status", [
  "draft",
  "scheduled",
  "published",
  "active",
  "paused",
  "submission_window",
  "finished",
  "results_published",
  "archived",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "not_started",
  "in_progress",
  "paused",
  "submitted",
  "auto_submitted",
  "force_submitted",
  "terminated",
  "abandoned",
]);

export const answerStatusEnum = pgEnum("answer_status", [
  "not_visited",
  "visited",
  "answered",
  "marked_for_review",
  "answered_and_marked",
]);

export const selectionStrategyEnum = pgEnum("selection_strategy", [
  "static",
  "random",
  "hybrid",
]);

export const navigationModeEnum = pgEnum("navigation_mode", [
  "free",
  "linear",
  "section_free",
]);

export const deviceStatusEnum = pgEnum("device_status", [
  "registered",
  "active",
  "suspended",
  "decommissioned",
]);

export const violationTypeEnum = pgEnum("violation_type", [
  "tab_switch",
  "window_blur",
  "process_violation",
  "clipboard_access",
  "screenshot_attempt",
  "vm_detected",
  "multiple_faces",
  "gaze_away",
  "browser_devtools",
  "time_manipulation",
]);

export const violationSeverityEnum = pgEnum("violation_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "read",
  "update",
  "delete",
  "login",
  "logout",
  "export",
  "import",
  "publish",
  "activate",
  "pause",
  "resume",
  "submit",
  "terminate",
  "grade",
  "config_change",
]);

export const proctoringActionEnum = pgEnum("proctoring_action", [
  "warn",
  "pause",
  "terminate",
  "message",
  "dismiss",
]);

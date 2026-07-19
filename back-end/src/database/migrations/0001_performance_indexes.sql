-- Performance optimization indexes
-- These cover common query patterns that were missing dedicated indexes

-- Questions: isActive filter (common on list queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_is_active ON questions (is_active) WHERE is_active = true;

-- Questions: approval status filter (partial index for pending/approved filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_approved ON questions (approved_by) WHERE approved_by IS NOT NULL;

-- Questions: composite for common combined filter (bank + subject)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_questions_bank_subject ON questions (question_bank_id, subject_id);

-- Session tokens: composite for refresh token validation query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_tokens_jti_type_revoked ON session_tokens (token_jti, token_type, is_revoked) WHERE is_revoked = false;

-- Session tokens: cleanup of expired tokens
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_tokens_expires_at ON session_tokens (expires_at) WHERE is_revoked = false;

-- Event logs: composite for time-range queries within an attempt
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_attempt_created ON event_logs (attempt_id, created_at);

-- Violation reports: unresolved violations (proctor dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_violation_reports_unresolved ON violation_reports (attempt_id, severity) WHERE is_resolved = false;

-- Exam batch candidates: candidate lookup (for candidate's exam history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_exam_batch_candidates_candidate_id ON exam_batch_candidates (candidate_id);

-- Answers: status-based queries for grading
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_answers_status ON answers (attempt_id, status);

-- Device registrations: status index (already queried by status in device-routes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_registrations_device_id ON device_registrations (device_id);

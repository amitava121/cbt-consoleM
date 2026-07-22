-- ============================================================
-- Browser UI Validation Exam 2 (BUI-002)
-- 60 GK Questions, 4 options each, 1 correct
-- Duration: 60 minutes, Marks: +1, No negative marking
-- Assigned to candidate ADM-001
-- ============================================================

BEGIN;

-- Exam
INSERT INTO exams (id, name, code, description, duration_minutes, total_marks, passing_marks, has_negative_marking, selection_strategy, navigation_mode, shuffle_questions, shuffle_options, instructions_json, result_visibility, is_active, created_by)
VALUES (
  'bbbbbbbb-5555-6666-7777-888888888888',
  'Browser UI Validation Exam 2',
  'BUI-002',
  'Full UI/UX validation exam for Browser Candidate Portal vs Windows Client comparison.',
  60,
  60,
  24,
  false,
  'static',
  'free',
  false,
  false,
  '{"text": "This exam contains 60 General Knowledge questions. Each question carries 1 mark. There is no negative marking. You may navigate freely between questions."}',
  'delayed',
  true,
  '8b89adb0-4c6a-4209-924d-89e3216eb59b'
);

-- Exam Section
INSERT INTO exam_sections (id, exam_id, name, section_order, duration_minutes, total_marks, negative_marking_percentage, question_count, shuffle_questions, shuffle_options)
VALUES (
  'bbbbbbbb-5555-6666-7777-999999999999',
  'bbbbbbbb-5555-6666-7777-888888888888',
  'General Knowledge',
  1,
  60,
  60,
  0,
  60,
  false,
  false
);

-- Exam Batch (active immediately)
INSERT INTO exam_batches (id, exam_id, name, status, scheduled_start_at, scheduled_end_at, created_by)
VALUES (
  'bbbbbbbb-5555-6666-7777-aaaaaaaaaaaa',
  'bbbbbbbb-5555-6666-7777-888888888888',
  'BUI-002 Validation Batch',
  'active',
  NOW() - INTERVAL '1 hour',
  NOW() + INTERVAL '24 hours',
  '8b89adb0-4c6a-4209-924d-89e3216eb59b'
);

-- Candidate Assignment
INSERT INTO exam_batch_candidates (id, exam_batch_id, candidate_id)
VALUES (
  'bbbbbbbb-5555-6666-7777-cccccccccccc',
  'bbbbbbbb-5555-6666-7777-aaaaaaaaaaaa',
  'aaaaaaaa-1111-2222-3333-444444444444'
);


COMMIT;

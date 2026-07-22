-- ============================================================
-- Browser UI Validation Exam 3 (BUI-003)
-- 60 Unique GK Questions (mixed topics), 4 options each
-- Duration: 60 minutes, Marks: +1, No negative marking
-- Assigned to candidate ADM-001
-- ============================================================

BEGIN;

-- Exam
INSERT INTO exams (id, name, code, description, duration_minutes, total_marks, passing_marks, has_negative_marking, selection_strategy, navigation_mode, shuffle_questions, shuffle_options, instructions_json, result_visibility, is_active, created_by)
VALUES (
  'cccccccc-6666-7777-8888-999999999999',
  'Browser UI Validation Exam 3',
  'BUI-003',
  'Comprehensive exam with 60 mixed-topic GK questions for full UI and functionality validation.',
  60,
  60,
  24,
  false,
  'static',
  'free',
  false,
  false,
  '{"text": "This exam contains 60 questions covering Indian History, Geography, Science, Sports, Constitution, Computer Basics, Mathematics, Logical Reasoning, and World GK. Each question carries 1 mark with no negative marking. You may navigate freely."}',
  'delayed',
  true,
  '8b89adb0-4c6a-4209-924d-89e3216eb59b'
);

-- Exam Section
INSERT INTO exam_sections (id, exam_id, name, section_order, duration_minutes, total_marks, negative_marking_percentage, question_count, shuffle_questions, shuffle_options)
VALUES (
  'cccccccc-6666-7777-8888-aaaaaaaaaaaa',
  'cccccccc-6666-7777-8888-999999999999',
  'General Knowledge (Mixed)',
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
  'cccccccc-6666-7777-8888-bbbbbbbbbbbb',
  'cccccccc-6666-7777-8888-999999999999',
  'BUI-003 Validation Batch',
  'active',
  NOW() - INTERVAL '1 hour',
  NOW() + INTERVAL '48 hours',
  '8b89adb0-4c6a-4209-924d-89e3216eb59b'
);

-- Candidate Assignment
INSERT INTO exam_batch_candidates (id, exam_batch_id, candidate_id)
VALUES (
  'cccccccc-6666-7777-8888-dddddddddddd',
  'cccccccc-6666-7777-8888-bbbbbbbbbbbb',
  'aaaaaaaa-1111-2222-3333-444444444444'
);

COMMIT;

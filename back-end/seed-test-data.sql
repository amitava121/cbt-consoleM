-- CBT Platform Test Data Seed
-- Creates a complete test scenario for manual end-to-end testing

BEGIN;

DO $$
DECLARE
  v_inst_id uuid := '687b53c5-6a16-414f-86c3-ed3e565d58b1';
  v_admin_id uuid := '8b89adb0-4c6a-4209-924d-89e3216eb59b';
  v_candidate_id uuid := 'aaaaaaaa-1111-2222-3333-444444444444';
  v_center_id uuid := 'bbbbbbbb-1111-2222-3333-444444444444';
  v_device_id uuid := 'cccccccc-1111-2222-3333-444444444444';
  v_qbank_id uuid := 'dddddddd-1111-2222-3333-444444444444';
  v_subject_id uuid := 'eeeeeeee-1111-2222-3333-444444444444';
  v_exam_id uuid := 'ffffffff-1111-2222-3333-444444444444';
  v_section_id uuid := '11111111-aaaa-bbbb-cccc-dddddddddddd';
  v_batch_id uuid := '22222222-aaaa-bbbb-cccc-dddddddddddd';
  v_q1_id uuid := '33333333-0001-0001-0001-000000000001';
  v_q2_id uuid := '33333333-0001-0001-0001-000000000002';
  v_q3_id uuid := '33333333-0001-0001-0001-000000000003';
  v_q4_id uuid := '33333333-0001-0001-0001-000000000004';
  v_q5_id uuid := '33333333-0001-0001-0001-000000000005';
  v_pwd_hash text := '$argon2id$v=19$m=65536,t=3,p=1$SNW4gzdT/mUIwM9BuZ8Hog$7zCWIl1hS7L6HkuFLCjHQXNgtMyWCQOPbNLYl78B6FM';
BEGIN

  -- 1. Candidate user (password: Candidate@123)
  INSERT INTO users (id, institution_id, email, password_hash, full_name, role, is_active)
  VALUES (v_candidate_id, v_inst_id, 'candidate@cbe.local', v_pwd_hash, 'Test Candidate', 'candidate', true)
  ON CONFLICT (email) DO UPDATE SET password_hash = v_pwd_hash;

  -- 2. Center
  INSERT INTO centers (id, institution_id, name, code, capacity, is_active)
  VALUES (v_center_id, v_inst_id, 'Main Exam Center', 'CTR-001', 50, true)
  ON CONFLICT (code) DO UPDATE SET name = 'Main Exam Center', id = v_center_id;

  -- 3. Device registration
  DELETE FROM device_registrations WHERE device_id = 'DEV-TEST-001';
  INSERT INTO device_registrations (id, center_id, device_id, device_name, mac_address, hardware_hash, status, registered_by)
  VALUES (v_device_id, v_center_id, 'DEV-TEST-001', 'Development Machine', 'AA:BB:CC:DD:EE:FF', 'dev-test-hash', 'active', v_admin_id);

  -- 4. Subject
  INSERT INTO subjects (id, name, code, is_active)
  VALUES (v_subject_id, 'General Knowledge', 'GK', true)
  ON CONFLICT (code) DO UPDATE SET name = 'General Knowledge';

  -- 5. Question bank
  INSERT INTO question_banks (id, name, is_active, created_by)
  VALUES (v_qbank_id, 'GK Question Bank', true, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- 6. Questions (5 MCQ single-answer)
  INSERT INTO questions (id, question_bank_id, subject_id, type, difficulty, marks, negative_marks, content_json, is_active, approved_by, created_by)
  VALUES
    (v_q1_id, v_qbank_id, v_subject_id, 'mcq_single', 'easy', 4, 1, '{"text":"What is the capital of France?"}', true, v_admin_id, v_admin_id),
    (v_q2_id, v_qbank_id, v_subject_id, 'mcq_single', 'easy', 4, 1, '{"text":"Which planet is known as the Red Planet?"}', true, v_admin_id, v_admin_id),
    (v_q3_id, v_qbank_id, v_subject_id, 'mcq_single', 'medium', 4, 1, '{"text":"Who wrote Romeo and Juliet?"}', true, v_admin_id, v_admin_id),
    (v_q4_id, v_qbank_id, v_subject_id, 'mcq_single', 'medium', 4, 1, '{"text":"What is the largest ocean on Earth?"}', true, v_admin_id, v_admin_id),
    (v_q5_id, v_qbank_id, v_subject_id, 'mcq_single', 'hard', 4, 1, '{"text":"In which year did World War II end?"}', true, v_admin_id, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- 7. Question options
  DELETE FROM question_options WHERE question_id IN (v_q1_id, v_q2_id, v_q3_id, v_q4_id, v_q5_id);

  INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES
    (v_q1_id, 'London', false, 1), (v_q1_id, 'Paris', true, 2), (v_q1_id, 'Berlin', false, 3), (v_q1_id, 'Madrid', false, 4),
    (v_q2_id, 'Venus', false, 1), (v_q2_id, 'Mars', true, 2), (v_q2_id, 'Jupiter', false, 3), (v_q2_id, 'Saturn', false, 4),
    (v_q3_id, 'Charles Dickens', false, 1), (v_q3_id, 'William Shakespeare', true, 2), (v_q3_id, 'Jane Austen', false, 3), (v_q3_id, 'Mark Twain', false, 4),
    (v_q4_id, 'Atlantic Ocean', false, 1), (v_q4_id, 'Indian Ocean', false, 2), (v_q4_id, 'Pacific Ocean', true, 3), (v_q4_id, 'Arctic Ocean', false, 4),
    (v_q5_id, '1943', false, 1), (v_q5_id, '1944', false, 2), (v_q5_id, '1945', true, 3), (v_q5_id, '1946', false, 4);

  -- 8. Exam
  INSERT INTO exams (id, name, code, duration_minutes, total_marks, passing_marks, has_negative_marking, selection_strategy, navigation_mode, shuffle_questions, shuffle_options, result_visibility, is_active, created_by)
  VALUES (v_exam_id, 'Sample MCQ Test', 'TEST-001', 30, 20, 8, true, 'static', 'free', false, false, 'instant', true, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- 9. Exam section
  INSERT INTO exam_sections (id, exam_id, name, section_order, duration_minutes, total_marks, negative_marking_percentage, question_count)
  VALUES (v_section_id, v_exam_id, 'Section A - General Knowledge', 1, 30, 20, 25, 5)
  ON CONFLICT (id) DO NOTHING;

  -- 10. Link questions to exam section
  DELETE FROM exam_questions WHERE exam_section_id = v_section_id;
  INSERT INTO exam_questions (exam_section_id, question_id, display_order, marks, negative_marks) VALUES
    (v_section_id, v_q1_id, 1, 4, 1),
    (v_section_id, v_q2_id, 2, 4, 1),
    (v_section_id, v_q3_id, 3, 4, 1),
    (v_section_id, v_q4_id, 4, 4, 1),
    (v_section_id, v_q5_id, 5, 4, 1);

  -- 11. Exam batch (ACTIVE status — ready for candidates)
  INSERT INTO exam_batches (id, exam_id, center_id, name, status, shift_number, scheduled_start_at, scheduled_end_at, created_by)
  VALUES (v_batch_id, v_exam_id, v_center_id, 'Test Batch - Morning', 'active', 1, NOW(), NOW() + INTERVAL '4 hours', v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- 12. Create candidate record (links user to exam system)
  INSERT INTO candidates (id, user_id, roll_number, admit_card_number, is_active)
  VALUES (v_candidate_id, v_candidate_id, 'ROLL-001', 'ADM-001', true)
  ON CONFLICT (id) DO NOTHING;

  -- 13. Assign candidate to batch
  INSERT INTO exam_batch_candidates (exam_batch_id, candidate_id)
  VALUES (v_batch_id, v_candidate_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Test data seeded successfully!';
  RAISE NOTICE 'Candidate login: candidate@cbe.local / Candidate@123';
  RAISE NOTICE 'Admin login: admin@cbe.local / Admin@123';
  RAISE NOTICE 'Device ID: DEV-TEST-001';
  RAISE NOTICE 'Exam Batch ID: %', v_batch_id;

END $$;

COMMIT;

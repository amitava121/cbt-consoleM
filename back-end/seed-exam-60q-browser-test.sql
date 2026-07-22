-- 60-Question Browser Test Exam
-- For UI and flow testing of the Browser-based Exam Portal

BEGIN;

DO $$
DECLARE
  v_admin_id uuid := '8b89adb0-4c6a-4209-924d-89e3216eb59b';
  v_candidate_id uuid := 'aaaaaaaa-1111-2222-3333-444444444444';
  v_center_id uuid := 'bbbbbbbb-1111-2222-3333-444444444444';
  v_subject_id uuid := 'eeeeeeee-1111-2222-3333-444444444444';
  v_qbank_id uuid := 'dddddddd-4444-5555-6666-777777777777';
  v_exam_id uuid := 'ffffffff-4444-5555-6666-777777777777';
  v_section_id uuid := '11111111-4444-aaaa-bbbb-cccccccccccc';
  v_batch_id uuid := '22222222-4444-bbbb-cccc-dddddddddddd';
  i int;
  q_id uuid;
  q_texts text[] := ARRAY[
    'What is the capital of India?',
    'Which element has the chemical symbol O?',
    'What is 15 × 12?',
    'Who invented the telephone?',
    'Which continent is the largest by area?',
    'What is the boiling point of water in Celsius?',
    'How many days are in a leap year?',
    'Which planet is closest to the Sun?',
    'What is the square root of 144?',
    'Who painted the Mona Lisa?',
    'What is the currency of Japan?',
    'Which organ pumps blood in the human body?',
    'What gas do plants absorb from the atmosphere?',
    'How many bones are in the adult human body?',
    'What is the largest mammal on Earth?',
    'Which language has the most native speakers?',
    'What is the speed of sound in air (approx)?',
    'Who wrote the national anthem of India?',
    'What is the chemical formula of water?',
    'Which is the smallest country in the world?',
    'How many planets are in our solar system?',
    'What is the hardest natural substance?',
    'Which blood group is the universal donor?',
    'What year did India gain independence?',
    'What is the largest desert in the world?',
    'Which metal is liquid at room temperature?',
    'How many chromosomes do humans have?',
    'What is the national bird of India?',
    'Which vitamin is produced by sunlight?',
    'What is the SI unit of force?',
    'Who discovered gravity?',
    'What is the largest ocean on Earth?',
    'Which is the longest bone in the human body?',
    'What percentage of Earth surface is water?',
    'Who is known as the Father of Computers?',
    'What is the atomic number of Carbon?',
    'Which country hosted the 2020 Olympics?',
    'What is the full form of DNA?',
    'How many teeth does an adult human have?',
    'What is the national flower of India?',
    'Which gas is most abundant in the atmosphere?',
    'What is the freezing point of water in Fahrenheit?',
    'Who discovered penicillin?',
    'What is the capital of Australia?',
    'Which planet is known as the Morning Star?',
    'How many continents are there on Earth?',
    'What is the chemical symbol for Iron?',
    'Who wrote Romeo and Juliet?',
    'What is the largest organ in the human body?',
    'Which river is the longest in India?',
    'What is the value of Pi (to 2 decimal places)?',
    'Who invented the light bulb?',
    'What is the national animal of India?',
    'Which vitamin prevents scurvy?',
    'How many sides does a hexagon have?',
    'What is the capital of France?',
    'Which planet has the most rings?',
    'What is the boiling point of water in Fahrenheit?',
    'Who is the author of Harry Potter?',
    'What is the smallest prime number?'
  ];
  opts text[][] := ARRAY[
    ARRAY['Mumbai','New Delhi','Kolkata','Chennai'],
    ARRAY['Osmium','Oxygen','Gold','Ozone'],
    ARRAY['170','180','190','200'],
    ARRAY['Thomas Edison','Alexander Graham Bell','Nikola Tesla','James Watt'],
    ARRAY['Africa','Asia','Europe','North America'],
    ARRAY['90°C','100°C','110°C','120°C'],
    ARRAY['364','365','366','367'],
    ARRAY['Venus','Mercury','Earth','Mars'],
    ARRAY['10','11','12','13'],
    ARRAY['Michelangelo','Leonardo da Vinci','Raphael','Donatello'],
    ARRAY['Yuan','Won','Yen','Ringgit'],
    ARRAY['Brain','Liver','Heart','Lungs'],
    ARRAY['Oxygen','Carbon Dioxide','Nitrogen','Hydrogen'],
    ARRAY['196','206','216','226'],
    ARRAY['African Elephant','Blue Whale','Giraffe','Polar Bear'],
    ARRAY['English','Mandarin Chinese','Spanish','Hindi'],
    ARRAY['243 m/s','343 m/s','443 m/s','543 m/s'],
    ARRAY['Bankim Chandra','Rabindranath Tagore','Mahatma Gandhi','Subhas Bose'],
    ARRAY['H2O2','HO','H2O','H3O'],
    ARRAY['Monaco','Vatican City','San Marino','Liechtenstein'],
    ARRAY['7','8','9','10'],
    ARRAY['Gold','Iron','Diamond','Platinum'],
    ARRAY['A','B','AB','O'],
    ARRAY['1945','1947','1949','1950'],
    ARRAY['Gobi','Sahara','Arabian','Kalahari'],
    ARRAY['Iron','Gold','Mercury','Silver'],
    ARRAY['23','44','46','48'],
    ARRAY['Sparrow','Peacock','Parrot','Crow'],
    ARRAY['Vitamin A','Vitamin B','Vitamin C','Vitamin D'],
    ARRAY['Joule','Newton','Watt','Pascal'],
    ARRAY['Einstein','Newton','Galileo','Archimedes'],
    ARRAY['Atlantic','Indian','Pacific','Arctic'],
    ARRAY['Humerus','Femur','Tibia','Spine'],
    ARRAY['51%','61%','71%','81%'],
    ARRAY['Alan Turing','Charles Babbage','John von Neumann','Tim Berners-Lee'],
    ARRAY['4','6','8','12'],
    ARRAY['China','Japan','South Korea','Australia'],
    ARRAY['Deoxyribonucleic Acid','Dinitrogen Acid','Dynamic Nucleic Acid','None'],
    ARRAY['28','30','32','34'],
    ARRAY['Rose','Lotus','Sunflower','Jasmine'],
    ARRAY['Oxygen','Carbon Dioxide','Nitrogen','Argon'],
    ARRAY['0°F','32°F','100°F','212°F'],
    ARRAY['Louis Pasteur','Alexander Fleming','Robert Koch','Edward Jenner'],
    ARRAY['Sydney','Melbourne','Canberra','Perth'],
    ARRAY['Mars','Venus','Jupiter','Saturn'],
    ARRAY['5','6','7','8'],
    ARRAY['Au','Ag','Fe','Cu'],
    ARRAY['Charles Dickens','William Shakespeare','Jane Austen','Mark Twain'],
    ARRAY['Heart','Liver','Skin','Brain'],
    ARRAY['Yamuna','Ganges','Brahmaputra','Godavari'],
    ARRAY['3.12','3.14','3.16','3.18'],
    ARRAY['Nikola Tesla','Thomas Edison','Benjamin Franklin','James Watt'],
    ARRAY['Lion','Tiger','Elephant','Leopard'],
    ARRAY['Vitamin A','Vitamin B','Vitamin C','Vitamin D'],
    ARRAY['4','5','6','7'],
    ARRAY['London','Berlin','Paris','Madrid'],
    ARRAY['Jupiter','Saturn','Uranus','Neptune'],
    ARRAY['100°F','180°F','212°F','250°F'],
    ARRAY['J.K. Rowling','J.R.R. Tolkien','Stephen King','George R.R. Martin'],
    ARRAY['1','2','3','5']
  ];
  correct_idx int[] := ARRAY[2,2,2,2,2,2,3,2,3,2,3,3,2,2,2,2,2,2,3,2,2,3,4,2,2,3,3,2,4,2,2,3,2,3,2,2,2,1,3,2,3,2,2,3,2,3,3,2,3,2,2,2,2,3,3,3,2,3,1,2];
BEGIN
  -- Question Bank
  INSERT INTO question_banks (id, name, is_active, created_by)
  VALUES (v_qbank_id, 'Browser Test Question Bank (60Q)', true, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Exam
  INSERT INTO exams (id, name, code, duration_minutes, total_marks, passing_marks, has_negative_marking, selection_strategy, navigation_mode, shuffle_questions, shuffle_options, result_visibility, is_active, created_by)
  VALUES (v_exam_id, 'Browser UI Test Exam (60 Questions)', 'BTEST-060', 60, 60, 24, false, 'static', 'free', false, false, 'instant', true, v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Section
  INSERT INTO exam_sections (id, exam_id, name, section_order, duration_minutes, total_marks, negative_marking_percentage, question_count)
  VALUES (v_section_id, v_exam_id, 'General Knowledge', 1, null, 60, 0, 60)
  ON CONFLICT (id) DO NOTHING;

  -- Questions + Options + Exam Links
  FOR i IN 1..60 LOOP
    q_id := ('66666666-0001-0001-' || lpad(i::text, 4, '0') || '-000000000000')::uuid;

    INSERT INTO questions (id, question_bank_id, subject_id, type, difficulty, marks, negative_marks, content_json, is_active, approved_by, created_by)
    VALUES (q_id, v_qbank_id, v_subject_id, 'mcq_single',
      (CASE WHEN i <= 20 THEN 'easy' WHEN i <= 40 THEN 'medium' ELSE 'hard' END)::difficulty_level,
      1, 0, json_build_object('text', q_texts[i])::jsonb, true, v_admin_id, v_admin_id)
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM question_options WHERE question_id = q_id;
    INSERT INTO question_options (question_id, option_text, is_correct, display_order) VALUES
      (q_id, opts[i][1], (correct_idx[i] = 1), 1),
      (q_id, opts[i][2], (correct_idx[i] = 2), 2),
      (q_id, opts[i][3], (correct_idx[i] = 3), 3),
      (q_id, opts[i][4], (correct_idx[i] = 4), 4);

    INSERT INTO exam_questions (exam_section_id, question_id, display_order, marks, negative_marks)
    VALUES (v_section_id, q_id, i, 1, 0)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Batch (ACTIVE)
  INSERT INTO exam_batches (id, exam_id, center_id, name, status, shift_number, scheduled_start_at, scheduled_end_at, created_by)
  VALUES (v_batch_id, v_exam_id, v_center_id, 'Browser Test Batch', 'active', 1, NOW(), NOW() + INTERVAL '12 hours', v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Assign candidate
  INSERT INTO exam_batch_candidates (exam_batch_id, candidate_id)
  VALUES (v_batch_id, v_candidate_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ Created: Browser UI Test Exam (60 Questions, 60 min)';
  RAISE NOTICE '✓ Batch ID: 22222222-4444-bbbb-cccc-dddddddddddd';
  RAISE NOTICE '✓ Assigned to candidate ADM-001';
END $$;

COMMIT;

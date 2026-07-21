-- Add subject_id column to exams table
-- Links exams (question papers) to subjects
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);

-- Index for efficient filtering by subject
CREATE INDEX IF NOT EXISTS idx_exams_subject_id ON exams(subject_id);

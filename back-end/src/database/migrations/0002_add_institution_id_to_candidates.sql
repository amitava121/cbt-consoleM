-- Add institution_id to candidates table so candidates can be tracked
-- even when not assigned to a batch
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

-- Backfill institution_id from existing batch assignments
UPDATE candidates
SET institution_id = b.institution_id
FROM batches b
WHERE candidates.batch_id = b.id
  AND candidates.institution_id IS NULL;

-- Add index for institution_id lookups
CREATE INDEX IF NOT EXISTS idx_candidates_institution_id
  ON candidates(institution_id);

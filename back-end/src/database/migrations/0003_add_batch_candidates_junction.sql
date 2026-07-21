-- Create batch_candidates junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS batch_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_candidates_batch_candidate
  ON batch_candidates(batch_id, candidate_id);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_batch_candidates_batch_id
  ON batch_candidates(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_candidates_candidate_id
  ON batch_candidates(candidate_id);

-- Migrate existing batchId assignments from candidates table
INSERT INTO batch_candidates (batch_id, candidate_id)
SELECT batch_id, id FROM candidates WHERE batch_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE "exams" ADD COLUMN "batch_id" uuid REFERENCES "batches"("id") ON DELETE SET NULL;
CREATE INDEX "idx_exams_batch_id" ON "exams" ("batch_id");

CREATE TABLE "batch_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_batch_subjects_batch_subject" UNIQUE("batch_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "batch_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_batch_candidates_batch_candidate" UNIQUE("batch_id","candidate_id")
);
--> statement-breakpoint
ALTER TABLE "centers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "centers" CASCADE;--> statement-breakpoint
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_code_unique";--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "uq_batches_center_id_code";--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_question_bank_id_question_banks_id_fk";
--> statement-breakpoint
ALTER TABLE "exam_batches" DROP CONSTRAINT "exam_batches_center_id_centers_id_fk";
--> statement-breakpoint
ALTER TABLE "batches" DROP CONSTRAINT "batches_center_id_centers_id_fk";
--> statement-breakpoint
ALTER TABLE "device_registrations" DROP CONSTRAINT "device_registrations_center_id_centers_id_fk";
--> statement-breakpoint
DROP INDEX "idx_questions_question_bank_id";--> statement-breakpoint
DROP INDEX "idx_questions_difficulty";--> statement-breakpoint
DROP INDEX "idx_exam_batches_center_id";--> statement-breakpoint
DROP INDEX "idx_device_registrations_center_id";--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "institution_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "institution_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_subjects" ADD CONSTRAINT "batch_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_candidates" ADD CONSTRAINT "batch_candidates_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_candidates" ADD CONSTRAINT "batch_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batch_subjects_batch_id" ON "batch_subjects" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_batch_subjects_subject_id" ON "batch_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_batch_candidates_batch_id" ON "batch_candidates" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_batch_candidates_candidate_id" ON "batch_candidates" USING btree ("candidate_id");--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subjects_institution_id" ON "subjects" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_exam_batch_status" ON "attempts" USING btree ("exam_batch_id","status");--> statement-breakpoint
CREATE INDEX "idx_batches_institution_id" ON "batches" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_institution_id" ON "candidates" USING btree ("institution_id");--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "question_bank_id";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "difficulty";--> statement-breakpoint
ALTER TABLE "exam_batches" DROP COLUMN "center_id";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "center_id";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "start_date";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "end_date";--> statement-breakpoint
ALTER TABLE "device_registrations" DROP COLUMN "center_id";--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "uq_subjects_institution_code" UNIQUE("institution_id","code");--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_code_unique" UNIQUE("code");--> statement-breakpoint
DROP TYPE "public"."difficulty_level";